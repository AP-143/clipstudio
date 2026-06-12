"""Transcription via faster-whisper (CUDA medium, word-level timestamps).

The model is loaded once and cached. Word-level timestamps are mandatory for the
word-by-word subtitle styles.
"""
from __future__ import annotations

import threading
from pathlib import Path
from typing import Optional

from config import WHISPER_MODEL, detect_device
import jobs

_model = None
_model_lock = threading.Lock()
_model_device = None


def get_model():
    """Lazily load and cache the Whisper model on the detected device."""
    global _model, _model_device
    if _model is not None:
        return _model
    with _model_lock:
        if _model is not None:
            return _model
        from faster_whisper import WhisperModel

        device = detect_device()
        compute = "float16" if device == "cuda" else "int8"
        _model = WhisperModel(WHISPER_MODEL, device=device, compute_type=compute)
        _model_device = device
        return _model


def warm_up() -> str:
    """Preload the model at startup. Returns the device used."""
    try:
        get_model()
        return _model_device or "cpu"
    except Exception:
        return "unavailable"


def transcribe(job_id: str, source: Path,
               language: Optional[str] = None, progress_cb=None) -> dict:
    """Return {language, duration, words:[{word,start,end}], segments:[...]}.

    `language` None => auto-detect. `progress_cb(fraction)` (0..1) is called as
    segments stream in, so the UI can show transcription advancing.
    """
    model = get_model()
    jobs.check_cancelled(job_id)

    segments_iter, info = model.transcribe(
        str(source),
        language=language if language and language != "auto" else None,
        word_timestamps=True,
        vad_filter=True,
        # beam_size 2 (not 5): ~2x faster on long videos with negligible quality
        # loss for transcript-based moment detection + subtitles.
        beam_size=2,
    )
    total = float(info.duration) or 0.0

    words: list[dict] = []
    segments: list[dict] = []
    for seg in segments_iter:
        jobs.check_cancelled(job_id)
        if progress_cb and total:
            progress_cb(min(1.0, seg.end / total))
        seg_words = []
        for w in (seg.words or []):
            entry = {"word": w.word.strip(), "start": round(w.start, 3),
                     "end": round(w.end, 3)}
            words.append(entry)
            seg_words.append(entry)
        segments.append({
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "text": seg.text.strip(),
            "words": seg_words,
        })

    result = {
        "language": info.language,
        "duration": round(float(info.duration), 3),
        "words": words,
        "segments": segments,
    }
    jobs.save_artifact(job_id, "transcript", result)
    return result


def transcript_to_text(transcript: dict) -> str:
    """Segments prefixed with [start-end] seconds so the LLM can choose precise,
    content-aware cut points instead of guessing round 30s windows."""
    lines = []
    for s in transcript.get("segments", []):
        txt = (s.get("text") or "").strip()
        if not txt:
            continue
        lines.append(f"[{float(s['start']):.1f}-{float(s['end']):.1f}] {txt}")
    return "\n".join(lines).strip()
