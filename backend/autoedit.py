"""Auto edit: Groq turns a clip's timestamped transcript into a structured
EffectsConfig (zoom + color-grade segments) for the Remotion renderer.

No raw ffmpeg is ever generated — only validated numbers — so it can't break.
Zoom center is fixed to the face region: clips are already 9:16 face-cropped, so
zooming toward (0.5, 0.34) zooms toward the subject's face.
"""
from __future__ import annotations

import json
import re

from llm import call_llm
from errors import AppError

EFFECTS_PROMPT = """
Kamu editor video pendek viral (9:16). Dari transkrip bertimestamp klip ini, buat
daftar segmen EFEK yang menutupi SELURUH durasi tanpa celah.

Tujuan: tambah ZOOM halus + grade warna "pop" pada momen penting (penekanan,
punchline, info kunci) supaya retensi naik — TAPI jangan berlebihan. Saat biasa,
biarkan netral (zoom 1.0).

TRANSKRIP (detik):
{transcript}

DURASI: {duration} detik

Tiap segmen punya: startSec, endSec, zoom (1.0-1.3; 1.0 = tanpa zoom; pakai
1.08-1.2 utk penekanan), brightness (0.95-1.1), contrast (1.0-1.12),
saturate (1.0-1.18).

ATURAN:
- Segmen berurutan, TANPA gap, dari 0 sampai {duration}.
- Lebih baik sedikit segmen panjang yang halus daripada banyak segmen pendek.
- Zoom hanya di momen yang pantas; sisanya zoom 1.0.
- Kembalikan HANYA JSON.

Format:
{{"segments":[{{"startSec":0,"endSec":4.0,"zoom":1.0,"brightness":1.0,"contrast":1.05,"saturate":1.1}}]}}
"""


def _clamp(v, lo, hi):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return lo
    return max(lo, min(hi, v))


def _extract_json(text: str) -> dict:
    t = (text or "").strip()
    t = re.sub(r"^```(?:json)?", "", t).strip()
    t = re.sub(r"```$", "", t).strip()
    a, b = t.find("{"), t.rfind("}")
    return json.loads(t[a:b + 1]) if a != -1 and b != -1 else {}


def generate_effects_config(transcript_text: str, duration: float,
                            api_key: str) -> dict:
    if not api_key:
        raise AppError("NO_API_KEY")
    prompt = EFFECTS_PROMPT.format(
        transcript=(transcript_text or "Tidak tersedia.")[:8000],
        duration=int(duration or 0))
    text = call_llm(api_key, prompt, json_mode=True, temperature=0.4)
    try:
        obj = _extract_json(text)
    except Exception:  # noqa: BLE001
        obj = {}

    dur = float(duration or 1)
    segs = []
    for s in obj.get("segments", []):
        try:
            a, b = float(s["startSec"]), float(s["endSec"])
        except (KeyError, TypeError, ValueError):
            continue
        if b <= a:
            continue
        segs.append({
            "startSec": round(max(0.0, a), 2),
            "endSec": round(min(dur, b), 2),
            "zoom": round(_clamp(s.get("zoom", 1.0), 1.0, 1.35), 3),
            "zoomCenterX": 0.5,
            "zoomCenterY": 0.34,
            "brightness": round(_clamp(s.get("brightness", 1.0), 0.9, 1.15), 3),
            "contrast": round(_clamp(s.get("contrast", 1.0), 0.95, 1.2), 3),
            "saturate": round(_clamp(s.get("saturate", 1.0), 0.95, 1.25), 3),
        })

    if not segs:  # safe fallback: gentle grade, no zoom
        segs = [{"startSec": 0.0, "endSec": round(dur, 2), "zoom": 1.0,
                 "zoomCenterX": 0.5, "zoomCenterY": 0.34, "brightness": 1.0,
                 "contrast": 1.05, "saturate": 1.1}]
    return {"segments": segs}


CAPTION_PROMPT = """
Kamu social media manager spesialis konten viral (TikTok/Reels/Shorts). Dari
judul + transkrip klip pendek ini, buat paket posting yang scroll-stopping.

JUDUL SAAT INI: {title}
TRANSKRIP:
{transcript}

Buat:
1. "caption": 1-2 kalimat hook kuat untuk caption posting (bahasa SAMA dengan
   transkrip, boleh 1-2 emoji, jangan pakai tanda kutip).
2. "hashtags": 6-10 hashtag relevan (format "#tag", tanpa spasi).
3. "titles": 3 alternatif judul pendek (<60 karakter, click-worthy).

Kembalikan HANYA JSON:
{{"caption":"...","hashtags":["#..."],"titles":["...","...","..."]}}
"""


def face_centers(video_path, segments: list) -> list:
    """Refine each zoom segment's center from a detected face (best-effort).

    The clip is already 9:16 face-cropped, so this mostly fine-tunes the
    horizontal focus; vertical stays in the upper third where faces sit.
    """
    try:
        import cv2
        import mediapipe as mp
        from cropper import _center_for_frame, _get_yolo
        face_det = mp.solutions.face_detection.FaceDetection(
            model_selection=1, min_detection_confidence=0.5)
    except Exception:  # noqa: BLE001
        return segments
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return segments
    try:
        for s in segments:
            if float(s.get("zoom", 1.0)) <= 1.001:
                continue
            mid = (s["startSec"] + s["endSec"]) / 2.0
            cap.set(cv2.CAP_PROP_POS_MSEC, mid * 1000)
            ok, frame = cap.read()
            if not ok or frame is None:
                continue
            try:
                cx = _center_for_frame(frame, face_det, lambda: _get_yolo())
            except Exception:  # noqa: BLE001
                cx = None
            if cx is not None:
                s["zoomCenterX"] = round(min(0.82, max(0.18, float(cx))), 3)
                s["zoomCenterY"] = 0.32
    finally:
        cap.release()
    return segments


HOOK_PROMPT = """
Buat hook overlay untuk klip pendek viral DAN pilih gayanya yang paling nampol.
Analisa vibe transkrip lalu tentukan semuanya sendiri (jangan asal).

JUDUL: {title}
TRANSKRIP:
{transcript}

Tentukan:
- "hook": teks hook 3-9 kata, scroll-stopping, bahasa SAMA dengan transkrip, tanpa tanda kutip.
- "badgeText": label kecil di atas hook, 1-3 kata (mis. "BREAKING", "FAKTA", "STORY",
  "PART 1", "REAL TALK"). Pilih yang pas dengan kontennya. Boleh kosong "".
- "badgeColor": warna badge (hex) yang kontras & eye-catching sesuai mood.
- "template": gaya tampilan, salah satu dari "box" (kartu putih rapi),
  "minimal" (teks bersih tanpa kotak), "bar" (teks di atas bar warna),
  "outline" (teks tebal dengan garis tepi hitam). Pilih yang cocok dengan vibe.
- "size": "S", "M", atau "L".

Kembalikan HANYA JSON:
{{"hook":"...","badgeText":"...","badgeColor":"#2D7FF9","template":"box","size":"M"}}
"""

_HOOK_SIZE = {"S", "M", "L"}
_HOOK_TEMPLATE = {"box", "minimal", "bar", "outline"}


def generate_hook(transcript_text: str, title: str, api_key: str) -> dict:
    if not api_key:
        raise AppError("NO_API_KEY")
    prompt = HOOK_PROMPT.format(title=(title or "")[:200],
                               transcript=(transcript_text or "")[:6000])
    text = call_llm(api_key, prompt, json_mode=True, temperature=0.8)
    try:
        obj = _extract_json(text)
    except Exception:  # noqa: BLE001
        obj = {}
    size = str(obj.get("size") or "").strip().upper()
    template = str(obj.get("template") or "").strip().lower()
    return {
        "hook": str(obj.get("hook") or "").strip()[:160],
        "badgeText": str(obj.get("badgeText") or "").strip()[:40],
        "badgeColor": _hex_or(obj.get("badgeColor"), "#2D7FF9"),
        "template": template if template in _HOOK_TEMPLATE else "box",
        "size": size if size in _HOOK_SIZE else "M",
    }


SUBTITLE_PROMPT = """
Kamu motion designer subtitle untuk video pendek viral (TikTok/Reels/Shorts).
Dari judul + transkrip klip ini, ANALISA vibe-nya (energik / hype / lucu / serius /
edukatif / emosional) lalu PILIH gaya subtitle paling cocok. Jangan asal —
sesuaikan dengan rasa kontennya.

JUDUL: {title}
TRANSKRIP:
{transcript}

Tentukan:
- "fontColor": warna teks utama (hex). Biasanya "#FFFFFF" paling aman.
- "highlightColor": warna kata yang sedang diucapkan (hex). Pilih yang KONTRAS & pop
  (mis. #FFDD00 kuning, #39E0A5 hijau, #36C5FF cyan) sesuai mood.
- "animation": "pop" (energik, serbaguna) / "word-highlight" (glow lembut, kalem) /
  "karaoke" (blok highlight, hype/musik) / "word-by-word" (satu kata fokus, fast-talk) /
  "bounce" (kata mantul, playful) / "shake" (kata getar, intens/marah) /
  "reveal" (teks muncul seperti diketik, storytelling).
- "position": "top", "middle", atau "bottom".
- "size": "S", "M", atau "L" (hype/cepat cenderung L).

Kembalikan HANYA JSON:
{{"fontColor":"#FFFFFF","highlightColor":"#FFDD00","animation":"pop","position":"bottom","size":"M"}}
"""

_SUB_ANIMS = {"pop", "word-highlight", "karaoke", "word-by-word",
              "bounce", "shake", "reveal"}
_SUB_POS = {"top", "middle", "bottom"}
_SUB_SIZE = {"S", "M", "L"}
_HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _hex_or(v, default: str) -> str:
    v = str(v or "").strip()
    return v if _HEX_RE.match(v) else default


def generate_subtitle_style(transcript_text: str, title: str, api_key: str) -> dict:
    """Groq picks a subtitle look (color/animation/position/size) that fits the
    clip's vibe — so the user doesn't have to choose from presets."""
    if not api_key:
        raise AppError("NO_API_KEY")
    prompt = SUBTITLE_PROMPT.format(title=(title or "")[:200],
                                    transcript=(transcript_text or "")[:6000])
    text = call_llm(api_key, prompt, json_mode=True, temperature=0.5)
    try:
        obj = _extract_json(text)
    except Exception:  # noqa: BLE001
        obj = {}
    anim = str(obj.get("animation") or "").strip()
    pos = str(obj.get("position") or "").strip().lower()
    size = str(obj.get("size") or "").strip().upper()
    return {
        "fontColor": _hex_or(obj.get("fontColor"), "#FFFFFF"),
        "highlightColor": _hex_or(obj.get("highlightColor"), "#FFDD00"),
        "animation": anim if anim in _SUB_ANIMS else "pop",
        "position": pos if pos in _SUB_POS else "bottom",
        "size": size if size in _SUB_SIZE else "M",
    }


def generate_caption(transcript_text: str, title: str, api_key: str) -> dict:
    if not api_key:
        raise AppError("NO_API_KEY")
    prompt = CAPTION_PROMPT.format(
        title=(title or "")[:200],
        transcript=(transcript_text or "Tidak tersedia.")[:8000])
    text = call_llm(api_key, prompt, json_mode=True, temperature=0.6)
    try:
        obj = _extract_json(text)
    except Exception:  # noqa: BLE001
        obj = {}
    caption = str(obj.get("caption") or "").strip()
    hashtags = [str(h).strip() for h in (obj.get("hashtags") or [])
                if str(h).strip()]
    hashtags = [h if h.startswith("#") else f"#{h}" for h in hashtags][:12]
    titles = [str(t).strip() for t in (obj.get("titles") or [])
              if str(t).strip()][:5]
    return {"caption": caption, "hashtags": hashtags, "titles": titles}
