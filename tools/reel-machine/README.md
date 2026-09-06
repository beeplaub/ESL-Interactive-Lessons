# Local Reel Machine

## Creator Tools integration

Open `/admin/creator-tools/reels` in the locally running BrenUp app. The Creator Tools page now links to this studio. It supports 1–5 topics, editable four-scene scripts, five English voices, background rendering, batch progress, video previews, MP4/script/subtitle downloads, and reusing a previous batch's scripts. The five starter reels appear automatically when their local output folder exists.

The free studio requires a freshly verified staff role on every API request, following the Creator Tools page/QR utility access boundary. Existing paid/cloud AI features retain their flags and plan checks. Files are stored under a creator-specific directory, and downloads resolve only within the authenticated creator's directory (plus the shared starter samples). No database permissions or publishing states are changed.

Web script generation extends `callGemini` with an explicit self-hosted reel-only option. It uses fixed loopback Ollama, schema validation, the existing cache/locks/telemetry, and zero cloud credit reservations. It cannot fall back to paid providers. Authentication, cache and telemetry use the app's existing backend; the app is not an offline UI. Rendering uses `web_render.py` in a detached process with a bounded runtime and a global render lock. The subprocess receives no application secrets and runs with `--render-only` and offline model loading. A refreshed page can recover batch scripts and progress.

The hosted/Vercel app displays the studio but cannot execute the Mac engine. A secure remote engine connection is not implemented. Run the app on the Mac to enable generation. The first UI version uses the procedural landscape renderer; custom image libraries and ComfyUI remain CLI options.

Verification: `node --test tests/reel-studio.test.mjs` tests validation, byte ranges, auth/file boundaries, and zero-paid-fallback behavior.

Standalone, local draft-video worker. Uses Ollama for scripts, Kokoro MLX for English narration, Pillow for illustrations/text and FFmpeg for vertical MP4s. It does not load BrenUp environment files, invoke cloud providers, change application data, or publish anything.

## First batch

From the repository root:

```sh
sh tools/reel-machine/run.sh --count 5
```

Open `tools/reel-machine/output/first-5/index.html` to preview and download the results. Outputs and downloaded dependencies are ignored by Git. Each numbered directory contains editable `script.json`, scene PNGs/WAVs, `captions.srt`, a thumbnail, and `reel.mp4`. The large text in the video is a scene headline; full narration is supplied as a separate SRT file, not word-by-word burned captions.

The default batch mixes clearly labeled microfiction, reflections and creative challenges. Illustrations are original procedural landscapes, not prompt-conditioned AI images. No stock subscriptions or paid APIs are used. Review wording and pronunciation before publishing.

## Your own genres

Create a JSON file containing pairs of genre and topic:

```json
[
  ["microfiction", "A librarian discovers a book that remembers its readers"],
  ["creative challenge", "Invent a new constellation and its story"]
]
```

```sh
sh tools/reel-machine/run.sh --topics my-topics.json --count 2 --output tools/reel-machine/output/my-batch
```

Supply at least one unique topic per reel. Use a new output directory for a new batch. To edit a batch, run with `--scripts-only`, edit its scripts, then rerun the same command without that flag. Generated scripts have four scenes. Manually authored reels support 1–10 scenes with narration (1–400 characters) and centered captions (1–90 characters). Completed reels are skipped if their content and voice are unchanged. Failed rendering jobs can be retried with the same command; cached narration is reused. A filesystem lock prevents two workers running the same batch. Script-generation errors stop the batch and preserve earlier scripts.

## Creator studio uploads and voices

Open `/admin/creator-tools/reels` on this Mac and choose **Add a reel with my own scenes**. Add an image, caption and voice narration to each scene; use Add scene and Move up/down to arrange up to ten scenes. Images are cropped to portrait. Each scene lasts as long as its narration plus a short pause. Render up to five reels per batch, preview, then download MP4 or subtitles.

Uploads accept JPEG, PNG and WebP up to 10 MB / 40 megapixels. The server decodes and normalizes images, strips metadata, and stores them under the authenticated creator's local output directory. The worker receives copies, never arbitrary client file paths. Unused uploads remain local; deleting a scene from the editor does not delete an existing draft or its source file.

Kokoro is the default local voice. Gemini TTS is optional and uses the existing authenticated voiceover endpoint, credit checks, generation locks and cache. Narration is sent to Google; images remain local. The render endpoint checks creator ownership, expiry and the exact narration/voice hash before copying the generated audio into the local batch. Gemini mode requires prepared audio and never silently falls back to Kokoro. Local rendering still requires this Mac even with Gemini selected. Editor changes are not saved until rendering starts.

## Visual sources

Default: deterministic local landscape illustrations.

Use your own images:

```sh
sh tools/reel-machine/run.sh --images /absolute/path/to/images --output tools/reel-machine/output/image-batch
```

Images cycle in filename order and are cropped to vertical. Use assets you have permission to publish.

For prompt-conditioned AI images, install and run local ComfyUI on port 8188, load a model that fits your machine, and export an **API-format workflow** containing a SaveImage node. Replace the positive prompt value with `__PROMPT__` and the sampler seed value with the string `__SEED__`. The worker substitutes each scene prompt and a deterministic seed, queues the workflow, downloads its first output image, and caches it:

```sh
sh tools/reel-machine/run.sh --comfy-workflow /absolute/path/to/workflow.json --output tools/reel-machine/output/ai-images
```

Use only trusted, local workflows; avoid cloud/API nodes. ComfyUI and image models are not installed by this tool. This optional adapter needs verification against your installed workflow. On 16 GB RAM, run image generation conservatively; the voice model remains loaded during rendering.

## Dependencies and configuration

This Mac already has Ollama, FFmpeg, and a Kokoro MLX Python environment. `run.sh` reuses that environment directly, without reading its service credentials. GPU access is required. Ollama must be running at `127.0.0.1:11434`. Default script model: `qwen2.5:7b`; override with `--model`. Default voice: `af_heart`; override with `--voice`.

Pillow is installed locally in `.deps`. To reinstall it:

```sh
uv pip install --python "$HOME/Library/Application Support/BrenUp/kokoro-tts/.venv/bin/python" --target tools/reel-machine/.deps Pillow==12.3.0
```

Set `REEL_PYTHON` to use another Python with `kokoro_mlx` and `soundfile`. Set `REEL_FONT` to a TTF file on other machines. Default font is macOS Arial. Output is H.264/AAC, 1080×1920, 24 fps, with subtle motion. Audio duration controls scene timing. Each completed MP4 is checked for dimensions, audio and expected duration. Processing is sequential to limit memory use. Electricity, storage, and initial model downloads still consume resources.
