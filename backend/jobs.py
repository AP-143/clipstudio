"""Job state management with on-disk persistence.

Every job lives in jobs/{job_id}/ with a set of JSON files (status, metadata,
result, ...). All state is written to disk so the server can be restarted and
the browser can recover after a refresh.
"""
from __future__ import annotations

import json
import shutil
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from config import JOBS_DIR, JOB_STUCK_HOURS

# Status flow:
# queued -> downloading -> transcribing -> analyzing -> cutting -> done
#        -> cancelled / failed
STATUS_QUEUED = "queued"
STATUS_DOWNLOADING = "downloading"
STATUS_TRANSCRIBING = "transcribing"
STATUS_ANALYZING = "analyzing"
STATUS_CUTTING = "cutting"
STATUS_DONE = "done"
STATUS_FAILED = "failed"
STATUS_CANCELLED = "cancelled"

ACTIVE_STATUSES = {
    STATUS_QUEUED, STATUS_DOWNLOADING, STATUS_TRANSCRIBING,
    STATUS_ANALYZING, STATUS_CUTTING,
}

_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _lock_for(job_id: str) -> threading.Lock:
    with _locks_guard:
        lk = _locks.get(job_id)
        if lk is None:
            lk = threading.Lock()
            _locks[job_id] = lk
        return lk


def job_dir(job_id: str) -> Path:
    return JOBS_DIR / job_id


def clips_dir(job_id: str) -> Path:
    d = job_dir(job_id) / "clips"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _read_json(path: Path) -> Optional[dict]:
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def _write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)  # atomic on same filesystem


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

def create_job(source_type: str, metadata: Optional[dict] = None) -> str:
    job_id = uuid.uuid4().hex[:12]
    d = job_dir(job_id)
    d.mkdir(parents=True, exist_ok=True)
    now = _now_iso()
    _write_json(d / "status.json", {
        "job_id": job_id,
        "status": STATUS_QUEUED,
        "progress": 0,
        "step": "Antrian",
        "message": "Job dibuat, menunggu giliran",
        "cancelled": False,
        "created_at": now,
        "updated_at": now,
        "error": None,
    })
    meta = {"source_type": source_type, "source_url": None, "channel_name": None,
            "video_title": None, "duration": None, "upload_date": None}
    if metadata:
        meta.update(metadata)
    _write_json(d / "metadata.json", meta)
    return job_id


def update_status(job_id: str, *, status: str = None, progress: int = None,
                  step: str = None, message: str = None,
                  error: str = None) -> dict:
    d = job_dir(job_id)
    with _lock_for(job_id):
        cur = _read_json(d / "status.json") or {}
        if status is not None:
            cur["status"] = status
        if progress is not None:
            cur["progress"] = max(0, min(100, int(progress)))
        if step is not None:
            cur["step"] = step
        if message is not None:
            cur["message"] = message
        if error is not None:
            cur["error"] = error
        cur["updated_at"] = _now_iso()
        _write_json(d / "status.json", cur)
        return cur


def get_status(job_id: str) -> Optional[dict]:
    return _read_json(job_dir(job_id) / "status.json")


def get_metadata(job_id: str) -> Optional[dict]:
    return _read_json(job_dir(job_id) / "metadata.json")


def set_metadata(job_id: str, **fields) -> dict:
    d = job_dir(job_id)
    with _lock_for(job_id):
        meta = _read_json(d / "metadata.json") or {}
        meta.update(fields)
        _write_json(d / "metadata.json", meta)
        return meta


def request_cancel(job_id: str) -> bool:
    d = job_dir(job_id)
    if not (d / "status.json").exists():
        return False
    with _lock_for(job_id):
        cur = _read_json(d / "status.json") or {}
        cur["cancelled"] = True
        cur["updated_at"] = _now_iso()
        _write_json(d / "status.json", cur)
    return True


def is_cancelled(job_id: str) -> bool:
    cur = _read_json(job_dir(job_id) / "status.json") or {}
    return bool(cur.get("cancelled"))


class JobCancelled(Exception):
    """Raised inside the pipeline to unwind a cancelled job gracefully."""


def check_cancelled(job_id: str) -> None:
    if is_cancelled(job_id):
        raise JobCancelled(job_id)


# ---------------------------------------------------------------------------
# Live subprocess registry — so cancel() can kill ffmpeg / yt-dlp / whisper
# ---------------------------------------------------------------------------
_procs: dict[str, list] = {}
_procs_guard = threading.Lock()


def register_proc(job_id: str, proc) -> None:
    with _procs_guard:
        _procs.setdefault(job_id, []).append(proc)


def unregister_proc(job_id: str, proc) -> None:
    with _procs_guard:
        lst = _procs.get(job_id)
        if lst and proc in lst:
            lst.remove(proc)


def kill_procs(job_id: str) -> int:
    """Terminate every live subprocess registered for this job."""
    killed = 0
    with _procs_guard:
        lst = list(_procs.get(job_id, []))
    for proc in lst:
        try:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except Exception:
                    proc.kill()
                killed += 1
        except Exception:
            pass
    with _procs_guard:
        _procs.pop(job_id, None)
    return killed


# ---------------------------------------------------------------------------
# Artifacts (transcript / scenes / moments / result)
# ---------------------------------------------------------------------------

def save_artifact(job_id: str, name: str, data: Any) -> None:
    _write_json(job_dir(job_id) / f"{name}.json", data if isinstance(data, dict)
                else {"data": data})


def save_raw(job_id: str, name: str, data: Any) -> None:
    _write_json(job_dir(job_id) / f"{name}.json", {"items": data})


def load_raw(job_id: str, name: str) -> Any:
    obj = _read_json(job_dir(job_id) / f"{name}.json")
    if obj is None:
        return None
    return obj.get("items", obj.get("data", obj))


def save_result(job_id: str, result: dict) -> None:
    _write_json(job_dir(job_id) / "result.json", result)


def get_result(job_id: str) -> Optional[dict]:
    return _read_json(job_dir(job_id) / "result.json")


def update_clip(job_id: str, index: int, **fields) -> Optional[dict]:
    """Patch a single clip entry inside result.json."""
    d = job_dir(job_id)
    with _lock_for(job_id):
        result = _read_json(d / "result.json")
        if not result:
            return None
        for clip in result.get("clips", []):
            if clip.get("index") == index:
                clip.update(fields)
                _write_json(d / "result.json", result)
                return clip
    return None


# ---------------------------------------------------------------------------
# Listing / deletion / cleanup
# ---------------------------------------------------------------------------

def list_jobs() -> list[dict]:
    out = []
    if not JOBS_DIR.exists():
        return out
    for d in JOBS_DIR.iterdir():
        if not d.is_dir():
            continue
        status = _read_json(d / "status.json")
        if not status:
            continue
        meta = _read_json(d / "metadata.json") or {}
        result = _read_json(d / "result.json") or {}
        out.append({
            "job_id": status.get("job_id", d.name),
            "status": status.get("status"),
            "progress": status.get("progress", 0),
            "created_at": status.get("created_at"),
            "updated_at": status.get("updated_at"),
            "video_title": meta.get("video_title"),
            "channel_name": meta.get("channel_name"),
            "duration": meta.get("duration"),
            "source_type": meta.get("source_type"),
            "source_url": meta.get("source_url"),
            "clip_count": len(result.get("clips", [])),
        })
    out.sort(key=lambda j: j.get("created_at") or "", reverse=True)
    return out


def delete_job(job_id: str) -> bool:
    d = job_dir(job_id)
    if d.exists():
        shutil.rmtree(d, ignore_errors=True)
        return True
    return False


def remove_source(job_id: str) -> None:
    """Drop the (large) source video once clips are produced."""
    for name in ("source.mp4", "source.webm", "source.mkv"):
        p = job_dir(job_id) / name
        if p.exists():
            try:
                p.unlink()
            except OSError:
                pass


def cleanup_on_startup() -> dict:
    """Fail jobs stuck in an active state for too long; report counts."""
    failed = 0
    cutoff = time.time() - JOB_STUCK_HOURS * 3600
    for d in JOBS_DIR.iterdir() if JOBS_DIR.exists() else []:
        status = _read_json(d / "status.json") if d.is_dir() else None
        if not status:
            continue
        if status.get("status") in ACTIVE_STATUSES:
            try:
                updated = datetime.fromisoformat(status["updated_at"]).timestamp()
            except Exception:
                updated = 0
            if updated < cutoff:
                update_status(d.name, status=STATUS_FAILED,
                              message="Job terhenti terlalu lama, ditandai gagal",
                              error="STUCK_TIMEOUT")
                remove_source(d.name)
                failed += 1
    return {"failed_stuck": failed}


def auto_delete(hours: int) -> dict:
    """Delete finished jobs older than `hours`. hours<=0 disables."""
    if hours <= 0:
        return {"deleted": 0}
    deleted = 0
    cutoff = time.time() - hours * 3600
    for d in list(JOBS_DIR.iterdir()) if JOBS_DIR.exists() else []:
        status = _read_json(d / "status.json") if d.is_dir() else None
        if not status:
            continue
        if status.get("status") in (STATUS_DONE, STATUS_FAILED, STATUS_CANCELLED):
            try:
                updated = datetime.fromisoformat(status["updated_at"]).timestamp()
            except Exception:
                updated = 0
            if updated < cutoff:
                shutil.rmtree(d, ignore_errors=True)
                deleted += 1
    return {"deleted": deleted}
