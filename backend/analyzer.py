"""Viral-moment detection via Groq (Llama 3.3 70B).

Only the transcript text is sent (never the video). Returns 2–6 moments sorted
by viral_score descending.
"""
from __future__ import annotations

import json
import re
from typing import Optional

from errors import AppError
from llm import call_llm
import jobs

ANALYZE_PROMPT = """
Kamu adalah expert viral content analyst untuk TikTok, Instagram Reels, dan YouTube Shorts.

Analisa transkrip video berikut dan identifikasi antara 2 sampai 6 momen paling viral.

Transkrip diberi timestamp per segmen dalam format [mulai-akhir] (dalam detik):
TRANSKRIP:
{transcript}

DURASI VIDEO: {duration} detik

Kriteria momen viral:
- Hook kuat di awal (pertanyaan/fakta mengejutkan, konflik)
- Nilai informasi atau hiburan tinggi
- Momen emosional (tawa, kejutan, inspirasi, kontroversi)
- Cocok untuk format 9:16 vertikal

CARA MENENTUKAN start & end (PALING PENTING):
- start dan end WAJIB diambil dari angka timestamp [mulai-akhir] yang ADA di transkrip.
  start = "mulai" dari segmen pembuka momen; end = "akhir" dari segmen penutup momen.
- JANGAN mengarang angka bulat (10, 30, 60). Pakai angka timestamp asli (mis. 12.4, 58.7).
- Setiap klip harus berisi SATU penjelasan/topik/gerakan yang LENGKAP dari awal
  sampai KESIMPULAN. Gabungkan beberapa segmen berurutan kalau satu penjelasan
  butuh banyak kalimat.
- DILARANG berhenti sebelum penjelasan selesai. Kalau satu poin butuh 80 detik,
  ambil 80 detik. JANGAN memotong di tengah ide/kalimat.
- LEBIH BAIK klip 60-90 detik yang UTUH daripada 30 detik yang terpotong.
- Jangan paksa semua klip ke durasi yang sama; ikuti panjang isi sebenarnya.

Kembalikan JSON PERSIS format ini:
{{
  "moments": [
    {{
      "start": 12.4,
      "end": 58.7,
      "title": "Judul klip menarik",
      "viral_score": 93,
      "hook_text": "Teks hook untuk overlay di awal video",
      "reason": "Alasan kenapa viral"
    }}
  ]
}}

ATURAN WAJIB:
- Minimum 2 momen, maksimum 6 momen
- Urutkan viral_score TERTINGGI ke terendah
- viral_score antara 0-100
- Setiap momen 30-100 detik, mengikuti batas konten (bukan angka bulat); utuh, tidak terpotong
- Tidak boleh overlap
- hook_text dalam bahasa yang sama dengan video
- Kembalikan HANYA JSON, tanpa teks lain
"""


def _extract_json(text: str) -> dict:
    """Tolerate code fences / surrounding prose around the JSON object."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found")
    return json.loads(text[start:end + 1])


def _call_gemini(api_key: str, prompt: str, json_mode: bool = False) -> str:
    # Name kept for historical reasons; now routes to Groq via llm.call_llm.
    return call_llm(api_key, prompt, json_mode=json_mode)


def _normalize(moments: list[dict], duration: float) -> list[dict]:
    cleaned = []
    for m in moments:
        try:
            start = max(0.0, float(m["start"]))
            end = float(m["end"])
        except (KeyError, TypeError, ValueError):
            continue
        if duration:
            end = min(end, duration)
        dur = end - start
        if dur < 15 or dur > 120:
            # Clamp toward the valid window rather than dropping outright.
            if dur < 15:
                end = min(start + 30, duration or start + 30)
            else:
                end = start + 120
            dur = end - start
        if dur < 5:
            continue
        score = int(max(0, min(100, m.get("viral_score", 50))))
        cleaned.append({
            "start": round(start, 3),
            "end": round(end, 3),
            "duration": round(dur, 3),
            "title": str(m.get("title") or "Klip").strip()[:120],
            "viral_score": score,
            "hook_text": str(m.get("hook_text") or "").strip()[:200],
            "reason": str(m.get("reason") or "").strip()[:300],
        })

    # Resolve overlaps (keep higher score), then sort by score desc.
    cleaned.sort(key=lambda x: x["start"])
    non_overlap: list[dict] = []
    for m in cleaned:
        if non_overlap and m["start"] < non_overlap[-1]["end"]:
            if m["viral_score"] > non_overlap[-1]["viral_score"]:
                non_overlap[-1] = m
            continue
        non_overlap.append(m)
    non_overlap.sort(key=lambda x: x["viral_score"], reverse=True)
    return non_overlap[:6]


def _snap_to_segments(moments: list[dict], segments: list[dict]) -> list[dict]:
    """Pull each moment's start back to a segment start and its end forward to a
    segment end, so clips never begin/finish mid-sentence (point not cut off)."""
    segs = sorted((s for s in segments if "start" in s and "end" in s),
                  key=lambda s: s["start"])
    if not segs:
        return moments
    min_dur, max_dur = 26.0, 95.0
    out = []
    for m in moments:
        before = [s for s in segs if s["start"] <= m["start"] + 0.5]
        new_start = before[-1]["start"] if before else m["start"]
        after = [s for s in segs if s["end"] >= m["end"] - 0.5]
        new_end = after[0]["end"] if after else m["end"]
        if new_end - new_start < 5:
            new_start, new_end = m["start"], m["end"]
        # Too short to hold a full point — extend end to following sentence ends
        # until it reaches a sensible minimum (never cuts mid-sentence).
        if new_end - new_start < min_dur:
            for s in segs:
                if s["start"] >= new_end - 0.1 and s["end"] - new_start <= max_dur:
                    new_end = s["end"]
                    if new_end - new_start >= min_dur:
                        break
        out.append({**m, "start": round(new_start, 3), "end": round(new_end, 3),
                    "duration": round(new_end - new_start, 3)})
    # Snapping can create small overlaps; trim later clip starts to fix.
    out.sort(key=lambda x: x["start"])
    for i in range(1, len(out)):
        if out[i]["start"] < out[i - 1]["end"]:
            out[i]["start"] = out[i - 1]["end"]
            out[i]["duration"] = round(out[i]["end"] - out[i]["start"], 3)
    out.sort(key=lambda x: x["viral_score"], reverse=True)
    return out


def analyze(job_id: str, transcript_text: str, duration: float,
            api_key: Optional[str], segments: Optional[list[dict]] = None
            ) -> list[dict]:
    if not api_key:
        raise AppError("NO_API_KEY")
    jobs.check_cancelled(job_id)

    prompt = ANALYZE_PROMPT.format(transcript=transcript_text[:120000],
                                  duration=int(duration or 0))
    raw = _call_gemini(api_key, prompt, json_mode=True)
    try:
        parsed = _extract_json(raw)
        moments = parsed.get("moments", [])
    except (ValueError, json.JSONDecodeError) as e:
        raise AppError("GROQ_ERROR", detail=f"Parse gagal: {e}")

    moments = _normalize(moments, duration)
    if segments:
        moments = _snap_to_segments(moments, segments)
    if len(moments) < 2:
        raise AppError("NO_VIRAL_MOMENTS")

    jobs.save_raw(job_id, "moments", moments)
    return moments


def validate_key(api_key: str) -> dict:
    """Lightweight connectivity check used by /api/validate-key."""
    if not api_key:
        raise AppError("NO_API_KEY")
    text = _call_gemini(api_key, "Balas dengan satu kata: OK")
    return {"ok": True, "reply": (text or "").strip()[:50]}
