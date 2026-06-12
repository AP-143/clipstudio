"""Thin FFmpeg/FFprobe helpers shared by the processing modules.

Every ffmpeg invocation is registered with the job so cancel() can kill it.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Optional

import jobs


def run_ffmpeg(job_id: Optional[str], args: list[str], timeout: int = 1800) -> None:
    """Run `ffmpeg <args>`; raise RuntimeError on non-zero exit."""
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True)
    if job_id:
        jobs.register_proc(job_id, proc)
    try:
        _, err = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        raise RuntimeError("ffmpeg timeout")
    finally:
        if job_id:
            jobs.unregister_proc(job_id, proc)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {(err or '')[-600:]}")


def probe(path: Path) -> dict:
    """Return {duration, width, height, fps} for a media file."""
    cmd = ["ffprobe", "-v", "error", "-print_format", "json",
           "-show_format", "-show_streams", str(path)]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if out.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {out.stderr[-300:]}")
    data = json.loads(out.stdout)
    vstream = next((s for s in data.get("streams", [])
                    if s.get("codec_type") == "video"), {})
    fps = 30.0
    if vstream.get("avg_frame_rate", "0/0") not in ("0/0", "0/1"):
        num, _, den = vstream["avg_frame_rate"].partition("/")
        try:
            fps = float(num) / float(den) if float(den) else 30.0
        except (ValueError, ZeroDivisionError):
            fps = 30.0
    return {
        "duration": float(data.get("format", {}).get("duration", 0) or 0),
        "width": int(vstream.get("width", 0) or 0),
        "height": int(vstream.get("height", 0) or 0),
        "fps": round(fps, 3),
    }


def extract_frame(job_id: Optional[str], source: Path, t: float,
                  out_png: Path, vf: Optional[str] = None) -> Path:
    """Grab a single frame at time `t` (optionally filtered) as PNG."""
    args = ["-ss", str(max(0, t)), "-i", str(source), "-frames:v", "1"]
    if vf:
        args += ["-vf", vf]
    args.append(str(out_png))
    run_ffmpeg(job_id, args, timeout=120)
    return out_png
