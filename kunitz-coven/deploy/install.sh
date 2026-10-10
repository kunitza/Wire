#!/usr/bin/env bash
# Kunitz Coven installer for Raspberry Pi OS (Bookworm or Trixie, 64-bit, "with desktop").
# Run from the repo:  cd kunitz-coven && ./deploy/install.sh
# Safe to re-run: it updates the build and service in place and never deletes your data.
set -euo pipefail

COVEN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_USER="${SUDO_USER:-$USER}"
RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"
PORT="${PORT:-8080}"
ENV_FILE=/etc/kunitz-coven.env

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

say "Building Kunitz Coven"
cd "$COVEN_DIR"
npm ci --no-audit --no-fund
npm run build

say "Configuring the service"
if [ ! -f "$ENV_FILE" ]; then
  TZ_NAME="$(timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null || echo America/New_York)"
  sudo tee "$ENV_FILE" >/dev/null <<ENV
# Kunitz Coven settings. After editing: sudo systemctl restart kunitz-coven
PORT=$PORT
TZ=$TZ_NAME
COVEN_DATA_DIR=$COVEN_DIR/data
# Optional: Anthropic API key for Sidekick (can also be set in Settings > Sidekick)
#ANTHROPIC_API_KEY=
# Optional: model for Sidekick (default claude-opus-5-5)
#COVEN_AI_MODEL=claude-opus-5-5
# Kunitz Coven answers to IP addresses, localhost, *.local, *.lan, *.home.arpa and Tailscale (*.ts.net) names.
# Opening it under another name (e.g. via your router's DNS)? List it here, comma-separated.
#COVEN_ALLOWED_HOSTS=coven.example.com
# Turn the monitor off/on for Sleep Mode
COVEN_DISPLAY_OFF_CMD=$COVEN_DIR/deploy/display.sh off
COVEN_DISPLAY_ON_CMD=$COVEN_DIR/deploy/display.sh on
ENV
  sudo chmod 600 "$ENV_FILE"
  sudo chown "$RUN_USER" "$ENV_FILE"
fi
chmod +x "$COVEN_DIR/deploy/"*.sh
mkdir -p "$COVEN_DIR/data" && chmod -R go-rwx "$COVEN_DIR/data"

sudo tee /etc/systemd/system/kunitz-coven.service >/dev/null <<UNIT
[Unit]
Description=Kunitz Coven family hub
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_USER
WorkingDirectory=$COVEN_DIR
EnvironmentFile=$ENV_FILE
Environment=XDG_RUNTIME_DIR=/run/user/$(id -u "$RUN_USER")
ExecStart=$(command -v node) --disable-warning=ExperimentalWarning dist/server/index.js
# The database and its backups hold the API key, the mailbox password and calendar links: owner-only files.
UMask=0077
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now kunitz-coven
sudo systemctl restart kunitz-coven

say "Setting up the full-screen display (kiosk)"
mkdir -p "$RUN_HOME/.config/labwc" "$RUN_HOME/.config/autostart"
LAUNCH="$COVEN_DIR/deploy/kiosk.sh"
# labwc (Raspberry Pi OS default since late 2024)
touch "$RUN_HOME/.config/labwc/autostart"
grep -q "deploy/kiosk.sh" "$RUN_HOME/.config/labwc/autostart" || echo "$LAUNCH &" >>"$RUN_HOME/.config/labwc/autostart"
# Other desktops (wayfire / X11) via XDG autostart
cat >"$RUN_HOME/.config/autostart/kunitz-coven-kiosk.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=Kunitz Coven kiosk
Exec=$LAUNCH
X-GNOME-Autostart-enabled=true
DESK
# Never blank the screen (Kunitz Coven has its own Sleep Mode)
if command -v raspi-config >/dev/null; then sudo raspi-config nonint do_blanking 1 || true; fi

IP=$(hostname -I | awk '{print $1}')
say "Done!"
cat <<MSG
Kunitz Coven is running:  http://$IP:$PORT   (and http://$(hostname).local:$PORT)
- The wall display opens automatically after a reboot:  sudo reboot
- On your phone, open the address above and choose "Add to Home Screen".
- Logs:            journalctl -u kunitz-coven -f
- Update later:    ./deploy/update.sh
- Settings file:   $ENV_FILE
MSG
