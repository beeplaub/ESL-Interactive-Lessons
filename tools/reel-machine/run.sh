#!/bin/sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PYTHON=${REEL_PYTHON:-"$HOME/Library/Application Support/BrenUp/kokoro-tts/.venv/bin/python"}
exec "$PYTHON" "$SCRIPT_DIR/reels.py" "$@"
