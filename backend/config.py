"""Central configuration + GPU detection for ClipStudio."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

BASE_DIR = Path(__file__).resolve().parent
JOBS_DIR = Path(os.getenv("JOBS_DIR", BASE_DIR.parent / "jobs"))
JOBS_DIR.mkdir(parents=True, exist_ok=True)

MAX_CONCURRENT_JOBS = int(os.getenv("MAX_CONCURRENT_JOBS", "2"))
JOB_AUTO_DELETE_HOURS = int(os.getenv("JOB_AUTO_DELETE_HOURS", "24"))
JOB_STUCK_HOURS = int(os.getenv("JOB_STUCK_HOURS", "2"))

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "medium")
_WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "auto")

# Output spec is fixed by product requirement.
OUT_W = 1080
OUT_H = 1920

# Video validation
MIN_DURATION_SEC = 120          # 2 minutes
MAX_FILE_BYTES = 2 * 1024**3    # 2 GB
ALLOWED_EXT = {".mp4", ".mov", ".avi"}

# AI provider — Groq (OpenAI-compatible, free tier, no card required).
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_MODEL = "llama-3.3-70b-versatile"


def detect_device() -> str:
    """Return 'cuda' when a usable NVIDIA GPU is present, else 'cpu'."""
    if _WHISPER_DEVICE in ("cuda", "cpu"):
        return _WHISPER_DEVICE
    try:
        import torch  # heavy; imported lazily

        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


def has_nvenc() -> bool:
    """Whether h264_nvenc actually works at runtime. Cached per-process.

    Checking `ffmpeg -encoders` is not enough: the encoder is compiled in even
    when libnvidia-encode.so is missing (GPU container without the `video`
    capability), which yields a false positive and a hard failure at encode
    time. So we run a tiny real encode and trust only its exit code.
    """
    global _NVENC_CACHE
    try:
        return _NVENC_CACHE
    except NameError:
        pass
    import subprocess

    ok = False
    try:
        probe = subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error",
             "-f", "lavfi", "-i", "nullsrc=s=320x240:d=0.2",
             "-c:v", "h264_nvenc", "-f", "null", "-"],
            capture_output=True, text=True, timeout=30,
        )
        ok = probe.returncode == 0
    except Exception:
        ok = False
    _NVENC_CACHE = ok
    return ok


def video_encoder_args(cq: int = 18, preset: str = "p4",
                       use_gpu: Optional[bool] = None) -> list[str]:
    """FFmpeg encoder args.

    use_gpu=None  -> auto: NVENC if usable, else libx264.
    use_gpu=True  -> NVENC if usable, else libx264 (safe fallback).
    use_gpu=False -> always libx264 (CPU).

    This lets the cropper run some clips on GPU and others on CPU at the same
    time, so a job uses both engines in parallel regardless of length.
    """
    gpu = has_nvenc() if use_gpu is None else (bool(use_gpu) and has_nvenc())
    if gpu:
        return ["-c:v", "h264_nvenc", "-cq", str(cq), "-preset", preset,
                "-pix_fmt", "yuv420p"]
    # CPU encoder (also the fallback when no usable GPU).
    crf = max(0, min(51, cq + 5))
    return ["-c:v", "libx264", "-crf", str(crf), "-preset", "medium",
            "-pix_fmt", "yuv420p"]
