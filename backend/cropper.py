"""Cut moments and crop to vertical 1080x1920.

TRACK mode  : detect the subject (MediaPipe face -> YOLOv8m fallback), follow it
              with a smoothed virtual camera, crop a 9:16 window.
GENERAL mode: blurred full-frame background + centered, width-fit foreground.

All output is exactly 1080x1920. Subprocesses are registered for cancellation.
"""
from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Callable, Optional

import jobs
from config import OUT_W, OUT_H, video_encoder_args, has_nvenc
from errors import AppError
from media import run_ffmpeg, probe

ASPECT = OUT_W / OUT_H  # 9:16 = 0.5625


# ---------------------------------------------------------------------------
# Subject tracking
# ---------------------------------------------------------------------------

class SmoothedCameraman:
    """Exponential-moving-average smoother for the crop-window center X."""

    def __init__(self, alpha: float = 0.12):
        self.alpha = alpha
        self.x: Optional[float] = None

    def update(self, target_x: float) -> float:
        if self.x is None:
            self.x = target_x
        else:
            self.x += self.alpha * (target_x - self.x)
        return self.x


def _detect_track_centers(source: Path, duration: float,
                          sample_fps: float = 2.0) -> list[tuple[float, float]]:
    """Sample frames and return [(t, center_x_fraction)] for the subject.

    Uses MediaPipe face detection; falls back to YOLOv8m person detection.
    On total failure returns center (0.5) everywhere.
    """
    import cv2  # opencv

    cap = cv2.VideoCapture(str(source))
    if not cap.isOpened():
        return [(0.0, 0.5)]
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, int(round(src_fps / sample_fps)))

    face_det = None
    yolo = None
    try:
        import mediapipe as mp
        face_det = mp.solutions.face_detection.FaceDetection(
            model_selection=1, min_detection_confidence=0.5)
    except Exception:
        face_det = None

    centers: list[tuple[float, float]] = []
    idx = 0
    last_x = 0.5
    while True:
        ok = cap.grab()
        if not ok:
            break
        if idx % step == 0:
            ok, frame = cap.retrieve()
            if ok and frame is not None:
                t = idx / src_fps
                cx = _center_for_frame(frame, face_det, lambda: _get_yolo())
                if cx is not None:
                    last_x = cx
                centers.append((t, last_x))
        idx += 1
    cap.release()
    if not centers:
        return [(0.0, 0.5)]
    return centers


_yolo_model = None


def _get_yolo():
    global _yolo_model
    if _yolo_model is None:
        from ultralytics import YOLO
        _yolo_model = YOLO("yolov8m.pt")
    return _yolo_model


def _center_for_frame(frame, face_det, yolo_getter) -> Optional[float]:
    import cv2

    h, w = frame.shape[:2]
    if face_det is not None:
        try:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            res = face_det.process(rgb)
            if res and res.detections:
                # Largest face wins.
                best = max(res.detections,
                           key=lambda d: d.location_data.relative_bounding_box.width)
                box = best.location_data.relative_bounding_box
                return min(1.0, max(0.0, box.xmin + box.width / 2))
        except Exception:
            pass
    # YOLO person fallback
    try:
        model = yolo_getter()
        r = model.predict(frame, classes=[0], verbose=False, conf=0.4)
        if r and len(r[0].boxes) > 0:
            boxes = r[0].boxes.xyxy.cpu().numpy()
            areas = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])
            b = boxes[int(areas.argmax())]
            return min(1.0, max(0.0, ((b[0] + b[2]) / 2) / w))
    except Exception:
        pass
    return None


def _build_track_crop_expr(centers, src_w: int, src_h: int) -> str:
    """Build an ffmpeg crop x-expression that follows smoothed centers.

    The crop window is full-height, width = src_h*9/16, x driven by piecewise
    time conditions sampled from the smoothed track.
    """
    crop_w = min(src_w, int(round(src_h * ASPECT)))
    half = crop_w / 2
    smoother = SmoothedCameraman()
    pts = []
    for t, frac in centers:
        cx = frac * src_w
        sx = smoother.update(cx)
        x = min(max(sx - half, 0), src_w - crop_w)
        pts.append((t, round(x, 1)))

    # Compose nested if() so x changes stepwise over time. Keep it bounded.
    expr = str(pts[-1][1])
    for t, x in reversed(pts[:-1]):
        expr = f"if(lt(t,{round(t, 2)}),{x},{expr})"
    return crop_w, expr


# ---------------------------------------------------------------------------
# Per-moment cut + crop
# ---------------------------------------------------------------------------

def _cut_segment(job_id: str, source: Path, start: float, end: float,
                 raw_out: Path, use_gpu: Optional[bool] = None) -> None:
    """Fast, accurate cut of [start, end] without re-cropping yet."""
    args = ["-ss", str(start), "-to", str(end), "-i", str(source),
            *video_encoder_args(cq=18, use_gpu=use_gpu), "-c:a", "aac",
            "-b:a", "192k", str(raw_out)]
    run_ffmpeg(job_id, args)


def _crop_general(job_id: str, raw: Path, out: Path,
                  use_gpu: Optional[bool] = None) -> None:
    """Blurred background + centered foreground, fit to 1080x1920."""
    vf = (
        f"split=2[bg][fg];"
        f"[bg]scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=increase,"
        f"crop={OUT_W}:{OUT_H},gblur=sigma=25[bgb];"
        f"[fg]scale={OUT_W}:-2[fgs];"
        f"[bgb][fgs]overlay=(W-w)/2:(H-h)/2,crop={OUT_W}:{OUT_H}"
    )
    args = ["-i", str(raw), "-vf", vf, *video_encoder_args(cq=18, use_gpu=use_gpu),
            "-c:a", "aac", "-b:a", "192k", str(out)]
    run_ffmpeg(job_id, args)


def _crop_track(job_id: str, raw: Path, out: Path,
                use_gpu: Optional[bool] = None) -> None:
    """Face/person-following 9:16 crop scaled to 1080x1920."""
    info = probe(raw)
    src_w, src_h = info["width"], info["height"]
    if src_w == 0 or src_h == 0:
        return _crop_general(job_id, raw, out, use_gpu)
    try:
        centers = _detect_track_centers(raw, info["duration"])
        crop_w, x_expr = _build_track_crop_expr(centers, src_w, src_h)
    except Exception:
        return _crop_general(job_id, raw, out, use_gpu)

    vf = (f"crop={crop_w}:{src_h}:{x_expr}:0,"
          f"scale={OUT_W}:{OUT_H}:force_original_aspect_ratio=increase,"
          f"crop={OUT_W}:{OUT_H}")
    args = ["-i", str(raw), "-vf", vf, *video_encoder_args(cq=18, use_gpu=use_gpu),
            "-c:a", "aac", "-b:a", "192k", str(out)]
    try:
        run_ffmpeg(job_id, args)
    except RuntimeError:
        # A bad tracking expression should never kill the job.
        _crop_general(job_id, raw, out, use_gpu)


def process_moment(job_id: str, source: Path, index: int, moment: dict,
                   crop_mode: str, use_gpu: Optional[bool] = None) -> dict:
    cdir = jobs.clips_dir(job_id)
    raw = cdir / f"clip_{index}_raw.mp4"
    original = cdir / f"clip_{index}_original.mp4"
    final = cdir / f"clip_{index}_final.mp4"

    jobs.check_cancelled(job_id)
    _cut_segment(job_id, source, moment["start"], moment["end"], raw, use_gpu)

    jobs.check_cancelled(job_id)
    if crop_mode == "general":
        _crop_general(job_id, raw, original, use_gpu)
    else:
        _crop_track(job_id, raw, original, use_gpu)

    try:
        raw.unlink(missing_ok=True)
    except OSError:
        pass
    # The "final" (edited) version starts as a copy of the original.
    import shutil
    shutil.copyfile(original, final)

    return {
        "index": index,
        "title": moment["title"],
        "start": moment["start"],
        "end": moment["end"],
        "duration": moment["duration"],
        "score": moment["viral_score"],
        "hook_text": moment.get("hook_text", ""),
        "reason": moment.get("reason", ""),
        "file": final.name,
        "applied": {"subtitle": False, "effects": False, "hook": False,
                    "trim": False},
    }


def cut_and_crop_all(job_id: str, source: Path, moments: list[dict],
                     transcript: dict, crop_mode: str,
                     progress_cb: Optional[Callable[[int, int], None]] = None
                     ) -> list[dict]:
    total = len(moments)
    results: dict[int, dict] = {}
    done = 0
    # Hybrid encode: when a usable NVENC GPU exists, alternate clips between GPU
    # (even index) and CPU (odd index) so both engines crunch in parallel — fast
    # whether the source is short or long. Without a GPU everything runs on CPU.
    gpu_ok = has_nvenc()
    workers = 3 if gpu_ok else 2

    def _use_gpu_for(i: int) -> Optional[bool]:
        return (i % 2 == 0) if gpu_ok else False

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {
            ex.submit(process_moment, job_id, source, i, m, crop_mode,
                      _use_gpu_for(i)): i
            for i, m in enumerate(moments)
        }
        for fut in as_completed(futs):
            i = futs[fut]
            try:
                results[i] = fut.result()
            except jobs.JobCancelled:
                raise
            except Exception:
                # One bad clip (corrupt segment, encode glitch) shouldn't sink
                # the whole job — skip it and keep the rest.
                pass
            done += 1
            if progress_cb:
                progress_cb(done, total)
    if not results:
        raise AppError("INTERNAL", detail="Semua klip gagal diproses")
    return [results[i] for i in sorted(results)]
