# BrenUp Kokoro TTS Service

Private Apple-Silicon speech service used by BrenUp for standard English voiceovers.

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
- Generated previews continue through BrenUp's existing R2 and Media Library pipeline.

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
