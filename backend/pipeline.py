"""Pipeline orchestrator: ingest -> transcribe+scenes -> analyze -> cut/crop.

Progress mapping (per spec):
  0-10%   Downloading / Validating
  10-30%  Transcribing (Whisper)
  30-35%  Detecting scenes
  35-50%  Analyzing with Groq (Llama 3.3)
  50-80%  Cutting & cropping clips
  80-95%  (effects/subtitles applied on demand later)
  95-100% Finalizing
"""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

import jobs
import scenes as scenes_mod
import transcriber
import analyzer
import cropper
from config import JOBS_DIR, MIN_DURATION_SEC, MAX_FILE_BYTES
from errors import AppError
from media import probe


def _p(job_id: str, progress: int, step: str, message: str, status: str = None):
    jobs.update_status(job_id, progress=progress, step=step, message=message,
                       status=status)


def _validate_local(job_id: str, source: Path) -> float:
    if source.stat().st_size > MAX_FILE_BYTES:
        raise AppError("FILE_TOO_LARGE")
    info = probe(source)
    duration = info["duration"]
    if duration < MIN_DURATION_SEC:
        raise AppError("VIDEO_TOO_SHORT")
    jobs.set_metadata(job_id, duration=duration)
    return duration


async def run_pipeline(job_id: str, *, source_type: str,
                       url: Optional[str] = None,
                       crop_mode: str = "track",
                       language: Optional[str] = "auto",
                       groq_key: Optional[str] = None,
                       cookies: Optional[str] = None) -> dict:
    """Execute the full pipeline. Returns the result dict."""
    try:
        if not groq_key:
            raise AppError("NO_API_KEY")

        # ---- 1. Ingest -------------------------------------------------
        _p(job_id, 2, "Validasi", "Memvalidasi sumber", status=jobs.STATUS_DOWNLOADING)
        jobs.check_cancelled(job_id)

        if source_type == "youtube":
            import downloader
            _p(job_id, 5, "Downloading", "Mengunduh video 1080p",
               status=jobs.STATUS_DOWNLOADING)
            source = downloader.download(
                job_id, url, cookies=cookies,
                progress_cb=lambda pct: _p(job_id, int(2 + pct * 0.08),
                                           "Downloading",
                                           f"Mengunduh {pct:.0f}%"))
            meta = jobs.get_metadata(job_id) or {}
            duration = float(meta.get("duration") or 0)
            if duration and duration < MIN_DURATION_SEC:
                raise AppError("VIDEO_TOO_SHORT")
        else:
            source = JOBS_DIR / job_id / "source.mp4"
            if not source.exists():
                raise AppError("UNSUPPORTED_FORMAT", detail="source.mp4 tidak ada")
            duration = _validate_local(job_id, source)

        jobs.check_cancelled(job_id)
        _p(job_id, 10, "Transcribing", "Memulai transkripsi",
           status=jobs.STATUS_TRANSCRIBING)

        # ---- 2. Transcribe + scene detect (parallel) -------------------
        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor(max_workers=2) as ex:
            t_future = loop.run_in_executor(
                ex, transcriber.transcribe, job_id, source,
                None if language == "auto" else language,
                lambda frac: _p(job_id, int(10 + frac * 20), "Transcribing",
                                f"Transkripsi {frac * 100:.0f}%",
                                status=jobs.STATUS_TRANSCRIBING))
            s_future = loop.run_in_executor(
                ex, scenes_mod.detect_scenes, job_id, source)
            transcript, _scenes = await asyncio.gather(t_future, s_future)

        jobs.check_cancelled(job_id)
        _p(job_id, 35, "Analyzing", "Mendeteksi momen viral (Groq)",
           status=jobs.STATUS_ANALYZING)

        # ---- 3. Analyze ------------------------------------------------
        text = transcriber.transcript_to_text(transcript)
        moments = analyzer.analyze(job_id, text, duration or transcript["duration"],
                                   groq_key, segments=transcript.get("segments"))
        _p(job_id, 50, "Cutting", "Memotong & crop klip",
           status=jobs.STATUS_CUTTING)

        # ---- 4. Cut & crop (parallel per moment) -----------------------
        clips = cropper.cut_and_crop_all(
            job_id, source, moments, transcript, crop_mode,
            progress_cb=lambda done, total: _p(
                job_id, int(50 + (done / max(1, total)) * 30), "Cutting",
                f"Klip {done}/{total} selesai"))

        _p(job_id, 95, "Finalizing", "Menyiapkan hasil")
        result = {
            "job_id": job_id,
            "crop_mode": crop_mode,
            "language": transcript.get("language"),
            "clips": clips,
        }
        jobs.save_result(job_id, result)
        jobs.remove_source(job_id)
        _p(job_id, 100, "Selesai", f"{len(clips)} klip siap",
           status=jobs.STATUS_DONE)
        return result

    except jobs.JobCancelled:
        jobs.kill_procs(job_id)
        jobs.update_status(job_id, status=jobs.STATUS_CANCELLED,
                           step="Dibatalkan", message="Job dibatalkan pengguna")
        jobs.remove_source(job_id)
        raise
    except AppError as e:
        jobs.kill_procs(job_id)
        jobs.update_status(job_id, status=jobs.STATUS_FAILED, step="Gagal",
                           message=e.args[0], error=e.code)
        raise
    except Exception as e:  # noqa: BLE001
        jobs.kill_procs(job_id)
        jobs.update_status(job_id, status=jobs.STATUS_FAILED, step="Gagal",
                           message=str(e)[:300], error="INTERNAL")
        raise
