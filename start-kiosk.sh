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

PROFILE_DIR="$HOME/.config/chromium"
for LOCK in \
  "$PROFILE_DIR/SingletonLock" \
  "$PROFILE_DIR/SingletonCookie" \
  "$PROFILE_DIR/Default/Last Session" \
  "$PROFILE_DIR/Default/Last Tabs"; do
  [ -f "$LOCK" ] && rm -f "$LOCK" && echo "Removed stale lock: $LOCK"
done

# ── Launch Chromium — restart loop so crashes auto-recover ───────────────────
echo "Launching Chromium..."
while true; do
  rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonCookie" 2>/dev/null

  chromium \
    --no-sandbox \
    --disable-gpu \
    --disable-dev-shm-usage \
    --password-store=basic \
    --renderer-process-limit=1 \
    --disable-background-networking \
    --disable-extensions \
    --js-flags="--max-old-space-size=192" \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --no-first-run \
    --disable-restore-session-state \
    --disable-session-crashed-bubble \
    --disable-crash-reporter \
    http://localhost:8001

  echo "Chromium exited ($(date)) — restarting in 5s..."
  sleep 5
done
