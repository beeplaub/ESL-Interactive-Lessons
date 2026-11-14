"""Private Apple-Silicon Kokoro TTS service for BrenUp."""

from __future__ import annotations

import hmac
import base64
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from kokoro_mlx import KokoroTTS
from pydantic import BaseModel, Field
import soundfile as sf


MODEL_ID = os.getenv("KOKORO_MODEL", "mlx-community/Kokoro-82M-bf16")
MAX_TEXT_LENGTH = int(os.getenv("KOKORO_MAX_TEXT_LENGTH", "4000"))
SERVICE_TOKEN = os.getenv("KOKORO_API_KEY", "")
WARMUP_TEXT = "BrenUp voice service is ready."
OPUS_BITRATE = os.getenv("KOKORO_OPUS_BITRATE", "40k")
MAX_TRANSCODE_BYTES = int(os.getenv("KOKORO_MAX_TRANSCODE_BYTES", str(25 * 1024 * 1024)))
STT_MODEL_ID = os.getenv("KOKORO_STT_MODEL", "mlx-community/whisper-small-mlx")
STT_MAX_UPLOAD_BYTES = int(os.getenv("KOKORO_STT_MAX_UPLOAD_BYTES", str(90 * 1024 * 1024)))
STT_MAX_CLIP_SECONDS = int(os.getenv("KOKORO_STT_MAX_CLIP_SECONDS", "600"))
STT_ALLOWED_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv("KOKORO_STT_ALLOWED_ORIGINS", "https://www.brenup.com,https://brenup.com,http://localhost:3000").split(",")
    if origin.strip()
]

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
used_stt_permits: dict[str, int] = {}
used_stt_permits_lock = threading.Lock()


class SpeechRequest(BaseModel):
    model: str = "kokoro"
    input: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)
    voice: str = "af_heart"
    # Keep the lower range available for deliberate ESL listening practice.
    speed: float = Field(default=1.0, ge=0.5, le=1.5)
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
app.add_middleware(
    CORSMiddleware,
    allow_origins=STT_ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Start-Seconds", "X-End-Seconds", "X-Language", "X-File-Name"],
    max_age=600,
)


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


def _b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def consume_stt_permit(authorization: str | None) -> dict[str, object]:
    if not SERVICE_TOKEN:
        raise HTTPException(status_code=503, detail="Transcription authentication is not configured.")
    supplied = authorization.removeprefix("Bearer ").strip() if authorization else ""
    parts = supplied.split(".")
    if len(parts) != 3 or parts[0] != "v1":
        raise HTTPException(status_code=401, detail="Transcription permission is invalid or expired. Request a new one.")

    signing_key = hmac.new(SERVICE_TOKEN.encode(), b"brenup-kokoro-stt-permit-v1", "sha256").digest()
    signed = f"{parts[0]}.{parts[1]}"
    expected = base64.urlsafe_b64encode(hmac.new(signing_key, signed.encode(), "sha256").digest()).rstrip(b"=").decode()
    if not hmac.compare_digest(expected, parts[2]):
        raise HTTPException(status_code=401, detail="Transcription permission is invalid or expired. Request a new one.")

    try:
        claims = json.loads(_b64url_decode(parts[1]))
        now = int(time.time())
        issued = int(claims["iat"])
        expires = int(claims["exp"])
        user_id = str(claims["sub"])
        nonce = str(claims["jti"])
        if (
            claims.get("aud") != "brenup-kokoro-stt"
            or claims.get("scope") != "transcribe"
            or claims.get("role") not in {"ADMIN", "TEACHER", "SCHOOL_ADMIN"}
            or not user_id
            or not nonce
            or issued > now + 30
            or expires <= now
            or expires - issued > 120
        ):
            raise ValueError("Invalid claims")
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=401, detail="Transcription permission is invalid or expired. Request a new one.") from None

    with used_stt_permits_lock:
        for old_nonce, old_expiry in list(used_stt_permits.items()):
            if old_expiry <= now:
                used_stt_permits.pop(old_nonce, None)
        if nonce in used_stt_permits:
            raise HTTPException(status_code=401, detail="This transcription permission was already used. Request a new one.")
        if len(used_stt_permits) >= 4096:
            raise HTTPException(status_code=429, detail="The local transcription service is busy. Try again shortly.")
        used_stt_permits[nonce] = expires
    return claims


def safe_file_suffix(value: str | None) -> str:
    name = (value or "audio").split("?", 1)[0].split("#", 1)[0]
    suffix = Path(name).suffix.lower()
    return suffix if re.fullmatch(r"\.[a-z0-9]{1,8}", suffix) else ".media"


def probe_media(path: Path) -> float:
    result = subprocess.run(
        [
            shutil.which("ffprobe") or "ffprobe", "-v", "error", "-show_entries",
            "format=duration:stream=codec_type", "-of", "json", str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=20,
    )
    metadata = json.loads(result.stdout)
    if not any(stream.get("codec_type") == "audio" for stream in metadata.get("streams", [])):
        raise ValueError("This file does not contain an audio track.")
    duration = float(metadata.get("format", {}).get("duration", 0))
    if not duration or duration <= 0:
        raise ValueError("Could not read the media duration.")
    return duration


def transcribe_clip(source_path: Path, start: float, end: float, language: str | None) -> dict[str, object]:
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temporary:
        clip_path = Path(temporary.name)
    try:
        subprocess.run(
            [
                ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{start:.3f}",
                "-i", str(source_path), "-t", f"{end - start:.3f}", "-map", "0:a:0", "-vn",
                "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(clip_path),
            ],
            check=True,
            capture_output=True,
            timeout=120,
        )
        import mlx_whisper

        with model_lock:
            result = mlx_whisper.transcribe(
                str(clip_path),
                path_or_hf_repo=STT_MODEL_ID,
                language=language,
                temperature=0.0,
                verbose=False,
            )
        transcript = str(result.get("text") or "").strip()
        segments = []
        for segment in result.get("segments", []):
            text = str(segment.get("text") or "").strip()
            if not text:
                continue
            segment_start = float(segment.get("start", 0)) + start
            segment_end = float(segment.get("end", 0)) + start
            segments.append({"text": text[:2000], "start": round(segment_start, 2), "end": round(segment_end, 2)})
        return {"transcript": transcript[:50_000], "segments": segments[:1500], "language": result.get("language")}
    finally:
        clip_path.unlink(missing_ok=True)


@app.post("/v1/audio/transcriptions")
async def transcriptions(request: Request, authorization: str | None = Header(default=None)) -> JSONResponse:
    consume_stt_permit(authorization)
    try:
        start = float(request.headers.get("x-start-seconds", "0"))
        end = float(request.headers.get("x-end-seconds", "0"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Choose a valid start and end time.") from None
    if start < 0 or end <= start or end - start > STT_MAX_CLIP_SECONDS:
        raise HTTPException(status_code=400, detail=f"Choose a clip up to {STT_MAX_CLIP_SECONDS // 60} minutes long.")

    language_value = request.headers.get("x-language", "auto").strip().lower()
    if language_value not in {"auto", "en", "bn"}:
        raise HTTPException(status_code=400, detail="Choose automatic, English, or Bengali detection.")
    language = None if language_value == "auto" else language_value

    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > STT_MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="The selected file is too large. Keep it under 90 MB.")
        except ValueError:
            raise HTTPException(status_code=400, detail="The upload size is invalid.") from None

    suffix = safe_file_suffix(request.headers.get("x-file-name"))
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temporary:
        source_path = Path(temporary.name)
        total_bytes = 0
        try:
            async for chunk in request.stream():
                total_bytes += len(chunk)
                if total_bytes > STT_MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="The selected file is too large. Keep it under 90 MB.")
                temporary.write(chunk)
        except Exception:
            source_path.unlink(missing_ok=True)
            raise

    try:
        if total_bytes == 0:
            raise HTTPException(status_code=400, detail="Choose an audio or video file first.")
        try:
            source_duration = await run_in_threadpool(probe_media, source_path)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, json.JSONDecodeError, ValueError):
            raise HTTPException(status_code=415, detail="This file could not be read as audio or video.") from None
        if end > source_duration + 0.1:
            raise HTTPException(status_code=400, detail="The selected end time is longer than the media.")
        try:
            result = await run_in_threadpool(transcribe_clip, source_path, start, end, language)
        except HTTPException:
            raise
        except ImportError:
            logger.exception("Local STT dependency is unavailable")
            raise HTTPException(status_code=503, detail="Local transcription is not installed on the Mac yet.") from None
        except Exception:
            logger.exception("Local speech transcription failed")
            raise HTTPException(status_code=503, detail="The Mac could not transcribe this clip. Try a shorter section.") from None
        if not result["transcript"]:
            raise HTTPException(status_code=422, detail="No speech was detected in that section.")
        return JSONResponse(
            result,
            headers={"Cache-Control": "no-store, max-age=0", "Pragma": "no-cache"},
        )
    finally:
        source_path.unlink(missing_ok=True)


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
