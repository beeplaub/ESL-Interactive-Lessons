"""Private Apple-Silicon Kokoro TTS service for BrenUp."""

from __future__ import annotations

import hmac
import logging
import os
import shutil
import subprocess
import tempfile
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from kokoro_mlx import KokoroTTS
from pydantic import BaseModel, Field
import soundfile as sf


MODEL_ID = os.getenv("KOKORO_MODEL", "mlx-community/Kokoro-82M-bf16")
MAX_TEXT_LENGTH = int(os.getenv("KOKORO_MAX_TEXT_LENGTH", "4000"))
SERVICE_TOKEN = os.getenv("KOKORO_API_KEY", "")
WARMUP_TEXT = "BrenUp voice service is ready."
OPUS_BITRATE = os.getenv("KOKORO_OPUS_BITRATE", "40k")
MAX_TRANSCODE_BYTES = int(os.getenv("KOKORO_MAX_TRANSCODE_BYTES", str(25 * 1024 * 1024)))

VOICES = {
    "af_heart": ("Heart", "Female", "American English"),
    "af_alloy": ("Alloy", "Female", "American English"),
    "af_aoede": ("Aoede", "Female", "American English"),
    "af_bella": ("Bella", "Female", "American English"),
    "af_jessica": ("Jessica", "Female", "American English"),
    "af_nova": ("Nova", "Female", "American English"),
    "af_kore": ("Kore", "Female", "American English"),
    "af_nicole": ("Nicole", "Female", "American English"),
    "af_river": ("River", "Female", "American English"),
    "af_sarah": ("Sarah", "Female", "American English"),
    "af_sky": ("Sky", "Female", "American English"),
    "am_adam": ("Adam", "Male", "American English"),
    "am_echo": ("Echo", "Male", "American English"),
    "am_eric": ("Eric", "Male", "American English"),
    "am_michael": ("Michael", "Male", "American English"),
    "am_liam": ("Liam", "Male", "American English"),
    "am_onyx": ("Onyx", "Male", "American English"),
    "am_puck": ("Puck", "Male", "American English"),
    "am_fenrir": ("Fenrir", "Male", "American English"),
    "am_santa": ("Santa", "Male", "American English"),
    "bf_alice": ("Alice", "Female", "British English"),
    "bf_emma": ("Emma", "Female", "British English"),
    "bf_isabella": ("Isabella", "Female", "British English"),
    "bf_lily": ("Lily", "Female", "British English"),
    "bm_daniel": ("Daniel", "Male", "British English"),
    "bm_george": ("George", "Male", "British English"),
    "bm_fable": ("Fable", "Male", "British English"),
    "bm_lewis": ("Lewis", "Male", "British English"),
}

model: KokoroTTS | None = None
model_lock = threading.Lock()
started_at = time.time()
logger = logging.getLogger("brenup.kokoro")


class SpeechRequest(BaseModel):
    model: str = "kokoro"
    input: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)
    voice: str = "af_heart"
    speed: float = Field(default=1.0, ge=0.75, le=1.5)
    response_format: str = "opus"


def require_token(authorization: str | None = Header(default=None)) -> None:
    if not SERVICE_TOKEN:
        raise HTTPException(status_code=503, detail="Service authentication is not configured.")
    supplied = authorization.removeprefix("Bearer ").strip() if authorization else ""
    if not hmac.compare_digest(supplied, SERVICE_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid service token.")


def load_and_warm_model() -> None:
    global model
    model = KokoroTTS.from_pretrained(MODEL_ID)
    with model_lock:
        model.generate(WARMUP_TEXT, voice="af_heart", speed=1.0, sample_rate=24000)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not SERVICE_TOKEN:
        raise RuntimeError("KOKORO_API_KEY must be configured before starting the service.")
    await run_in_threadpool(load_and_warm_model)
    yield


app = FastAPI(title="BrenUp Kokoro TTS", version="1.0.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "ok": model is not None,
        "model": MODEL_ID,
        "uptime_seconds": round(time.time() - started_at),
    }


@app.get("/v1/audio/voices", dependencies=[Depends(require_token)])
def voices() -> dict[str, object]:
    return {
        "voices": [
            {"id": voice_id, "name": data[0], "presentation": data[1], "language": data[2]}
            for voice_id, data in VOICES.items()
        ]
    }


def ffmpeg_path() -> str:
    # launchd starts services with PATH=/usr/bin:/bin:... and therefore cannot
    # discover Homebrew binaries on Apple Silicon without an explicit path.
    configured = os.getenv("FFMPEG_BINARY", "").strip()
    candidates = [configured, "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", shutil.which("ffmpeg") or ""]
    for candidate in candidates:
        if candidate and Path(candidate).is_file() and os.access(candidate, os.X_OK):
            return candidate
    raise RuntimeError("ffmpeg is not installed. Run the BrenUp Kokoro installer again to enable compact Opus audio.")


def encode_opus(input_path: Path) -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".opus", delete=False) as temporary:
        output_path = Path(temporary.name)
    try:
        subprocess.run(
            [
                ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error", "-i", str(input_path),
                "-vn", "-ac", "1", "-ar", "24000", "-c:a", "libopus", "-b:a", OPUS_BITRATE,
                "-vbr", "on", str(output_path),
            ],
            check=True,
            timeout=60,
        )
        audio = output_path.read_bytes()
        if len(audio) < 128:
            raise RuntimeError("ffmpeg returned an invalid Opus file.")
        return audio
    finally:
        output_path.unlink(missing_ok=True)


def synthesize(request: SpeechRequest) -> tuple[bytes, float, str]:
    if model is None:
        raise RuntimeError("Kokoro is not ready.")
    if request.voice not in VOICES:
        raise ValueError(f"Unsupported voice: {request.voice}")
    if request.response_format not in {"wav", "opus"}:
        raise ValueError("response_format must be wav or opus.")

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temporary:
        output_path = Path(temporary.name)
    try:
        with model_lock:
            model.save(
                request.input.strip(),
                output_path,
                voice=request.voice,
                speed=request.speed,
                sample_rate=24000,
            )
        duration = float(sf.info(output_path).duration)
        if request.response_format == "wav":
            return output_path.read_bytes(), duration, "audio/wav"
        return encode_opus(output_path), duration, "audio/ogg"
    finally:
        output_path.unlink(missing_ok=True)


@app.post("/v1/audio/speech", dependencies=[Depends(require_token)])
async def speech(request: SpeechRequest) -> Response:
    try:
        audio, duration, mime_type = await run_in_threadpool(synthesize, request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        logger.exception("Kokoro speech generation failed")
        raise HTTPException(status_code=500, detail="Speech generation failed.") from error
    return Response(
        content=audio,
        media_type=mime_type,
        headers={
            "Cache-Control": "no-store",
            "X-Audio-Duration": f"{duration:.3f}",
            "X-TTS-Model": "kokoro-82m",
        },
    )


@app.post("/v1/audio/transcode", dependencies=[Depends(require_token)])
async def transcode(request: Request, content_type: str | None = Header(default=None)) -> Response:
    """Convert creator-uploaded lossless/oversized audio to compact 24kHz mono Opus."""
    if content_type and not content_type.lower().startswith("audio/"):
        raise HTTPException(status_code=415, detail="Only audio files can be optimized.")
    payload = await request.body()
    if not payload:
        raise HTTPException(status_code=400, detail="Audio is required.")
    if len(payload) > MAX_TRANSCODE_BYTES:
        raise HTTPException(status_code=413, detail="Audio is too large to optimize.")
    suffix = ".wav"
    if content_type and "mpeg" in content_type.lower():
        suffix = ".mp3"
    elif content_type and "mp4" in content_type.lower():
        suffix = ".m4a"
    elif content_type and "webm" in content_type.lower():
        suffix = ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temporary:
        input_path = Path(temporary.name)
        temporary.write(payload)
    try:
        audio = await run_in_threadpool(encode_opus, input_path)
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("Audio transcoding failed")
        raise HTTPException(status_code=500, detail="Audio optimization failed.") from error
    finally:
        input_path.unlink(missing_ok=True)
    return Response(
        content=audio,
        media_type="audio/ogg",
        headers={
            "Cache-Control": "no-store",
            "X-Audio-Codec": "opus",
            "X-Audio-Original-Bytes": str(len(payload)),
        },
    )
