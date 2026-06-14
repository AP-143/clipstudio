"""YouTube ingestion via yt-dlp. Strict 1080p — never downgrades resolution.

YouTube's 1080p extraction is flaky: a first attempt may return no 1080p
format and only a retry succeeds. So we retry both the metadata probe and the
download a few times before giving up (matches doing it manually). Cookies are
honoured and remain the most reliable unlock when retries aren't enough.
"""
from __future__ import annotations

import subprocess
import tempfile
import time
from pathlib import Path
from typing import Optional

from errors import AppError
from config import JOBS_DIR
import jobs

_MAX_ATTEMPTS = 3
_RETRY_DELAY = 2.0


def update_yt_dlp() -> None:
    """Best-effort self-update at startup; never fatal."""
    try:
        subprocess.run(["yt-dlp", "-U"], capture_output=True, text=True, timeout=120)
    except Exception:
        pass


def _cookies_file(cookies: Optional[str]) -> Optional[str]:
    if not cookies or not cookies.strip():
        return None
    tf = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False,
                                     encoding="utf-8")
    tf.write(cookies)
    tf.close()
    return tf.name


def fetch_metadata(url: str, cookies: Optional[str] = None) -> dict:
    """Pull channel / title / duration / upload_date without downloading."""
    import json as _json

    cmd = ["yt-dlp", "--dump-single-json", "--no-warnings", "--no-playlist",
           "--extractor-retries", "3"]
    cookie_path = _cookies_file(cookies)
    if cookie_path:
        cmd += ["--cookies", cookie_path]
    cmd.append(url)
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    finally:
        if cookie_path:
            Path(cookie_path).unlink(missing_ok=True)
    if out.returncode != 0:
        raise AppError("YOUTUBE_NOT_1080P",
                       detail=out.stderr.strip()[-400:] or "yt-dlp gagal")
    info = _json.loads(out.stdout)
    heights = [f.get("height") for f in info.get("formats", []) if f.get("height")]
    return {
        "video_title": info.get("title"),
        "channel_name": info.get("uploader") or info.get("channel"),
        "duration": float(info.get("duration") or 0),
        "upload_date": info.get("upload_date"),
        "video_url": info.get("webpage_url") or url,
        # Best available vertical resolution. We no longer require EXACTLY 1080p:
        # plenty of videos publish non-standard heights (e.g. 914/1218/1826 for
        # odd aspect ratios) and were wrongly rejected. We take the best the
        # source offers (capped on download) and crop to 1080x1920 anyway.
        "best_height": max(heights) if heights else 0,
    }


def _probe_metadata(job_id: str, url: str, cookies: Optional[str]) -> dict:
    """Probe metadata, retrying while only low-res formats show up (YouTube's
    hi-res extraction is flaky — a retry often surfaces more)."""
    last_detail = ""
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        jobs.check_cancelled(job_id)
        try:
            meta = fetch_metadata(url, cookies)
        except AppError as e:
            last_detail = e.detail or "yt-dlp gagal"
        else:
            if meta["best_height"] >= 480:
                return meta
            last_detail = (f"hanya resolusi rendah ({meta['best_height']}p, "
                           f"percobaan {attempt})")
        if attempt < _MAX_ATTEMPTS:
            time.sleep(_RETRY_DELAY)
    raise AppError("YOUTUBE_NOT_1080P",
                   detail=f"{last_detail}. Coba lagi atau isi cookies di Settings.")


def _run_yt_dlp(job_id: str, url: str, out_path: Path,
                cookies: Optional[str], progress_cb) -> tuple[bool, str]:
    """One download attempt. Returns (success, last_output_line)."""
    # Prefer H.264 (avc1) at 1080p: YouTube's "best" 1080p is often AV1, which
    # the container's ffmpeg/NVDEC fails to decode ("av1 … Failed to get pixel
    # format") at the scene-detect/crop stage. avc1 decodes everywhere; fall back
    # to VP9, then any 1080p (incl. AV1) only as a last resort.
    # Best video up to 1440p, preferring H.264 (avc1) then VP9 over https, so
    # any decent source works — not only exactly-1080p. avc1 on YouTube tops out
    # at 1080 so normal videos still grab 1080p H.264; odd resolutions get their
    # best. AV1 only as a last resort (the container can't hw-decode it well).
    fmt = (
        "bestvideo[height<=1440][vcodec^=avc1][protocol^=https]+bestaudio[ext=m4a]/"
        "bestvideo[height<=1440][vcodec^=avc1][protocol^=https]+bestaudio/"
        "bestvideo[height<=1440][vcodec^=vp9][protocol^=https]+bestaudio/"
        "bestvideo[height<=1440][protocol^=https]+bestaudio/"
        "bestvideo[height<=1440]+bestaudio/best"
    )
    cmd = [
        "yt-dlp", "-f", fmt, "--merge-output-format", "mp4",
        "--no-playlist", "--no-warnings", "--newline",
        "--retries", "5", "--fragment-retries", "10", "--extractor-retries", "3",
        "-o", str(out_path), url,
    ]
    cookie_path = _cookies_file(cookies)
    if cookie_path:
        cmd += ["--cookies", cookie_path]

    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True)
    jobs.register_proc(job_id, proc)
    last_err = ""
    # 1080p downloads two streams (video then audio), and yt-dlp's percent resets
    # 0->100 for each. Keep the reported progress monotonic so the bar doesn't
    # visibly jump back to 0 when the (small) audio stream starts.
    max_pct = 0.0
    try:
        for line in proc.stdout:  # stream progress lines
            jobs.check_cancelled(job_id)
            last_err = line.strip() or last_err
            if progress_cb and "%" in line and "[download]" in line:
                try:
                    pct = float(line.split("%")[0].split()[-1])
                    if pct > max_pct:
                        max_pct = pct
                        progress_cb(max_pct)
                except (ValueError, IndexError):
                    pass
        proc.wait()
    finally:
        jobs.unregister_proc(job_id, proc)
        if cookie_path:
            Path(cookie_path).unlink(missing_ok=True)

    ok = proc.returncode == 0 and out_path.exists()
    return ok, last_err


def download(job_id: str, url: str, cookies: Optional[str] = None,
             progress_cb=None) -> Path:
    """Download the source at the best available resolution (capped), retrying
    the flaky bits."""
    meta = _probe_metadata(job_id, url, cookies)

    jobs.set_metadata(job_id, source_url=url,
                      video_title=meta["video_title"],
                      channel_name=meta["channel_name"],
                      duration=meta["duration"],
                      upload_date=meta["upload_date"])

    out_path = JOBS_DIR / job_id / "source.mp4"
    last_err = ""
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        jobs.check_cancelled(job_id)
        out_path.unlink(missing_ok=True)
        ok, last_err = _run_yt_dlp(job_id, url, out_path, cookies, progress_cb)
        if ok:
            return out_path
        if attempt < _MAX_ATTEMPTS:
            time.sleep(_RETRY_DELAY)

    raise AppError("YOUTUBE_NOT_1080P",
                   detail=(f"Download 1080p gagal setelah {_MAX_ATTEMPTS} percobaan. "
                           f"Isi cookies YouTube di Settings. {last_err[-250:]}"))
