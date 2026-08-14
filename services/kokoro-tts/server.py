"""Private Apple-Silicon Kokoro TTS service for BrenUp."""

from __future__ import annotations

import hmac
import logging
import os
import tempfile
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from kokoro_mlx import KokoroTTS
from pydantic import BaseModel, Field
import soundfile as sf


MODEL_ID = os.getenv("KOKORO_MODEL", "mlx-community/Kokoro-82M-bf16")
MAX_TEXT_LENGTH = int(os.getenv("KOKORO_MAX_TEXT_LENGTH", "4000"))
SERVICE_TOKEN = os.getenv("KOKORO_API_KEY", "")
WARMUP_TEXT = "BrenUp voice service is ready."

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
    speed: float = Field(default=1.0, ge=0.6, le=1.5)
    response_format: str = "wav"


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


def synthesize(request: SpeechRequest) -> tuple[bytes, float]:
    if model is None:
        raise RuntimeError("Kokoro is not ready.")
    if request.voice not in VOICES:
        raise ValueError(f"Unsupported voice: {request.voice}")
    if request.response_format != "wav":
        raise ValueError("BrenUp currently requests WAV output only.")

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
        return output_path.read_bytes(), duration
    finally:
        output_path.unlink(missing_ok=True)


@app.post("/v1/audio/speech", dependencies=[Depends(require_token)])
async def speech(request: SpeechRequest) -> Response:
    try:
        audio, duration = await run_in_threadpool(synthesize, request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        logger.exception("Kokoro speech generation failed")
        raise HTTPException(status_code=500, detail="Speech generation failed.") from error
    return Response(
        content=audio,
        media_type="audio/wav",
        headers={
            "Cache-Control": "no-store",
            "X-Audio-Duration": f"{duration:.3f}",
            "X-TTS-Model": "kokoro-82m",
        },
    )
