"""Scene boundary detection via PySceneDetect (ContentDetector threshold=27)."""
from __future__ import annotations

from pathlib import Path

import jobs


def detect_scenes(job_id: str, source: Path) -> list[dict]:
    """Return list of {start, end} scene spans in seconds."""
    jobs.check_cancelled(job_id)
    try:
        from scenedetect import detect, ContentDetector

        scene_list = detect(str(source), ContentDetector(threshold=27.0))
        scenes = [
            {"start": round(s.get_seconds(), 3), "end": round(e.get_seconds(), 3)}
            for s, e in scene_list
        ]
    except Exception:
        # Scene detection is advisory; never fail the whole job on it.
        scenes = []
    jobs.save_raw(job_id, "scenes", scenes)
    return scenes
