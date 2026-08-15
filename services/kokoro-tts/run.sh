#!/bin/zsh
set -euo pipefail

SERVICE_DIR="${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
set -a
source "$SERVICE_DIR/.env.local"
set +a

exec "$SERVICE_DIR/.venv/bin/uvicorn" server:app \
  --app-dir "$SERVICE_DIR" \
  --host 127.0.0.1 \
  --port "${KOKORO_PORT:-8880}" \
  --workers 1 \
  --no-access-log
