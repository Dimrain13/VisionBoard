#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# IT Command Center — Chromium kiosk launcher
# Waits for the backend to be ready then opens full-screen on the main display.
# Called from LXDE autostart on boot. Can also be run manually.
# ─────────────────────────────────────────────────────────────────────────────

URL="http://localhost:8001"
MAX_WAIT=60   # seconds to wait for backend before giving up

echo "Waiting for IT Command Center backend at $URL ..."
for i in $(seq 1 $MAX_WAIT); do
  if curl -s --max-time 2 "$URL/api/" > /dev/null 2>&1; then
    echo "Backend ready after ${i}s."
    break
  fi
  sleep 1
done

# Disable screen blanking / DPMS (already set in autostart but belt+suspenders)
xset s off   2>/dev/null || true
xset -dpms   2>/dev/null || true
xset s noblank 2>/dev/null || true

# Remove any stale Chromium lock files that prevent clean launch after hard reset
PROFILE_DIR="$HOME/.config/chromium"
[ -f "$PROFILE_DIR/SingletonLock" ] && rm -f "$PROFILE_DIR/SingletonLock"
[ -f "$PROFILE_DIR/Default/RunningChromeOnOtherNotificationHandler" ] && \
  rm -f "$PROFILE_DIR/Default/RunningChromeOnOtherNotificationHandler"

# Launch Chromium in kiosk mode
# --disable-gpu              : Pi 4 VideoCore GPU driver causes Chromium GPU process
#                              to crash (exit_code=11 / SIGSEGV). Disabling forces stable
#                              software rendering — smoother than crash/restart cycle.
# --disable-dev-shm-usage    : Pi has small /dev/shm; prevents shared memory crashes.
# --renderer-process-limit=1 : Single renderer process — saves ~100MB RAM on Pi.
# --disable-background-networking: No background phone-home traffic competing for CPU.
chromium \
  --no-sandbox \
  --disable-gpu \
  --disable-gpu-sandbox \
  --disable-dev-shm-usage \
  --renderer-process-limit=1 \
  --disable-background-networking \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-component-update \
  --disable-restore-session-state \
  --no-first-run \
  --start-fullscreen \
  --window-position=0,0 \
  --window-size=1920,1080 \
  --force-device-scale-factor=1 \
  --disable-pinch \
  --overscroll-history-navigation=0 \
  --check-for-update-interval=31536000 \
  --app="$URL" \
  2>/dev/null
