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
│   │   ├── pages/          # Dashboard, NetworkMap, Alerts, ServiceStatus, UniFiDevices, Tickets, Wazuh, Settings
│   │   ├── components/     # MapEmbed.jsx, TopNav.jsx
│   │   └── index.css       # JetBrains Mono global font
│   └── tailwind.config.js
├── memory/
│   ├── PRD.md              # This file
│   ├── test_credentials.md
│   └── CHANGELOG.md
```

## Storage (MongoDB-free)
- **settings.yml** — all credentials, API keys, feature flags. Edit directly or via Settings page.
- **circuits.yml** — DIA circuit inventory. Edit directly. Persists across restarts.
- **In-memory** — alerts (from WUG email), Vivantio cache, UniFi events ring buffer. Resets on restart (intentional — real data re-fetches from live sources).

## What's Been Implemented

### Core Infrastructure
- FastAPI backend, React/Tailwind frontend, Cyberpunk NOC aesthetic
- JetBrains Mono font site-wide
- Top tab navigation with kiosk auto-rotation support
- 1920x1080 optimized layout

### Dashboard (Main NOC View)
- 4 KPI cards: System Alerts, Network Availability, External Services, Response Queue
- **Global Topology Mesh Map** (react-simple-maps):
  - Hub-and-spoke DIA circuit lines: Novi (HQ) → each site
  - Green flowing animated lines = circuit UP
  - Red pulsing line = circuit DOWN
  - Amber dashed animated line = circuit DEGRADED
  - Aruba SD-WAN mesh overlay when available
  - MI/OH/IN/IL primary states + WI/KY/PA/WV context borders
- **Critical Event Stream** — real alerts from WUG email/Wazuh only; "All Systems Nominal" when empty
- **Vendor Health Matrix** — 4-column grid with live status dots
- **Incident Queue** — live from Vivantio (65+ tickets loaded)
- **DIA Circuit Status Engine** — per-site colored badges at bottom

### Integrations
| Integration | Status | Notes |
|---|---|---|
| Vivantio ITSM | ✅ LIVE | 65 active tickets; auto-refreshes every 60s |
| Downdetector API | ⚠️ NEEDS CREDENTIALS | Enter client_id/secret in Settings → DOWNDETECTOR API. Token auto-rotates every 45min once configured. |
| UniFi Network | ✅ CONFIGURED (LAN only) | noc-readonly@unifi.mimilk.com:8443; works when Pi is on local network |
| Aruba EdgeConnect | ⚠️ NOT CONFIGURED | Needs aruba_api_url + aruba_api_key in Settings |
| Wazuh SIEM | ⚠️ NOT CONFIGURED | LAN IP 10.202.10.70; works when Pi is on local network |
| WUG Email Alerts | ⚠️ NOT CONFIGURED | Needs IMAP credentials in Settings |

### Vendor Status (ServiceStatus page)
- 21 vendors across Security, Microsoft, AI, Cloud, Telecom, Other
- Fixed Downdetector slugs: `teams` (Teams), `google-bard` (Gemini), `claude` (Anthropic), `microsoft-dynamics-365`
- Fallback to public Statuspage.io APIs for: Cloudflare, OpenAI, Keeper, UniFi, CrowdStrike, Anthropic
- HTTP follow_redirects=True + verify=False applied to all status checks
- **DD token status badge** in UI showing: active/pending/not-configured + minutes to next refresh

### UniFi Devices Page
- Auto-detect UniFi OS vs Legacy API
- Devices grouped by type (Switch, AP, Camera, etc.)
- Offline devices sorted to TOP of each group
- ?demo=true query param for UI preview without live controller

### Alerts Page
- Default: unacknowledged + Critical/Warning only (no Info)
- Acknowledge → removes from default view
- All alerts come from real sources only (WUG email, Wazuh, manual)

## Pending / Upcoming Work

### P1 — Next
- Enter Downdetector client_id + client_secret in settings.yml or Settings page to unlock all 21 vendor status feeds
- Raspberry Pi deployment instructions + start.sh script

### P2 — Soon
- Automated DIA circuit ping check every 60s → auto-flip status to DOWN if ICMP unreachable
- Wazuh configuration (needs credentials for 10.202.10.70)
- WUG email IMAP configuration

### P3 — Backlog
- UniFi Protect camera API integration (separate from Network controller)
- Kiosk auto-rotation testing on actual Pi hardware
- Alerts persistence across restarts (optional flat file)

## Key API Endpoints
- `GET /api/dashboard/summary` — KPI counts
- `GET /api/circuits` — DIA circuits (from circuits.yml, Aruba status overlay if connected)
- `GET /api/sites` — site status with coordinates for map
- `GET /api/alerts?acknowledged=false` — active alerts
- `GET /api/vivantio/tickets` — live Vivantio tickets
- `GET /api/vendor-status` — 21 vendor statuses + DD token state
- `GET /api/unifi/devices[?demo=true]` — UniFi devices from controller(s)
- `GET /api/aruba/mesh` — SD-WAN tunnel topology
- `GET/PUT /api/settings` — read/write settings.yml
