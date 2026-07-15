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

## What's Been Implemented (Updated 2026-07-15)

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
| WUG REST API | ✅ INTEGRATED | OAuth2 bearer token; polls /api/v1/ every 60s; LAN-only |

### Kiosk Auto-Rotation (FIXED 2026-07-10)
- Settings page has checkboxes for which tabs rotate in kiosk mode
- `kiosk_pages` list persisted in `settings.yml`

### Pi Kiosk — Raspberry Pi Deployment (FIXED 2026-07-10)
- **Session**: `rpd-labwc` (Wayland, Pi OS Bookworm/Trixie)
- **Autostart**: `~/.config/labwc/autostart` → `bash /path/to/kiosk.sh &`
- **Boot target**: `graphical.target` (desktop, not console)
- **Auto-login**: lightdm configured via `sed` directly (not raspi-config which sets wrong mode)
- **Kiosk script**: `kiosk.sh` — auto-detects Wayland/X11, minimal safe flags
- **White screen root cause**: `--disable-software-rasterizer` combined with `--disable-gpu` removes ALL rendering paths → blank canvas. Fix: remove `--disable-software-rasterizer`.
- **Working Chromium flags**: `--no-sandbox --disable-gpu --disable-dev-shm-usage --password-store=basic --renderer-process-limit=1`

### Network Map Animation (FIXED 2026-07-10)
- Uses **CSS opacity only** on static `<circle>` elements — Pi-safe (`--disable-gpu`)
- Delay formula corrected: dots now sequence src→dst (was reversed/random before)
- Backbone links (Novi/Azure): 6 dots, 1.8s cycle; Remote links: 3 dots, 3.5s cycle

### WUG Network Topology
- Tab: **WUG** — circuit-board hierarchical topology per location
- Live WUG API integrated; falls back to demo data when WUG unreachable

### UniFi Devices Page
- Auto-detect UniFi OS vs Legacy API, grouped by type, offline sorted to top

### WUG Page (WUGDevices.jsx) — REDESIGNED 2026-07-15
- **Grid layout**: 4×2 grid of site cards (handles 8 locations)
- **Per-site scatter plot**: All devices shown as concentric-ring dots (scales 3 to 100+ per site)
  - Root device (GW/FW) placed at center with type label
  - All other devices fill rings outward; offline first for visibility
  - Connection lines for parent→child relationships (faint; red when offline)
  - Pulsing red ring for offline devices (CSS opacity, Pi-safe)
- **Demo data**: Realistic device counts (14–68 per site; genDevices helper)
- **Live data**: Uses `/api/wug/topology`; parent_id from real WUG honored if provided

### UniFi Page (UniFiDevices.jsx) — Updated 2026-07-15
- Added `firewall` device type (HP Aruba support)
- Axios timeout 8s (was hanging 35s for unreachable LAN controller)
- inferParents updated: firewall > gateway > switch > first device as root
- Cameras distributed across switches (same as APs)

### WUG REST API Fix (2026-07-15)
- `_wug_get_token` now tries both `/api/v1/token` AND `/NmConsole/api/v1/token` automatically
- Caches the working path prefix so all subsequent `_wug_get` calls use the same prefix
- Full error logging: HTTP status, content-type, redirect target, and raw body preview on any failure
- `_wug_get` updated to use `api_prefix` from token cache (defaults to `/api/v1` for backward compat)

### UniFi Controller Fix (2026-07-15)
- `_fetch_unifi_controller` now auto-discovers the site name via `/api/self/sites` after legacy login
- Logs cookies after legacy login, logs raw device-fetch response body on failures
- Fixed `actual_site` scope bug (now set in both OS and legacy code paths)
- Added `follow_redirects=True` to avoid silent redirect failures

### Debug Endpoint (2026-07-15)
- `GET /api/debug/connectivity` — hits WUG (both paths) and UniFi (both auth methods + site discovery + device count) and returns full diagnostic JSON
- Run from Pi: `curl -s http://localhost:8001/api/debug/connectivity | python3 -m json.tool`

### WUG Visualization (2026-07-15)
- Connection lines changed from near-invisible `#1A1A2A` → visible `#0E2A50` (dim cyberpunk blue), opacity 0.85
- Ring guide circles now dashed `strokeDasharray="2 4"` for grid texture without obscuring dots
- SVG height increased 310→340 to give extra room for large sites (Canton 68 devices)
- Added 6th ring guide, mock device counts bumped to match real WUG density estimates



### P1 — Next
- Downdetector client_id + client_secret (user to provide)
- Wazuh configuration (needs credentials for 10.202.10.70)

### P2 — Soon
- Automated DIA circuit ping check every 60s

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
- `GET /api/wug/topology` — WUG topology (live; demo data fallback)
- `GET /api/wug/alerts` — WUG downed device alerts
- `GET /api/unifi/devices[?demo=true]` — UniFi devices
- `GET/PUT /api/settings` — read/write settings.yml
