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
sleep 12

# Wait for backend to be ready (up to 90s)
for i in $(seq 1 90); do
  curl -s --max-time 2 "$URL/api/" > /dev/null && break
  sleep 1
done
echo "Backend ready, launching Chromium..."

# Remove stale singleton locks
rm -f "$HOME/.config/chromium/SingletonLock" \
       "$HOME/.config/chromium/SingletonCookie" 2>/dev/null

# Use DISPLAY=:0 (XWayland) — same as the manual command that works reliably.
# --ozone-platform=wayland omitted: WAYLAND_DISPLAY not reliably set this early in boot.
export DISPLAY=:0

exec chromium \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage \
  --password-store=basic \
  --renderer-process-limit=1 \
  --disable-background-networking \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --disable-restore-session-state \
  http://localhost:8001
