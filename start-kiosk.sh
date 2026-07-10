#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# IT Command Center — Kiosk Startup Script
# Called from ~/.config/labwc/autostart on boot.
# Uses native Wayland (no DISPLAY/:0 needed — avoids XWayland timing issues).
# ─────────────────────────────────────────────────────────────────────────────

URL="http://localhost:8001"
LOG="/tmp/kiosk.log"

exec >> "$LOG" 2>&1
echo "=== kiosk started at $(date) ==="

# Give labwc compositor time to fully settle
sleep 8

# Wait for backend to be ready (up to 90s)
for i in $(seq 1 90); do
  curl -s --max-time 2 "$URL/api/" > /dev/null && break
  sleep 1
done
echo "Backend ready, launching Chromium..."

# Remove stale singleton locks
rm -f "$HOME/.config/chromium/SingletonLock" \
       "$HOME/.config/chromium/SingletonCookie" 2>/dev/null

exec chromium \
  --ozone-platform=wayland \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu \
  --renderer-process-limit=1 \
  --password-store=basic \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --no-first-run \
  --disable-restore-session-state \
  --disable-component-update \
  --check-for-update-interval=31536000 \
  --app="$URL"
