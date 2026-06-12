# CUDA 12.1 runtime with cuDNN — matches torch cu121 wheels + faster-whisper.
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    JOBS_DIR=/app/jobs

# System deps: python, ffmpeg (with nvenc via the host driver), fonts, build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.11 python3.11-dev python3-pip \
        ffmpeg \
        fonts-dejavu-core fontconfig \
        libgl1 libglib2.0-0 \
        git curl ca-certificates unzip \
    && ln -sf /usr/bin/python3.11 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install torch from the CUDA 12.1 index first, then the rest.
COPY requirements.txt .
RUN python -m pip install --upgrade pip && \
    python -m pip install torch==2.4.1 torchvision==0.19.1 \
        --index-url https://download.pytorch.org/whl/cu121 && \
    python -m pip install -r requirements.txt && \
    python -m pip install -U --pre yt-dlp && \
    python -m pip install -U yt-dlp-ejs

# Deno: JS runtime yt-dlp uses (with yt-dlp-ejs) to solve YouTube's JS
# signature / n-challenges — without it YouTube exposes no video formats.
RUN curl -fsSL -o /tmp/deno.zip \
        https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip && \
    unzip -o /tmp/deno.zip -d /usr/local/bin && \
    chmod +x /usr/local/bin/deno && rm -f /tmp/deno.zip && \
    /usr/local/bin/deno --version

# Pre-fetch the YOLOv8m weights so the first job doesn't stall on download.
RUN python -c "from ultralytics import YOLO; YOLO('yolov8m.pt')" || true

COPY . .

EXPOSE 8000

# Self-update yt-dlp on every start happens inside the app lifespan as well.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
