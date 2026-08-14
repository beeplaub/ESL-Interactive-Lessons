#!/usr/bin/env python3
"""Generate a small BrenUp Kokoro voice-quality and speed benchmark."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import soundfile as sf
from kokoro_mlx import KokoroTTS


SAMPLE_TEXT = (
    "Welcome to BrenUp. Today, we are going to practise clear, confident English. "
    "Listen carefully to the rhythm of each sentence, notice the stressed words, "
    "and then say the ideas aloud in your own voice. Remember, progress does not "
    "come from being perfect. It comes from showing up, trying again, and speaking "
    "with a little more confidence each day."
)

VOICES = ("af_heart", "af_bella", "am_michael", "bf_emma", "bm_george")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("/private/tmp/brenup-kokoro-samples"))
    parser.add_argument("--voices", nargs="*", default=list(VOICES))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    started = time.perf_counter()
    tts = KokoroTTS.from_pretrained()
    model_load_seconds = time.perf_counter() - started
    results: list[dict[str, object]] = []

    for voice in args.voices:
        output_path = args.output / f"{voice}.wav"
        voice_started = time.perf_counter()
        tts.save(SAMPLE_TEXT, output_path, voice=voice, speed=1.0, sample_rate=24000)
        generation_seconds = time.perf_counter() - voice_started
        info = sf.info(output_path)
        results.append(
            {
                "voice": voice,
                "path": str(output_path),
                "audio_seconds": round(info.duration, 3),
                "generation_seconds": round(generation_seconds, 3),
                "realtime_factor": round(generation_seconds / info.duration, 3),
                "file_bytes": output_path.stat().st_size,
            }
        )

    report = {
        "model": "mlx-community/Kokoro-82M-bf16",
        "model_load_seconds": round(model_load_seconds, 3),
        "sample_text": SAMPLE_TEXT,
        "results": results,
    }
    report_path = args.output / "benchmark.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
