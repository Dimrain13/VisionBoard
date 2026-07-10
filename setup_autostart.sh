#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# IT Command Center — LXDE Kiosk Autostart Setup
#
# Run this ONCE from SSH to configure LXDE so Chromium launches on every boot.
# Uses Python to write the file — no heredoc / session issues.
#
#   chmod +x setup_autostart.sh && ./setup_autostart.sh
# ─────────────────────────────────────────────────────────────────────────────

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTOSTART_DIR="$HOME/.config/lxsession/LXDE-pi"
AUTOSTART_FILE="$AUTOSTART_DIR/autostart"

echo ""
echo "  IT Command Center — Autostart Setup"
echo "  Repo:      $REPO_DIR"
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
