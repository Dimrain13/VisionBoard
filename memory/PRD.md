# IT Command Center — PRD

## Original Problem Statement
Create a dashboard in Python/React to display important IT information at a glance for a wall-mounted Raspberry Pi (1920x1080 kiosk). Features: Wazuh SIEM, DIA circuits, Vivantio tickets, Downdetector service status, UniFi Devices (switches/APs). Cyberpunk NOC aesthetic. Top tab navigation. Auto-rotating kiosk. Live mesh map topology. Display-only (no interaction needed on wall display).

## Architecture
```
/app/
├── backend/
│   ├── server.py           # FastAPI — all API routes, background tasks, YAML helpers
│   ├── settings.yml        # ALL configuration (replaces MongoDB) — edit to configure
│   ├── circuits.yml        # DIA circuit inventory — edit to add/remove circuits
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/          # Dashboard, NetworkMap, Alerts, ServiceStatus, UniFiDevices, Tickets, WUGDevices, Wazuh, Settings
│   │   ├── components/     # MapEmbed.jsx, TopNav.jsx, Layout.jsx
│   │   └── index.css       # JetBrains Mono global font
│   └── tailwind.config.js
├── install.sh              # Full Pi setup — run once after clone
├── kiosk.sh                # PRIMARY kiosk launcher (Wayland-aware, used by autostart)
├── start-kiosk.sh          # Legacy launcher (kept for compatibility, fixed flags)
├── setup_autostart.sh      # Writes labwc autostart — run after changes
├── memory/
│   ├── PRD.md
│   ├── test_credentials.md
│   └── CHANGELOG.md
```

## Storage (MongoDB-free)
- **settings.yml** — all credentials, API keys, feature flags. Edit directly or via Settings page.
- **circuits.yml** — DIA circuit inventory. Edit directly. Persists across restarts.
- **In-memory** — alerts (from WUG email), Vivantio cache, UniFi events ring buffer. Resets on restart.

## What's Been Implemented

### Core Infrastructure
- FastAPI backend, React/Tailwind frontend, Cyberpunk NOC aesthetic
- JetBrains Mono font site-wide
- Top tab navigation with kiosk auto-rotation support
- 1920x1080 optimized layout

### Dashboard (Main NOC View)
- 4 KPI cards: System Alerts, Network Availability, External Services, Response Queue
- **Global Topology Mesh Map** (react-simple-maps, offline bundled us-states-10m.json)
- **Critical Event Stream** — real alerts from WUG email/Wazuh only
- **Vendor Health Matrix** — 4-column grid with live status dots
- **Incident Queue** — live from Vivantio
- **DIA Circuit Status Engine** — per-site colored badges

### Integrations
| Integration | Status | Notes |
|---|---|---|
| Vivantio ITSM | ✅ LIVE | 65 active tickets; auto-refreshes every 60s |
| Downdetector API | ⚠️ NEEDS CREDENTIALS | Enter client_id/secret in Settings |
| UniFi Network | ✅ CONFIGURED (LAN only) | noc-readonly@unifi.mimilk.com:8443 |
| Aruba EdgeConnect | ⚠️ NOT CONFIGURED | Needs aruba_api_url + aruba_api_key |
| Wazuh SIEM | ⚠️ NOT CONFIGURED | LAN IP 10.202.10.70 |
| WUG Email Alerts | ⚠️ NOT CONFIGURED | Needs IMAP credentials |

### Pi Kiosk — Raspberry Pi Deployment (FIXED 2026-07-10)
- **Session**: `rpd-labwc` (Wayland, Pi OS Bookworm/Trixie)
- **Autostart**: `~/.config/labwc/autostart` → `bash /path/to/kiosk.sh &`
- **Boot target**: `graphical.target` (desktop, not console)
- **Auto-login**: lightdm configured via `sed` directly (not raspi-config which sets wrong mode)
- **Kiosk script**: `kiosk.sh` — auto-detects Wayland/X11, minimal safe flags
- **White screen root cause**: `--disable-software-rasterizer` combined with `--disable-gpu` removes ALL rendering paths → blank canvas. Fix: remove `--disable-software-rasterizer`.
- **Working Chromium flags**: `--no-sandbox --disable-gpu --disable-dev-shm-usage --password-store=basic --renderer-process-limit=1`

### WUG Network Topology
- New tab: **WUG** — circuit-board style hierarchical topology per location
- **DEMO DATA ACTIVE** — WUG API not yet connected (backend stub at `/api/wug/topology`)

### UniFi Devices Page
- Auto-detect UniFi OS vs Legacy API, grouped by type, offline sorted to top

### Alerts Page
- Unacknowledged + Critical/Warning only by default, acknowledge removes from view

## Pending / Upcoming Work

### P1 — Next
- WUG REST API integration (blocked: user providing credentials)
- Downdetector client_id + client_secret

### P2 — Soon
- Automated DIA circuit ping check every 60s
- Wazuh configuration (needs credentials for 10.202.10.70)

### P3 — Backlog
- UniFi Protect camera API integration
- Alerts persistence across restarts (flat file)

## Key API Endpoints
- `GET /api/dashboard/summary` — KPI counts
- `GET /api/circuits` — DIA circuits
- `GET /api/sites` — site status with coordinates
- `GET /api/alerts?acknowledged=false` — active alerts
- `GET /api/vivantio/tickets` — live Vivantio tickets
- `GET /api/vendor-status` — 21 vendor statuses
- `GET /api/wug/topology` — WUG topology (stub until API connected)
- `GET /api/unifi/devices[?demo=true]` — UniFi devices
- `GET/PUT /api/settings` — read/write settings.yml
