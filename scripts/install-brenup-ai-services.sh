#!/bin/zsh
set -euo pipefail

ROOT="/Users/bren/Documents/ESL App"
USER_ID="$(id -u)"
CLOUDFLARED_BIN="$(command -v cloudflared)"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
LOG_DIR="$HOME/Library/Logs/BrenUp"
mkdir -p "$LAUNCH_AGENTS" "$LOG_DIR"

read -r -s "SECRET?Paste the BrenUp gateway secret: "
printf '\n'
if [[ -z "$SECRET" ]]; then echo "A secret is required." >&2; exit 1; fi
security add-generic-password -a "$USER" -s brenup-ai-gateway-secret -w "$SECRET" -U >/dev/null
unset SECRET

chmod 700 "$ROOT/scripts/run-brenup-ai-gateway.sh" "$ROOT/scripts/install-brenup-ai-services.sh"

cat > "$LAUNCH_AGENTS/com.brenup.ai-gateway.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.brenup.ai-gateway</string>
  <key>ProgramArguments</key><array><string>$ROOT/scripts/run-brenup-ai-gateway.sh</string></array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/gateway.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/gateway.error.log</string>
</dict></plist>
EOF

cat > "$LAUNCH_AGENTS/com.brenup.ai-tunnel.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.brenup.ai-tunnel</string>
  <key>ProgramArguments</key><array>
    <string>$CLOUDFLARED_BIN</string><string>--config</string><string>$HOME/.cloudflared/brenup-ai.yml</string><string>tunnel</string><string>run</string><string>brenup-ai-agent</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/tunnel.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/tunnel.error.log</string>
</dict></plist>
EOF

for label in com.brenup.ai-gateway com.brenup.ai-tunnel; do
  launchctl bootout "gui/$USER_ID/$label" 2>/dev/null || true
done
launchctl bootstrap "gui/$USER_ID" "$LAUNCH_AGENTS/com.brenup.ai-gateway.plist"
launchctl bootstrap "gui/$USER_ID" "$LAUNCH_AGENTS/com.brenup.ai-tunnel.plist"
launchctl kickstart -k "gui/$USER_ID/com.brenup.ai-gateway"
launchctl kickstart -k "gui/$USER_ID/com.brenup.ai-tunnel"

echo "BrenUp AI gateway and tunnel are installed as login services."
echo "Check with: curl https://ai-agent.brenup.com/health"
