#!/usr/bin/env bash
# Opens Kunitz Coven full-screen on the Pi's display. Started by the desktop session at login.
PORT=$(grep -E '^PORT=' /etc/kunitz-coven.env 2>/dev/null | cut -d= -f2)
URL="http://localhost:${PORT:-8080}/?kiosk=1"
pgrep -f "chromium.*--app=$URL" >/dev/null && exit 0
# Wait for the server to come up.
for i in $(seq 1 60); do curl -sf "http://localhost:${PORT:-8080}/api/health" >/dev/null && break; sleep 1; done
BROWSER=$(command -v chromium || command -v chromium-browser)
exec "$BROWSER" --kiosk --app="$URL" --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble \
  --disable-features=Translate,TouchpadOverscrollHistoryNavigation --overscroll-history-navigation=0 \
  --password-store=basic --check-for-update-interval=31536000 --autoplay-policy=no-user-gesture-required \
  --ozone-platform-hint=auto --enable-features=OverlayScrollbar
