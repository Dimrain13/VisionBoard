#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# IT Command Center — Raspberry Pi Install Script
# Tested on: Raspberry Pi OS 64-bit (Bookworm / Bullseye), Pi 4 / Pi 5
# Run once after cloning the repo:  chmod +x install.sh && ./install.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOLD="\033[1m"; GREEN="\033[32m"; YELLOW="\033[33m"; RED="\033[31m"; RESET="\033[0m"

info()  { echo -e "${GREEN}[INFO]${RESET}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error() { echo -e "${RED}[ERROR]${RESET} $*"; exit 1; }
step()  { echo -e "\n${BOLD}── $* ──────────────────────────────────────────${RESET}"; }

echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════╗"
echo "  ║   IT Command Center — Pi Installer   ║"
echo "  ╚══════════════════════════════════════╝"
echo -e "${RESET}"

# ─── 1. System update ─────────────────────────────────────────────
step "System update"
sudo apt-get update -qq
sudo apt-get install -y -qq curl wget git unclutter xdotool

# ─── 2. Node.js 18 ────────────────────────────────────────────────
step "Node.js 18"
NODE_VER=$(node -v 2>/dev/null | cut -d. -f1 | tr -d v || echo 0)
if [ "$NODE_VER" -lt 18 ] 2>/dev/null; then
  info "Installing Node.js 18 (ARM64)..."
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  info "Node.js $(node -v) already installed — skipping"
fi

# Install / upgrade yarn
if ! command -v yarn &>/dev/null; then
  info "Installing Yarn..."
  sudo npm install -g yarn
else
  info "Yarn $(yarn -v) already installed"
fi

# ─── 3. Python dependencies ───────────────────────────────────────
step "Python dependencies"
python3 -m pip install --quiet --upgrade pip
python3 -m pip install --quiet -r "$REPO_DIR/backend/requirements.txt"
info "Python packages installed"

# ─── 4. Environment files ─────────────────────────────────────────
step "Environment files"

if [ ! -f "$REPO_DIR/backend/.env" ]; then
  info "Creating backend/.env from template..."
  cp "$REPO_DIR/backend/.env.example" "$REPO_DIR/backend/.env"
  warn "Edit backend/.env if needed (CORS_ORIGINS etc.)"
else
  info "backend/.env already exists — skipping"
fi

# Frontend .env must use localhost so the built JS talks to the Pi's own backend
if [ ! -f "$REPO_DIR/frontend/.env" ] || grep -q "emergentagent.com" "$REPO_DIR/frontend/.env" 2>/dev/null; then
  info "Writing frontend/.env for local Pi deployment..."
  cat > "$REPO_DIR/frontend/.env" <<EOF
REACT_APP_BACKEND_URL=http://localhost:8001
EOF
  info "frontend/.env → http://localhost:8001"
else
  info "frontend/.env already configured"
fi

# ─── 5. Build React frontend ──────────────────────────────────────
step "Build React frontend (this takes 5–15 min on a Pi 4)"
cd "$REPO_DIR/frontend"
yarn install --frozen-lockfile --silent
yarn build
info "Frontend built → frontend/build/"
cd "$REPO_DIR"

# ─── 6. Systemd service ───────────────────────────────────────────
step "Systemd service (it-dashboard)"
SERVICE_FILE="/etc/systemd/system/it-dashboard.service"
CURRENT_USER=$(whoami)

sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=IT Command Center — NOC Dashboard Backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${CURRENT_USER}
WorkingDirectory=${REPO_DIR}
ExecStart=$(which python3) -m uvicorn backend.server:app --host 0.0.0.0 --port 8001 --workers 1
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=it-dashboard

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable it-dashboard
sudo systemctl restart it-dashboard
info "Service enabled and started (sudo systemctl status it-dashboard)"

# ─── 7. Kiosk autostart ───────────────────────────────────────────
step "Kiosk autostart (LXDE)"
AUTOSTART_DIR="$HOME/.config/lxsession/LXDE-pi"
AUTOSTART_FILE="$AUTOSTART_DIR/autostart"

mkdir -p "$AUTOSTART_DIR"

# Preserve any existing entries that aren't ours
TEMP=$(mktemp)
if [ -f "$AUTOSTART_FILE" ]; then
  grep -v "it-dashboard\|chromium.*8001\|xset s\|xset -dpms\|unclutter" "$AUTOSTART_FILE" > "$TEMP" || true
else
  touch "$TEMP"
fi

cat >> "$TEMP" <<EOF

# IT Command Center kiosk — added by install.sh
@xset s off
@xset -dpms
@xset s noblank
@unclutter -idle 1 -root
@bash ${REPO_DIR}/kiosk.sh
EOF

cp "$TEMP" "$AUTOSTART_FILE"
rm "$TEMP"
info "Kiosk autostart configured in $AUTOSTART_FILE"

# ─── Done ─────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  Installation complete!${RESET}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════════${RESET}"
echo ""
echo -e "  ${BOLD}Next steps:${RESET}"
echo "  1. Edit  backend/settings.yml   — add your real API credentials"
echo "  2. Edit  backend/circuits.yml   — update WAN IP addresses"
echo "  3. Run:  sudo systemctl status it-dashboard  to verify backend"
echo "  4. Open: http://localhost:8001  in a browser to test"
echo "  5. Reboot to launch the kiosk automatically"
echo ""
echo -e "  ${BOLD}Useful commands:${RESET}"
echo "    sudo systemctl restart it-dashboard   # restart backend"
echo "    sudo journalctl -u it-dashboard -f    # tail live logs"
echo "    ./kiosk.sh                            # launch kiosk manually"
echo ""
