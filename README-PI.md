# IT Command Center — Raspberry Pi Deployment Guide

## Requirements
| | |
|---|---|
| **Hardware** | Raspberry Pi 4 or Pi 5, 4 GB RAM minimum |
| **OS** | Raspberry Pi OS 64-bit (Bookworm recommended) |
| **Display** | 1920×1080 HDMI monitor for kiosk wall mount |
| **Network** | Wired Ethernet recommended for stable operation |

---

## Quick Install (one command)

```bash
git clone https://github.com/YOUR_ORG/it-dashboard.git
cd it-dashboard
chmod +x install.sh && ./install.sh
```

The script will:
- Install Node.js 18, Yarn, Python dependencies
- Build the React frontend (takes 5–15 min on a Pi 4)
- Create a `systemd` service that auto-starts on boot
- Configure Chromium kiosk autostart via LXDE

---

## Post-Install Configuration

### 1. API Credentials — `backend/settings.yml`

Most credentials are **already configured** in the repo. Verify or update:

```yaml
# Already set:
vivantio_api_url: "https://mimilk.api.vivantio.com"   ✅
vivantio_api_key: "..."                                ✅
unifi_controller1_url: "https://unifi.mimilk.com:8443" ✅
unifi_controller1_username: "noc-readonly"             ✅

# Still needed — fill these in:
downdetector_client_id: ""      ← add when available
downdetector_client_secret: ""  ← add when available

wug_url: ""                     ← add tomorrow after API access
wug_username: ""
wug_password: ""
```

### 2. WAN Circuit IPs — `backend/circuits.yml`

Replace the placeholder IPs with your real WAN gateway IPs for each site.
The backend pings these every 60 seconds to detect outages:

```yaml
circuits:
  - site: "Remus"
    provider: "AT&T"
    circuit_id: "ATT-MR-4521"
    ip_address: "YOUR_REAL_WAN_IP"   # ← replace this
    status: "up"
  # ... repeat for each site
```

---

## Service Management

```bash
# Check status
sudo systemctl status it-dashboard

# View live logs
sudo journalctl -u it-dashboard -f

# Restart backend (after editing settings.yml or circuits.yml)
sudo systemctl restart it-dashboard

# Launch kiosk manually (without rebooting)
./kiosk.sh

# Stop kiosk
pkill chromium-browser
```

---

## Architecture on the Pi

```
Raspberry Pi
│
├── systemd service: it-dashboard
│     └── uvicorn → backend/server.py (port 8001)
│           ├── Serves /api/* routes
│           └── Serves frontend/build/* (React SPA)
│
└── LXDE autostart: kiosk.sh
      └── chromium-browser --kiosk http://localhost:8001
```

All data persists in:
- `backend/settings.yml` — API credentials and configuration
- `backend/circuits.yml` — DIA circuit definitions and WAN IPs

No database required.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Black screen on boot | Check `sudo systemctl status it-dashboard` and `sudo journalctl -u it-dashboard` |
| Kiosk shows "Connection refused" | Backend not started — wait 30s after boot or run `sudo systemctl restart it-dashboard` |
| UniFi shows "not configured" | Expected — controller at `unifi.mimilk.com:8443` is LAN-only; works normally on-site |
| Vendor status all "unknown" | Add Downdetector credentials to settings.yml (HTTP ping fallback is active as backup) |
| WAN circuits all show static status | Replace placeholder IPs in `circuits.yml` with real WAN gateway IPs |
| Screen goes blank | Run `xset s off && xset -dpms` or check autostart file |

---

## Updating

```bash
cd ~/it-dashboard
git pull
python3 -m pip install -r backend/requirements.txt
cd frontend && yarn install --frozen-lockfile && yarn build && cd ..
sudo systemctl restart it-dashboard
```
