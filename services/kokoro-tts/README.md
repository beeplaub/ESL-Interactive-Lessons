# BrenUp Kokoro TTS Service

Private Apple-Silicon speech service used by BrenUp for standard English voiceovers and creator-only local transcription.

## Install on the BrenUp Mac

The launch agent runs from `~/Library/Application Support/BrenUp/kokoro-tts` because macOS blocks background agents from reading executables in `Documents`. Source remains in this repository.

Prerequisites: Homebrew `uv`, Python 3.12, `espeak-ng`, `ffmpeg`, and `cloudflared`. The installer adds `ffmpeg` when it is missing. Keep the service `.env.local`, tunnel certificate, and tunnel credentials out of Git.

```bash
chmod 700 services/kokoro-tts/install-macos.sh
services/kokoro-tts/install-macos.sh
```

## Security

- Listens on `127.0.0.1` only.
- Every `/v1/*` request requires `Authorization: Bearer <KOKORO_API_KEY>`.
- A Cloudflare Tunnel may expose the service, but the bearer token remains mandatory.
- The transcription browser endpoint accepts only a short-lived, one-use HMAC permit issued after BrenUp verifies the current creator role. It derives that permit from the existing server-only service token; the reusable token is never sent to the browser.
- Browser origins are restricted to `https://www.brenup.com`, `https://brenup.com`, and local development by default. Add an exact Vercel preview origin to `KOKORO_STT_ALLOWED_ORIGINS` if preview testing is needed.
- Generated previews continue through BrenUp's existing R2 and Media Library pipeline.

## Local transcription

The Creator Tools page sends the selected audio/video file directly from the browser to `https://tts.brenup.com/v1/audio/transcriptions`. Vercel checks staff access and returns a 120-second, one-use permit; it never receives the media body. The Mac trims the requested time range with FFmpeg, transcribes it with `mlx-whisper` on Apple Silicon, returns editable text and timestamped segments, then deletes both temporary media files. Audio and transcript are not written to R2, Supabase, or the Media Library.

The first transcription downloads the configured MLX Whisper model to Hugging Face's local model cache. This is model data, not user audio. The model is loaded on its first use and remains cached in the service process to make later requests faster. Requests are serialized with Kokoro generation to avoid competing for unified memory. The default model is `mlx-community/whisper-small-mlx`; set `KOKORO_STT_MODEL` in the Mac service's ignored `.env.local` to use another MLX Whisper checkpoint.

### Configure the app and Mac

1. In the Vercel project, ensure the existing server-only `KOKORO_TTS_URL` is `https://tts.brenup.com` and `KOKORO_TTS_API_KEY` matches the Mac service's `KOKORO_API_KEY`. These values stay private and are reused; no new signing secret is required.
2. On the Mac, add the following settings to `services/kokoro-tts/.env.local` without replacing its existing values:

   ```dotenv
   KOKORO_STT_MODEL=mlx-community/whisper-small-mlx
   KOKORO_STT_ALLOWED_ORIGINS=https://www.brenup.com,https://brenup.com,http://localhost:3000
   ```

3. Run `services/kokoro-tts/install-macos.sh` from the BrenUp repository on the Mac. It installs the pinned MLX Whisper package into the existing private environment, copies the service files, and restarts the local service and configured tunnel. The first model download happens on the first transcription request.

The upload is capped at 90 MB and the selected section at 10 minutes. The whole source file is sent directly to the Mac so FFmpeg can accurately trim it, but only the chosen range is passed to Whisper. If the Mac is off or its tunnel is unavailable, the page reports that local transcription is unavailable. Direct media URLs work only when the browser can fetch them with CORS; YouTube watch links cannot expose their audio to this tool and must be replaced with an uploaded media file.

## Local health check

```bash
curl http://127.0.0.1:8880/health
```

## Provider routing

BrenUp uses Kokoro for English when `VOICEOVER_PROVIDER=auto` and the Kokoro endpoint is configured. Gemini remains the fallback and handles unsupported languages.

Natural English uses Kokoro. Explicit expressive styles and non-English languages use Gemini. New Kokoro output is returned as 24kHz mono Opus at 40 kbps, then follows the existing R2 save, Media Library, cache, and AI-usage pipeline. WAV remains available only for compatibility or diagnostics.

## Audio optimization

`POST /v1/audio/transcode` is a private, bearer-token protected endpoint for BrenUp's server. It converts lossless or oversized creator audio to 24kHz mono Opus before permanent R2 storage. BrenUp always retains the original if this local service is unavailable, so a temporary Mac Mini outage cannot cause creators to lose an upload.

## Cloudflare Tunnel

The production origin is `https://tts.brenup.com`, routed to localhost through the named `brenup-kokoro` tunnel. The public hostname still requires the service bearer token for all generation routes.

The tunnel has its own `com.brenup.cloudflared` launch agent because Homebrew's generic service does not pass `tunnel run`.
