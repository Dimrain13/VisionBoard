#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# IT Command Center — Chromium kiosk launcher
# Called from LXDE autostart on boot. Can also be run manually.
# All output is logged to /tmp/kiosk.log for easy debugging.
# ─────────────────────────────────────────────────────────────────────────────

LOG="/tmp/kiosk.log"
URL="http://localhost:8001"
MAX_WAIT=90   # seconds to wait for backend

# ── Log everything (stdout + stderr) ─────────────────────────────────────────
exec >> "$LOG" 2>&1
echo ""
echo "================================================================"
echo " kiosk.sh started at $(date)"
echo "================================================================"

# ── Ensure X display variables are set ───────────────────────────────────────
# LXDE autostart should set these, but be explicit so we never fail silently.
export DISPLAY="${DISPLAY:-:0}"
export XAUTHORITY="${XAUTHORITY:-$HOME/.Xauthority}"
echo "DISPLAY=$DISPLAY  XAUTHORITY=$XAUTHORITY  USER=$(whoami)"

# ── Wait for X server to be fully ready ──────────────────────────────────────
# LXDE autostart fires early; give the desktop 6 seconds to settle.
echo "Waiting 6s for desktop to initialise..."
sleep 6

# Confirm X is actually reachable before proceeding
if ! xset q > /dev/null 2>&1; then
  echo "ERROR: Cannot connect to X server at $DISPLAY — aborting."
  echo "       Try running:  DISPLAY=:0 bash $(realpath "$0")"
  exit 1
fi
echo "X server OK."

# ── Disable screen blanking / DPMS ───────────────────────────────────────────
xset s off   || true
xset -dpms   || true
xset s noblank || true
echo "Screen blanking disabled."

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

# ── Remove stale Chromium singleton locks (prevent blank launch after hard reset)
PROFILE_DIR="$HOME/.config/chromium"
for LOCK in \
  "$PROFILE_DIR/SingletonLock" \
  "$PROFILE_DIR/SingletonCookie" \
  "$PROFILE_DIR/Default/RunningChromeOnOtherNotificationHandler"; do
  [ -f "$LOCK" ] && rm -f "$LOCK" && echo "Removed stale lock: $LOCK"
done

# ── Find the Chromium binary ──────────────────────────────────────────────────
CHROMIUM=""
for BIN in chromium chromium-browser google-chrome; do
  if command -v "$BIN" > /dev/null 2>&1; then
    CHROMIUM="$BIN"
    break
  fi
done

if [ -z "$CHROMIUM" ]; then
  echo "ERROR: No Chromium binary found (tried: chromium, chromium-browser, google-chrome)."
  echo "       Run:  sudo apt install -y chromium"
  exit 1
fi
echo "Using browser: $CHROMIUM ($(command -v "$CHROMIUM"))"

# ── Launch Chromium ───────────────────────────────────────────────────────────
# --disable-gpu              : Pi 4 VideoCore GPU driver crashes (exit_code=11).
#                              Software rendering is smoother than crash/restart.
# --disable-dev-shm-usage    : Pi has small /dev/shm; prevents shared-mem crashes.
# --renderer-process-limit=1 : Single renderer process — saves ~100MB RAM.
echo "Launching $CHROMIUM at $URL ..."
exec "$CHROMIUM" \
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
  --app="$URL"
