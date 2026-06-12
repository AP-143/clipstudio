"""Single LLM entrypoint — talks to Groq's OpenAI-compatible chat API.

Only text is ever sent (transcript / summary), never the video. Used by
analyzer (viral-moment detection) and effects (ffmpeg filter generation).
The API key is supplied per-request and never persisted server-side.

Uses the stdlib (urllib) on purpose so no extra dependency / image rebuild
is needed.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request

from config import GROQ_BASE_URL, GROQ_MODEL
from errors import AppError


def call_llm(api_key: str, prompt: str, *, json_mode: bool = False,
             temperature: float = 0.7) -> str:
    """Send a single user prompt to Groq and return the assistant text.

    Raises AppError with the existing codes so the API/UI layer is unchanged:
    GROQ_QUOTA on 429, NO_API_KEY on 401/403, GROQ_ERROR otherwise.
    """
    if not api_key:
        raise AppError("NO_API_KEY")

    payload = {
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    req = urllib.request.Request(
        f"{GROQ_BASE_URL}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            # Groq sits behind Cloudflare which 1010-bans the default
            # "Python-urllib/x" UA; send a normal one.
            "User-Agent": "ClipStudio/1.0 (+https://github.com)",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")[:600]
        if e.code == 429:
            raise AppError("GROQ_QUOTA", detail=detail)
        if e.code in (401, 403):
            raise AppError("NO_API_KEY", detail=detail)
        raise AppError("GROQ_ERROR", detail=f"HTTP {e.code}: {detail}")
    except urllib.error.URLError as e:
        raise AppError("GROQ_ERROR", detail=f"Koneksi gagal: {e.reason}")

    try:
        return body["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, TypeError):
        raise AppError("GROQ_ERROR", detail="Respons AI kosong / format tak terduga")
