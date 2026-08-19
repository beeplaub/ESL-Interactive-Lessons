#!/bin/zsh
set -euo pipefail

ROOT="/Users/bren/Documents/ESL App"
SERVICE_DIR="$HOME/.brenup"
KEYCHAIN_SERVICE="brenup-deepseek-api-key"

mkdir -p "$SERVICE_DIR"
read -r -s "API_KEY?Paste the DeepSeek API key: "
printf '\n'
if [[ -z "$API_KEY" ]]; then
  echo "A DeepSeek API key is required." >&2
  exit 1
fi

security add-generic-password -a "$(id -un)" -s "$KEYCHAIN_SERVICE" -w "$API_KEY" -U >/dev/null
unset API_KEY
cp "$ROOT/scripts/brenup-ai-launcher.mjs" "$SERVICE_DIR/brenup-ai-launcher.mjs"
chmod 755 "$SERVICE_DIR/brenup-ai-launcher.mjs"
launchctl kickstart -k "gui/$(id -u)/com.brenup.ai-gateway"

echo "DeepSeek is stored in Keychain and the BrenUp AI gateway was restarted."
