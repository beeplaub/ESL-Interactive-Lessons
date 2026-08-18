#!/bin/zsh
set -euo pipefail

ROOT="/Users/bren/Documents/ESL App"
NODE_BIN="$(command -v node)"
SECRET="$(security find-generic-password -a "$(id -un)" -s brenup-ai-gateway-secret -w)"

export BRENUP_AI_GATEWAY_SECRET="$SECRET"
export BRENUP_REPOSITORY_ROOT="$ROOT"
export BRENUP_OLLAMA_MODEL="qwen2.5:7b"
export BRENUP_OLLAMA_URL="http://127.0.0.1:11434/v1"
exec "$NODE_BIN" "$ROOT/scripts/brenup-ai-gateway.mjs"
