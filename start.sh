#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# IT Command Center — start backend (foreground, for testing)
# For production use the systemd service:  sudo systemctl start it-dashboard
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting IT Command Center on http://0.0.0.0:8001 ..."
echo "Press Ctrl+C to stop."
echo ""

cd "$REPO_DIR"
exec python3 -m uvicorn backend.server:app \
  --host 0.0.0.0 \
  --port 8001 \
  --workers 1 \
  --log-level info
