#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# IT Command Center — Chromium kiosk launcher
# Supports both Wayland (rpd-labwc, Pi OS Bookworm+) and X11.
# Called from ~/.config/labwc/autostart on boot.
# All output logged to /tmp/kiosk.log for debugging.
# ─────────────────────────────────────────────────────────────────────────────

LOG="/tmp/kiosk.log"
URL="http://localhost:8001"
MAX_WAIT=90

exec >> "$LOG" 2>&1
echo ""
echo "================================================================"
echo " kiosk.sh started at $(date)"
echo "================================================================"
echo "USER=$(whoami)  WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-unset}  DISPLAY=${DISPLAY:-unset}"

# ── Give the compositor a moment to fully initialise ─────────────────────────
sleep 6

# ── Screen blanking / DPMS ───────────────────────────────────────────────────
# Try X11 xset first (works under XWayland), ignore errors on pure Wayland
xset s off    2>/dev/null || true
xset -dpms    2>/dev/null || true
xset s noblank 2>/dev/null || true

# ── Wait for the dashboard backend ───────────────────────────────────────────
echo "Waiting for backend at $URL (up to ${MAX_WAIT}s)..."
for i in $(seq 1 $MAX_WAIT); do
  if curl -s --max-time 2 "$URL/api/" > /dev/null 2>&1; then
    echo "Backend ready after ${i}s."
    break
  fi
  if [ "$i" -eq "$MAX_WAIT" ]; then
    echo "WARNING: Backend not ready after ${MAX_WAIT}s — launching Chromium anyway."
  fi
  sleep 1
done

# ── Remove stale Chromium singleton locks ────────────────────────────────────
PROFILE_DIR="$HOME/.config/chromium"
for LOCK in \
  "$PROFILE_DIR/SingletonLock" \
  "$PROFILE_DIR/SingletonCookie" \
  "$PROFILE_DIR/Default/RunningChromeOnOtherNotificationHandler"; do
  [ -f "$LOCK" ] && rm -f "$LOCK" && echo "Removed stale lock: $LOCK"
done

# ── Find Chromium binary ──────────────────────────────────────────────────────
CHROMIUM=""
for BIN in chromium chromium-browser google-chrome; do
  if command -v "$BIN" > /dev/null 2>&1; then
    CHROMIUM="$BIN"
    break
  fi
done

if [ -z "$CHROMIUM" ]; then
  echo "ERROR: No Chromium binary found. Run: sudo apt install -y chromium"
  exit 1
fi
echo "Using: $CHROMIUM"

# ── Detect display server and set platform flag ───────────────────────────────
# Pi OS Bookworm+ uses rpd-labwc (Wayland). Fall back to X11/XWayland if needed.
if [ -n "${WAYLAND_DISPLAY:-}" ]; then
  PLATFORM="wayland"
  echo "Display: Wayland ($WAYLAND_DISPLAY)"
else
  PLATFORM="x11"
  export DISPLAY="${DISPLAY:-:0}"
  echo "Display: X11 ($DISPLAY)"
fi

# ── Launch Chromium — restart loop so crashes auto-recover ───────────────────
echo "Launching $CHROMIUM ($PLATFORM) at $URL ..."
while true; do
  # Clear stale locks before each launch attempt
  rm -f "$PROFILE_DIR/SingletonLock" \
        "$PROFILE_DIR/SingletonCookie" \
        "$PROFILE_DIR/Default/Last Session" \
        "$PROFILE_DIR/Default/Last Tabs" 2>/dev/null

  "$CHROMIUM" \
    --ozone-platform="$PLATFORM" \
    --no-sandbox \
    --disable-gpu \
    --disable-dev-shm-usage \
    --renderer-process-limit=1 \
    --disable-background-networking \
    --disable-extensions \
    --js-flags="--max-old-space-size=192" \
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
    --disable-crash-reporter \
    --app="$URL"

  EXIT_CODE=$?
  echo "Chromium exited with code $EXIT_CODE at $(date) — restarting in 5s..."
  sleep 5
done
