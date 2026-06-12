"""Structured, user-facing errors with Indonesian messages + solutions."""
from __future__ import annotations

ERRORS = {
    "NO_API_KEY": {
        "message": "Groq API Key belum diset / tidak valid",
        "solution": "Buka Settings dan masukkan API key dari console.groq.com",
    },
    "YOUTUBE_NOT_1080P": {
        "message": "Video YouTube tidak tersedia dalam 1080p",
        "solution": "Upload cookies YouTube di Settings, atau upload file video langsung",
    },
    "VIDEO_TOO_SHORT": {
        "message": "Video terlalu pendek (minimal 2 menit)",
        "solution": "Gunakan video lebih panjang untuk hasil optimal",
    },
    "NO_VIRAL_MOMENTS": {
        "message": "Tidak ditemukan momen viral yang cukup",
        "solution": "Coba video dengan konten lebih bervariasi seperti podcast atau wawancara",
    },
    "FILE_TOO_LARGE": {
        "message": "File terlalu besar (maksimal 2 GB)",
        "solution": "Compress video atau gunakan URL YouTube",
    },
    "UNSUPPORTED_FORMAT": {
        "message": "Format tidak didukung",
        "solution": "Gunakan mp4, mov, atau avi",
    },
    "GPU_NOT_AVAILABLE": {
        "message": "NVIDIA GPU tidak terdeteksi, beralih ke CPU",
        "solution": "Pastikan NVIDIA driver dan CUDA terinstall",
    },
    "GROQ_QUOTA": {
        "message": "Groq API rate limit / quota tercapai",
        "solution": "Tunggu beberapa saat lalu coba lagi, atau cek limit di console.groq.com",
    },
    "GROQ_ERROR": {
        "message": "Groq API gagal merespons",
        "solution": "Periksa API key dan koneksi internet, lalu coba lagi",
    },
    "INTERNAL": {
        "message": "Terjadi kesalahan internal",
        "solution": "Coba ulangi prosesnya atau periksa log server",
    },
}


class AppError(Exception):
    """Carries a known error code -> {message, solution} for the API layer."""

    def __init__(self, code: str, detail: str | None = None):
        self.code = code if code in ERRORS else "INTERNAL"
        self.detail = detail
        info = ERRORS[self.code]
        super().__init__(info["message"])

    def to_dict(self) -> dict:
        info = ERRORS[self.code]
        return {
            "code": self.code,
            "message": info["message"],
            "solution": info["solution"],
            "detail": self.detail,
        }
