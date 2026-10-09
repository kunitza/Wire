#!/usr/bin/env bash
# Haven installer for Raspberry Pi OS (Bookworm or Trixie, 64-bit, "with desktop").
# Run from the repo:  cd haven && ./deploy/install.sh
# Safe to re-run: it updates the build and service in place and never deletes your data.
set -euo pipefail

HAVEN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_USER="${SUDO_USER:-$USER}"
RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"
PORT="${PORT:-8080}"
ENV_FILE=/etc/haven.env

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

if [ "$(id -u)" -eq 0 ] && [ -z "${SUDO_USER:-}" ]; then
  echo "Run this as your normal user (it uses sudo where needed), not as root." >&2
  exit 1
fi

say "Installing system packages"
sudo apt-get update -y
sudo apt-get install -y curl git ca-certificates sqlite3 wlr-randr || sudo apt-get install -y curl git ca-certificates sqlite3
if ! command -v chromium >/dev/null && ! command -v chromium-browser >/dev/null; then
  sudo apt-get install -y chromium || sudo apt-get install -y chromium-browser
fi

NODE_MAJOR=$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0)
if [ "${NODE_MAJOR:-0}" -lt 22 ]; then
  say "Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "Node $(node -v)"

say "Building Haven"
cd "$HAVEN_DIR"
npm ci --no-audit --no-fund
npm run build

say "Configuring the service"
if [ ! -f "$ENV_FILE" ]; then
  TZ_NAME="$(timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null || echo America/New_York)"
  sudo tee "$ENV_FILE" >/dev/null <<ENV
# Haven settings. After editing: sudo systemctl restart haven
PORT=$PORT
TZ=$TZ_NAME
HAVEN_DATA_DIR=$HAVEN_DIR/data
# Optional: Anthropic API key for Sidekick (can also be set in Settings > Sidekick)
#ANTHROPIC_API_KEY=
# Optional: model for Sidekick (default claude-opus-5-5)
#HAVEN_AI_MODEL=claude-opus-5-5
# Turn the monitor off/on for Sleep Mode
HAVEN_DISPLAY_OFF_CMD=$HAVEN_DIR/deploy/display.sh off
HAVEN_DISPLAY_ON_CMD=$HAVEN_DIR/deploy/display.sh on
ENV
  sudo chmod 600 "$ENV_FILE"
  sudo chown "$RUN_USER" "$ENV_FILE"
fi
chmod +x "$HAVEN_DIR/deploy/"*.sh

sudo tee /etc/systemd/system/haven.service >/dev/null <<UNIT
[Unit]
Description=Haven family hub
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_USER
WorkingDirectory=$HAVEN_DIR
EnvironmentFile=$ENV_FILE
Environment=XDG_RUNTIME_DIR=/run/user/$(id -u "$RUN_USER")
ExecStart=$(command -v node) --disable-warning=ExperimentalWarning dist/server/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now haven
sudo systemctl restart haven

say "Setting up the full-screen display (kiosk)"
mkdir -p "$RUN_HOME/.config/labwc" "$RUN_HOME/.config/autostart"
LAUNCH="$HAVEN_DIR/deploy/kiosk.sh"
# labwc (Raspberry Pi OS default since late 2024)
touch "$RUN_HOME/.config/labwc/autostart"
grep -q "deploy/kiosk.sh" "$RUN_HOME/.config/labwc/autostart" || echo "$LAUNCH &" >>"$RUN_HOME/.config/labwc/autostart"
# Other desktops (wayfire / X11) via XDG autostart
cat >"$RUN_HOME/.config/autostart/haven-kiosk.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Haven kiosk
Exec=$LAUNCH
X-GNOME-Autostart-enabled=true
DESK
# Never blank the screen (Haven has its own Sleep Mode)
if command -v raspi-config >/dev/null; then sudo raspi-config nonint do_blanking 1 || true; fi

IP=$(hostname -I | awk '{print $1}')
say "Done!"
cat <<MSG
Haven is running:  http://$IP:$PORT   (and http://$(hostname).local:$PORT)
- The wall display opens automatically after a reboot:  sudo reboot
- On your phone, open the address above and choose "Add to Home Screen".
- Logs:            journalctl -u haven -f
- Update later:    ./deploy/update.sh
- Settings file:   $ENV_FILE
MSG
