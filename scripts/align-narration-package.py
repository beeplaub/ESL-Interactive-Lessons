#!/usr/bin/env python3
"""Align a lesson/course narration package locally with WhisperX.

Usage: python3 scripts/align-narration-package.py input.json output.json

This script downloads only the audio URLs in the creator-exported package,
runs forced alignment on this Mac (CPU), and writes timing-only results.
"""

from __future__ import annotations

import json
import re
import sys
import tempfile
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

MAX_AUDIO_BYTES = 200 * 1024 * 1024
DEVICE = "cpu"


def expected_word_count(text: str) -> int:
    return sum(1 for token in re.findall(r"\S+", text) if any(char.isalnum() for char in token))


def download_audio(url: str, directory: Path, index: int) -> Path:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("Audio links must use HTTPS.")

    suffix = Path(parsed.path).suffix.lower()
    if not re.fullmatch(r"\.[a-z0-9]{1,8}", suffix):
        suffix = ".audio"
    destination = directory / f"narration-{index}{suffix}"
    request = urllib.request.Request(url, headers={"User-Agent": "BrenUp local narration aligner"})
    with urllib.request.urlopen(request, timeout=90) as response, destination.open("wb") as output:
        content_length = response.headers.get("Content-Length")
        if content_length and int(content_length) > MAX_AUDIO_BYTES:
            raise ValueError("Audio file is larger than the 200 MB local alignment limit.")
        total = 0
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_AUDIO_BYTES:
                raise ValueError("Audio file is larger than the 200 MB local alignment limit.")
            output.write(chunk)
    return destination


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2

    input_path, output_path = map(Path, sys.argv[1:])
    try:
        package = json.loads(input_path.read_text(encoding="utf-8"))
    except Exception as error:
        print(f"Could not read the package: {error}", file=sys.stderr)
        return 2
    if package.get("version") != 1 or not isinstance(package.get("items"), list):
        print("This is not a supported narration sync package.", file=sys.stderr)
        return 2

    try:
        import whisperx
    except ImportError:
        print("WhisperX is missing. Install it in your local Python environment with: python3 -m pip install whisperx", file=sys.stderr)
        return 2

    models = {}
    results = []
    failures = []
    items = package["items"]
    print(f"Aligning {len(items)} narration slide(s) locally on {DEVICE.upper()}.")

    with tempfile.TemporaryDirectory(prefix="brenup-narration-") as temporary:
        workdir = Path(temporary)
        for index, item in enumerate(items, start=1):
            title = item.get("slideTitle") or f"Slide {index}"
            print(f"[{index}/{len(items)}] {title}", flush=True)
            try:
                transcript = str(item.get("transcript") or "").strip()
                audio_url = str(item.get("audioUrl") or "")
                language = str(item.get("language") or "en")
                if not transcript or not audio_url:
                    raise ValueError("The slide is missing its transcript or audio link.")
                if language not in models:
                    print(f"Loading the {language} alignment model (first run may download it locally).", flush=True)
                    models[language] = whisperx.load_align_model(language_code=language, device=DEVICE)
                model, metadata = models[language]
                audio_path = download_audio(audio_url, workdir, index)
                audio = whisperx.load_audio(str(audio_path))
                duration = len(audio) / 16000
                aligned = whisperx.align(
                    [{"start": 0.0, "end": duration, "text": transcript}],
                    model,
                    metadata,
                    audio,
                    DEVICE,
                    return_char_alignments=False,
                )
                words = []
                for segment in aligned.get("segments", []):
                    for word in segment.get("words", []):
                        start, end = word.get("start"), word.get("end")
                        token = str(word.get("word") or "").strip()
                        if token and isinstance(start, (int, float)) and isinstance(end, (int, float)) and end > start:
                            words.append({"word": token, "start": round(float(start), 3), "end": round(float(end), 3)})

                expected = expected_word_count(transcript)
                if len(words) != expected:
                    raise ValueError(f"Alignment returned {len(words)} of {expected} transcript words; this slide was left out for review.")
                results.append({
                    "lessonId": item["lessonId"],
                    "slideId": item["slideId"],
                    "sourceFingerprint": item["sourceFingerprint"],
                    "durationSeconds": round(duration, 3),
                    "words": words,
                })
                print(f"  Ready: {len(words)} word timings.", flush=True)
            except Exception as error:
                failures.append({"slideTitle": title, "error": str(error)})
                print(f"  Skipped: {error}", file=sys.stderr, flush=True)

    output = {
        "version": 1,
        "courseId": package["courseId"],
        "items": results,
        "failures": failures,
    }
    output_path.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Saved {len(results)} result(s) and {len(failures)} review item(s) to {output_path}.")
    return 0 if results else 1


if __name__ == "__main__":
    raise SystemExit(main())
