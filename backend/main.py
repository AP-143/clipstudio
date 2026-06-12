"""ClipStudio FastAPI server: endpoints, bounded job queue, cancel, cleanup.

Startup sequence:
  yt-dlp -U  ->  cleanup stuck jobs  ->  warm Whisper into GPU  ->  ready
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import (FastAPI, UploadFile, File, Form, Header, HTTPException,
                     WebSocket, WebSocketDisconnect)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

import jobs
import pipeline
import analyzer
from config import (JOBS_DIR, MAX_CONCURRENT_JOBS, JOB_AUTO_DELETE_HOURS,
                    ALLOWED_EXT, MAX_FILE_BYTES)
from errors import AppError

_semaphore: Optional[asyncio.Semaphore] = None
_tasks: dict[str, asyncio.Task] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _semaphore
    _semaphore = asyncio.Semaphore(MAX_CONCURRENT_JOBS)
    # 1. yt-dlp self-update (best effort, off the event loop)
    try:
        import downloader
        await asyncio.to_thread(downloader.update_yt_dlp)
    except Exception:
        pass
    # 2. cleanup stuck jobs
    jobs.cleanup_on_startup()
    jobs.auto_delete(JOB_AUTO_DELETE_HOURS)
    # 3. warm whisper (non-fatal)
    try:
        import transcriber
        asyncio.create_task(asyncio.to_thread(transcriber.warm_up))
    except Exception:
        pass
    yield


app = FastAPI(title="ClipStudio API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _err_response(e: AppError, status: int = 400) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": e.to_dict()})


def _clip_file(job_id: str, index: int, variant: str = "final") -> Path:
    return jobs.clips_dir(job_id) / f"clip_{index}_{variant}.mp4"


def _require_clip(job_id: str, index: int) -> dict:
    result = jobs.get_result(job_id)
    if not result:
        raise HTTPException(404, "Result tidak ditemukan")
    clip = next((c for c in result["clips"] if c["index"] == index), None)
    if not clip:
        raise HTTPException(404, "Klip tidak ditemukan")
    return clip


async def _run_job(job_id: str, **kwargs):
    """Acquire the semaphore then run the pipeline; swallow expected errors."""
    async with _semaphore:
        if jobs.is_cancelled(job_id):
            return
        try:
            await pipeline.run_pipeline(job_id, **kwargs)
        except (AppError, jobs.JobCancelled):
            pass
        except Exception:
            pass
        finally:
            _tasks.pop(job_id, None)


# ---------------------------------------------------------------------------
# Submit / status / cancel
# ---------------------------------------------------------------------------

@app.post("/api/process")
async def process(
    url: Optional[str] = Form(None),
    crop_mode: str = Form("track"),
    language: str = Form("auto"),
    file: Optional[UploadFile] = File(None),
    x_groq_key: Optional[str] = Header(None),
    x_youtube_cookies: Optional[str] = Header(None),
):
    if not x_groq_key:
        return _err_response(AppError("NO_API_KEY"))

    # Cookies arrive base64-encoded (raw newlines are illegal in HTTP headers).
    if x_youtube_cookies:
        try:
            import base64
            x_youtube_cookies = base64.b64decode(x_youtube_cookies).decode("utf-8")
        except Exception:  # noqa: BLE001 — fall back to plain (older clients)
            pass

    if file is not None:
        ext = Path(file.filename or "").suffix.lower()
        if ext not in ALLOWED_EXT:
            return _err_response(AppError("UNSUPPORTED_FORMAT"))
        job_id = jobs.create_job("local", {"video_title": file.filename})
        dest = JOBS_DIR / job_id / "source.mp4"
        size = 0
        with dest.open("wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_FILE_BYTES:
                    out.close()
                    jobs.delete_job(job_id)
                    return _err_response(AppError("FILE_TOO_LARGE"))
                out.write(chunk)
        source_type = "local"
    elif url:
        job_id = jobs.create_job("youtube", {"source_url": url})
        source_type = "youtube"
    else:
        raise HTTPException(400, "Sertakan file atau url")

    task = asyncio.create_task(_run_job(
        job_id, source_type=source_type, url=url, crop_mode=crop_mode,
        language=language, groq_key=x_groq_key, cookies=x_youtube_cookies))
    _tasks[job_id] = task
    return {"job_id": job_id, "status": "queued"}


@app.get("/api/status/{job_id}")
async def status(job_id: str):
    st = jobs.get_status(job_id)
    if not st:
        raise HTTPException(404, "Job tidak ditemukan")
    return st


@app.post("/api/cancel/{job_id}")
async def cancel(job_id: str):
    if not jobs.get_status(job_id):
        raise HTTPException(404, "Job tidak ditemukan")
    jobs.request_cancel(job_id)
    jobs.kill_procs(job_id)
    task = _tasks.get(job_id)
    if task and not task.done():
        task.cancel()
    jobs.update_status(job_id, status=jobs.STATUS_CANCELLED, step="Dibatalkan",
                       message="Job dibatalkan pengguna")
    jobs.remove_source(job_id)
    return {"ok": True, "status": "cancelled"}


@app.get("/api/result/{job_id}")
async def result(job_id: str):
    res = jobs.get_result(job_id)
    if not res:
        raise HTTPException(404, "Hasil belum tersedia")
    res = dict(res)
    res["metadata"] = jobs.get_metadata(job_id)
    return JSONResponse(content=res, headers={"Cache-Control": "no-cache"})


# ---------------------------------------------------------------------------
# Jobs listing / deletion
# ---------------------------------------------------------------------------

@app.get("/api/jobs")
async def list_all_jobs():
    return {"jobs": jobs.list_jobs()}


@app.delete("/api/jobs/{job_id}")
async def delete_job(job_id: str):
    task = _tasks.get(job_id)
    if task and not task.done():
        jobs.request_cancel(job_id)
        jobs.kill_procs(job_id)
        task.cancel()
    ok = jobs.delete_job(job_id)
    if not ok:
        raise HTTPException(404, "Job tidak ditemukan")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Clip download / preview
# ---------------------------------------------------------------------------

@app.get("/api/clip/{job_id}/{index}")
async def download_clip(job_id: str, index: int):
    clip = _require_clip(job_id, index)
    path = _clip_file(job_id, index, "final")
    if not path.exists():
        raise HTTPException(404, "File klip tidak ada")
    safe = "".join(c for c in (clip.get("title") or "clip")
                   if c.isalnum() or c in " _-").strip() or "clip"
    fname = f"{safe}_{clip.get('score', 0)}.mp4"
    return FileResponse(path, media_type="video/mp4", filename=fname,
                        headers={"Cache-Control": "no-cache"})


def _clip_fps(src: Path) -> int:
    """Target fps for the editor: keep 60 for high-fps sources, else 30."""
    import subprocess
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=avg_frame_rate", "-of", "csv=p=0", str(src)],
            capture_output=True, text=True, timeout=15).stdout.strip()
        num, den = out.split("/")
        fps = float(num) / float(den) if float(den) else 30.0
    except Exception:  # noqa: BLE001
        fps = 30.0
    return 60 if fps >= 45 else 30


@app.get("/api/clip/{job_id}/{index}/web")
async def clip_web(job_id: str, index: int):
    """A WebCodecs-friendly copy of the clip (h264 Main, 30fps, yuv420p,
    faststart) so the in-browser Remotion renderer can decode it reliably.
    Re-encoded once and cached."""
    _require_clip(job_id, index)
    src = _clip_file(job_id, index, "final")
    if not src.exists():
        raise HTTPException(404, "File klip tidak ada")
    web = jobs.clips_dir(job_id) / f"clip_{index}_web.mp4"
    if not web.exists() or web.stat().st_mtime < src.stat().st_mtime:
        from media import run_ffmpeg
        fps = _clip_fps(src)
        try:
            await asyncio.to_thread(run_ffmpeg, job_id, [
                "-i", str(src), "-c:v", "libx264", "-profile:v", "main",
                "-pix_fmt", "yuv420p", "-r", str(fps), "-preset", "medium",
                "-crf", "16", "-movflags", "+faststart",
                "-c:a", "aac", "-b:a", "160k", str(web)])
        except Exception as e:  # noqa: BLE001
            raise HTTPException(500, f"Gagal menyiapkan video web: {e}")
    return FileResponse(web, media_type="video/mp4",
                        headers={"Cache-Control": "no-cache"})


@app.post("/api/clip/{job_id}/{index}/auto-effects")
async def auto_effects(job_id: str, index: int,
                       x_groq_key: Optional[str] = Header(None)):
    """Groq → structured zoom/grade segments for this clip (Auto AI edit)."""
    clip = _require_clip(job_id, index)
    t = jobs.load_raw(job_id, "transcript") or {}
    start, end = clip["start"], clip["end"]
    lines = []
    for seg in t.get("segments", []):
        if seg["end"] <= start or seg["start"] >= end:
            continue
        s = max(0.0, seg["start"] - start)
        e = max(0.0, seg["end"] - start)
        txt = (seg.get("text") or "").strip()
        if txt:
            lines.append(f"[{s:.1f}-{e:.1f}] {txt}")
    import autoedit
    try:
        cfg = await asyncio.to_thread(
            autoedit.generate_effects_config, "\n".join(lines), end - start, x_groq_key)
    except AppError as e:
        return _err_response(e)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"Auto AI gagal: {e}")
    # Refine zoom centers from detected faces (best-effort, never fatal).
    try:
        cfg["segments"] = await asyncio.to_thread(
            autoedit.face_centers, _clip_file(job_id, index, "final"), cfg["segments"])
    except Exception:  # noqa: BLE001
        pass
    return JSONResponse(content=cfg, headers={"Cache-Control": "no-cache"})


@app.post("/api/clip/{job_id}/{index}/hook-text")
async def regen_hook(job_id: str, index: int,
                     x_groq_key: Optional[str] = Header(None)):
    """Groq → a fresh hook overlay text for this clip."""
    clip = _require_clip(job_id, index)
    t = jobs.load_raw(job_id, "transcript") or {}
    start, end = clip["start"], clip["end"]
    parts = [(s.get("text") or "").strip() for s in t.get("segments", [])
             if s["end"] > start and s["start"] < end]
    import autoedit
    try:
        res = await asyncio.to_thread(
            autoedit.generate_hook, " ".join(p for p in parts if p),
            clip.get("title", ""), x_groq_key)
    except AppError as e:
        return _err_response(e)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"Generate hook gagal: {e}")
    return JSONResponse(content=res, headers={"Cache-Control": "no-cache"})


@app.post("/api/clip/{job_id}/{index}/edit-config")
async def save_edit_config(job_id: str, index: int, body: dict):
    """Persist the editor config for this clip (loaded back on re-open)."""
    _require_clip(job_id, index)
    jobs.update_clip(job_id, index, editConfig=body)
    return {"ok": True}


@app.post("/api/clip/{job_id}/{index}/caption")
async def clip_caption(job_id: str, index: int,
                       x_groq_key: Optional[str] = Header(None)):
    """Groq → viral caption + hashtags + title options for this clip."""
    clip = _require_clip(job_id, index)
    t = jobs.load_raw(job_id, "transcript") or {}
    start, end = clip["start"], clip["end"]
    parts = []
    for seg in t.get("segments", []):
        if seg["end"] <= start or seg["start"] >= end:
            continue
        txt = (seg.get("text") or "").strip()
        if txt:
            parts.append(txt)
    import autoedit
    try:
        res = await asyncio.to_thread(
            autoedit.generate_caption, " ".join(parts), clip.get("title", ""), x_groq_key)
    except AppError as e:
        return _err_response(e)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, f"Generate caption gagal: {e}")
    return JSONResponse(content=res, headers={"Cache-Control": "no-cache"})


@app.get("/api/clip/{job_id}/{index}/captions")
async def clip_captions(job_id: str, index: int):
    """Word-level captions for this clip (rebased to clip start, ms), cleaned of
    punctuation — feeds the Remotion subtitle layer."""
    clip = _require_clip(job_id, index)
    t = jobs.load_raw(job_id, "transcript") or {}
    start, end = clip["start"], clip["end"]
    caps = []
    for w in t.get("words", []):
        if w["end"] <= start or w["start"] >= end:
            continue
        txt = (w.get("word") or "").strip().strip(",.;:!?،؟")
        if not txt:
            continue
        caps.append({
            "text": txt,
            "startMs": int(max(0.0, w["start"] - start) * 1000),
            "endMs": int(max(0.0, w["end"] - start) * 1000),
        })
    return JSONResponse(
        content={"captions": caps, "durationSec": round(end - start, 3),
                 "fps": _clip_fps(_clip_file(job_id, index, "final"))},
        headers={"Cache-Control": "no-cache"})


@app.get("/api/clip/{job_id}/{index}/preview")
async def clip_preview(job_id: str, index: int):
    _require_clip(job_id, index)
    cdir = jobs.clips_dir(job_id)
    thumb = cdir / f"clip_{index}_thumb.png"
    if not thumb.exists():
        from media import extract_frame
        try:
            extract_frame(job_id, _clip_file(job_id, index, "final"), 0.5, thumb)
        except Exception:
            raise HTTPException(500, "Gagal membuat thumbnail")
    return FileResponse(thumb, media_type="image/png")



# ---------------------------------------------------------------------------
# Groq key validation
# ---------------------------------------------------------------------------

@app.post("/api/validate-key")
async def validate_key(x_groq_key: Optional[str] = Header(None)):
    try:
        res = await asyncio.to_thread(analyzer.validate_key, x_groq_key)
    except AppError as e:
        return _err_response(e)
    return res


# Alias matching the spec's POST /api/validate-key naming variant.
app.add_api_route("/api/validate-key/", validate_key, methods=["POST"])


@app.get("/api/health")
async def health():
    from config import detect_device, has_nvenc
    return {"status": "ok", "device": detect_device(), "nvenc": has_nvenc(),
            "max_concurrent": MAX_CONCURRENT_JOBS}


# ---------------------------------------------------------------------------
# WebSocket status stream (frontend falls back to HTTP polling)
# ---------------------------------------------------------------------------

@app.websocket("/ws/status/{job_id}")
async def ws_status(websocket: WebSocket, job_id: str):
    await websocket.accept()
    try:
        last = None
        while True:
            st = jobs.get_status(job_id)
            if st is None:
                await websocket.send_json({"error": "not_found"})
                break
            if st != last:
                await websocket.send_json(st)
                last = st
            if st.get("status") in (jobs.STATUS_DONE, jobs.STATUS_FAILED,
                                    jobs.STATUS_CANCELLED):
                break
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
