#!/bin/zsh
set -euo pipefail

SOURCE_DIR="${0:A:h}"
RUNTIME_DIR="$HOME/Library/Application Support/BrenUp/kokoro-tts"
LOG_DIR="$HOME/Library/Logs/BrenUp"
AGENT_DIR="$HOME/Library/LaunchAgents"
AGENT_PATH="$AGENT_DIR/com.brenup.kokoro-tts.plist"
CLOUDFLARED_AGENT_PATH="$AGENT_DIR/com.brenup.cloudflared.plist"

restart_agent() {
  local label="$1"
  local plist_path="$2"
  launchctl bootout "gui/$(id -u)/$label" >/dev/null 2>&1 || true
  for attempt in 1 2 3 4 5; do
    sleep 1
    if launchctl bootstrap "gui/$(id -u)" "$plist_path"; then
      launchctl kickstart -k "gui/$(id -u)/$label"
      return 0
    fi
  done
  echo "Could not restart $label after five attempts." >&2
  return 1
}

mkdir -p "$RUNTIME_DIR" "$LOG_DIR" "$AGENT_DIR"
install -m 700 "$SOURCE_DIR/run.sh" "$RUNTIME_DIR/run.sh"
install -m 600 "$SOURCE_DIR/server.py" "$RUNTIME_DIR/server.py"
install -m 600 "$SOURCE_DIR/requirements.txt" "$RUNTIME_DIR/requirements.txt"
install -m 600 "$SOURCE_DIR/.env.local" "$RUNTIME_DIR/.env.local"

if [[ ! -x "$RUNTIME_DIR/.venv/bin/python" ]]; then
  /opt/homebrew/bin/uv venv --python /opt/homebrew/bin/python3.12 "$RUNTIME_DIR/.venv"
fi
/opt/homebrew/bin/uv pip install --python "$RUNTIME_DIR/.venv/bin/python" -r "$RUNTIME_DIR/requirements.txt"

sed \
  -e "s|__SERVICE_DIR__|$RUNTIME_DIR|g" \
  -e "s|__LOG_DIR__|$LOG_DIR|g" \
  "$SOURCE_DIR/com.brenup.kokoro-tts.plist.template" > "$AGENT_PATH"
plutil -lint "$AGENT_PATH"

restart_agent "com.brenup.kokoro-tts" "$AGENT_PATH"

if [[ -x /opt/homebrew/bin/cloudflared && -f "$HOME/.cloudflared/config.yml" ]]; then
  sed \
    -e "s|__HOME__|$HOME|g" \
    -e "s|__LOG_DIR__|$LOG_DIR|g" \
    "$SOURCE_DIR/com.brenup.cloudflared.plist.template" > "$CLOUDFLARED_AGENT_PATH"
  plutil -lint "$CLOUDFLARED_AGENT_PATH"
  restart_agent "com.brenup.cloudflared" "$CLOUDFLARED_AGENT_PATH"
fi

echo "BrenUp Kokoro and its configured tunnel are installed. The first warm-up may take about a minute."
