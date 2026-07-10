#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# IT Command Center — LXDE Kiosk Autostart Setup
#
# Run this ONCE from SSH to configure LXDE so Chromium launches on every boot.
# Safe to run as root (sudo) or as the kiosk user directly.
#
#   chmod +x setup_autostart.sh && sudo ./setup_autostart.sh
# ─────────────────────────────────────────────────────────────────────────────

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Determine the real target user ───────────────────────────────────────────
# Priority: explicit arg > SUDO_USER env > auto-detect first UID>=1000 user
# Handles: sudo ./script, direct root login, and normal user login
if [ -n "${1:-}" ]; then
  # Explicit username passed as argument: ./setup_autostart.sh visionboard
  TARGET_USER="$1"
elif [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ]; then
  # Invoked via sudo from another user
  TARGET_USER="$SUDO_USER"
elif [ "$(id -u)" -eq 0 ]; then
  # Direct root login — auto-detect the first non-root user with a /home dir
  TARGET_USER=$(getent passwd | awk -F: '$3 >= 1000 && $6 ~ /^\/home/ { print $1; exit }')
  if [ -z "$TARGET_USER" ]; then
    echo "ERROR: Cannot auto-detect kiosk user. Pass it explicitly:"
    echo "  ./setup_autostart.sh visionboard"
    exit 1
  fi
  echo "Auto-detected kiosk user: $TARGET_USER"
else
  TARGET_USER="$(whoami)"
fi
TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"

AUTOSTART_DIR="$TARGET_HOME/.config/lxsession/LXDE-pi"
AUTOSTART_FILE="$AUTOSTART_DIR/autostart"

echo ""
echo "  IT Command Center — Autostart Setup"
echo "  Target user: $TARGET_USER"
echo "  Home:        $TARGET_HOME"
echo ""

# ── Detect session type ───────────────────────────────────────────────────────
SESSION=$(grep -r "^user-session=\|^autologin-session=" /etc/lightdm/lightdm.conf 2>/dev/null \
  | head -1 | cut -d= -f2 | tr -d '[:space:]')
echo "  Detected session: ${SESSION:-unknown}"
echo ""

# ── labwc / Wayland (rpd-labwc — Pi OS Bookworm+) ────────────────────────────
if echo "$SESSION" | grep -qi "labwc\|wayland"; then
  LABWC_DIR="$TARGET_HOME/.config/labwc"
  mkdir -p "$LABWC_DIR"
  # labwc autostart is a shell script — append our line (idempotent)
  LABWC_AUTOSTART="$LABWC_DIR/autostart"
  # Remove old entry if present, then re-add
  [ -f "$LABWC_AUTOSTART" ] && sed -i '/kiosk\.sh/d' "$LABWC_AUTOSTART" || true
  echo "bash $REPO_DIR/kiosk.sh &" >> "$LABWC_AUTOSTART"
  if [ "$(id -u)" -eq 0 ]; then
    chown -R "$TARGET_USER":"$TARGET_USER" "$LABWC_DIR"
  fi
  echo "  labwc autostart written: $LABWC_AUTOSTART"
  echo ""
  cat "$LABWC_AUTOSTART"
  echo ""
  echo "  Done! Reboot to activate: sudo reboot"
  exit 0
fi

# ── X11 / LXDE fallback ───────────────────────────────────────────────────────
AUTOSTART_DIR="$TARGET_HOME/.config/lxsession/LXDE-pi"
AUTOSTART_FILE="$AUTOSTART_DIR/autostart"
echo "  Autostart: $AUTOSTART_FILE"
echo ""

# ── Create directory if missing ───────────────────────────────────────────────
mkdir -p "$AUTOSTART_DIR"

# ── Use Python to write the file (avoids shell heredoc quoting problems) ──────
python3 - "$AUTOSTART_FILE" "$REPO_DIR" <<'PYEOF'
import sys, os

autostart_file = sys.argv[1]
repo_dir       = sys.argv[2]

# Preserve any lines not from us
existing_lines = []
if os.path.exists(autostart_file):
    with open(autostart_file) as f:
        for line in f:
            skip = any(x in line for x in [
                "IT Command Center", "kiosk.sh", "it-dashboard",
                "@xset s off", "@xset -dpms", "@xset s noblank", "@unclutter",
            ])
            if not skip:
                existing_lines.append(line.rstrip())

# Strip trailing blanks from existing content
while existing_lines and existing_lines[-1] == "":
    existing_lines.pop()

our_block = [
    "",
    "# IT Command Center kiosk — managed by setup_autostart.sh",
    "@xset s off",
    "@xset -dpms",
    "@xset s noblank",
    f"@bash {repo_dir}/kiosk.sh",
]

final_lines = existing_lines + our_block
content = "\n".join(final_lines) + "\n"

with open(autostart_file, "w") as f:
    f.write(content)

print("Written successfully.")
PYEOF

if [ $? -ne 0 ]; then
  echo "ERROR: Python write failed. Check Python 3 is installed."
  exit 1
fi

# ── Fix ownership — file must be owned by the kiosk user, not root ───────────
if [ "$(id -u)" -eq 0 ]; then
  chown -R "$TARGET_USER":"$TARGET_USER" "$AUTOSTART_DIR"
  echo "Ownership set to $TARGET_USER"
fi

# ── ALSO create XDG autostart .desktop file ──────────────────────────────────
# More reliable than lxsession autostart — works with LXDE, Openbox, XFCE, etc.
XDG_AUTOSTART_DIR="$TARGET_HOME/.config/autostart"
mkdir -p "$XDG_AUTOSTART_DIR"

cat > "$XDG_AUTOSTART_DIR/it-dashboard-kiosk.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=IT Command Center Kiosk
Exec=/bin/bash $REPO_DIR/kiosk.sh
X-GNOME-Autostart-enabled=true
Hidden=false
NoDisplay=false
DESKTOP

if [ "$(id -u)" -eq 0 ]; then
  chown "$TARGET_USER":"$TARGET_USER" "$XDG_AUTOSTART_DIR/it-dashboard-kiosk.desktop"
fi
echo "XDG autostart entry written: $XDG_AUTOSTART_DIR/it-dashboard-kiosk.desktop"

# ── Show the result ───────────────────────────────────────────────────────────
echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   Current autostart file contents   ║"
echo "  ╚══════════════════════════════════════╝"
echo ""
cat "$AUTOSTART_FILE"
echo ""
echo "  ────────────────────────────────────────"
echo ""
echo "  Done! On next reboot Chromium will launch automatically."
echo ""
echo "  To reboot now:  sudo reboot"
echo ""
echo "  To test without rebooting (from the Pi desktop):"
echo "    bash $REPO_DIR/kiosk.sh"
echo ""
