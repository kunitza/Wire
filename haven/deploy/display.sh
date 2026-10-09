#!/usr/bin/env bash
# Turn the monitor off/on for Sleep Mode.  Usage: display.sh off|on
# Works on Wayland (labwc/wayfire) via wlr-randr, and on X11 via xset.
state=${1:-on}
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/run/user/$(id -u)}
if command -v wlr-randr >/dev/null; then
  for sock in "$XDG_RUNTIME_DIR"/wayland-*; do
    [ -S "$sock" ] || continue
    export WAYLAND_DISPLAY=$(basename "$sock")
    out=$(wlr-randr 2>/dev/null | awk '/^[^ ]/{print $1; exit}')
    [ -n "$out" ] && wlr-randr --output "$out" --"$state" && exit 0
  done
fi
if command -v xset >/dev/null; then
  export DISPLAY=${DISPLAY:-:0}
  if [ "$state" = off ]; then xset dpms force off; else xset dpms force on; fi
  exit 0
fi
# Fallback: HDMI power via the firmware tool (older Pi OS)
command -v vcgencmd >/dev/null && vcgencmd display_power $([ "$state" = off ] && echo 0 || echo 1)
