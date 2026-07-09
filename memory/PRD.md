# IT Command Center — PRD

## Original Problem Statement
Create a dashboard in Python/React to display important information for IT at a glance.
- Wazuh SIEM integration (consolidating UniFi, WUG, and HP alerts)
- DIA Circuits overview
- Ticket information (Vivantio)
- Service status
- Run on wall-mounted Raspberry Pi (1920×1080) in kiosk mode
- Top tab navigation (no sidebar) to maximize horizontal width
- Live mesh map topology for locations connected via HP Aruba EdgeConnect

## Architecture

```
/app/
├── backend/
│   ├── server.py              # FastAPI app (Wazuh, Aruba, UDP syslog, MongoDB)
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── App.js             # Routes
│   │   ├── App.css / index.css  # Cyberpunk NOC design system
│   │   ├── components/
│   │   │   ├── Layout.jsx     # Kiosk rotation logic
│   │   │   └── TopNav.jsx     # Nav with kiosk pause/timer
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── NetworkMap.jsx # Geographic mesh map (react-simple-maps)
│   │   │   ├── Alerts.jsx
│   │   │   ├── VendorStatus.jsx
│   │   │   ├── DiaCircuits.jsx
│   │   │   ├── Tickets.jsx
│   │   │   ├── Wazuh.jsx
│   │   │   └── Settings.jsx
│   │   └── utils/api.js
└── memory/
    ├── PRD.md
    └── test_credentials.md
```

## Key Tech Stack
- React (CRA), Tailwind CSS, react-simple-maps (geographic SVG maps)
- FastAPI, MongoDB, httpx (async HTTP)
- HPE Aruba EdgeConnect Orchestrator API
- Wazuh SIEM API (LAN-only, expected to fail in preview)

## DB Schema (MongoDB)
- settings: { wazuh_enabled, wazuh_url, wazuh_username, wazuh_password,
              kiosk_enabled, kiosk_interval, aruba_api_url, aruba_api_key }

---

## What's Been Implemented

### Cyberpunk NOC UI Redesign (Gemini 3.1 Pro)
- Full CSS overhaul: dark theme, neon glows, sharp edges, JetBrains Mono font
- `/app/design_guidelines.json` codifies the design system

### Kiosk Auto-Rotation Mode ✅
- Cycles pages every N seconds (configurable in Settings)
- TopNav shows rotation timer + pause button
- Layout.jsx manages the interval logic

### HPE Aruba EdgeConnect Integration ✅
- Settings page allows entering Aruba Orchestrator URL + API key
- Backend `/api/aruba/mesh` fetches live SD-WAN mesh links
- Backend `/api/aruba/status` fetches alarm summary
- In-memory cache (5-min TTL) with background warmer at startup
- Cache warms within 9s of server start via `background_aruba_warmer()`

### Geographic Network Map ✅ (2026-07-09)
- Replaced hand-drawn SVG polygon with `react-simple-maps` using US states GeoJSON
- Shows accurate Michigan mitten outline + Ohio + Indiana + context states
- All 9 nodes (8 physical sites + Azure Cloud) positioned at real lat/lon
- Azure Cloud placed east towards Lake Huron at [-79.4, 44.5]
- 36 live SD-WAN mesh tunnel lines rendered, colored by status
- Site detail panel shows tunnel list for selected node
- Cache prevents Aruba API slow-start on kiosk page rotation

---

## Prioritized Backlog

### P0 — Completed
- [x] Cyberpunk NOC UI redesign
- [x] Kiosk auto-rotation mode
- [x] Aruba SD-WAN backend integration
- [x] Geographic mesh map (proper state outlines, react-simple-maps)
- [x] Animated flowing tunnel lines (packet effect) on the mesh map
- [x] Vivantio ticketing live integration (SelectList scan strategy, 63 active tickets)

### P1 — Next Sprint
- [ ] Migrate settings from MongoDB to flat `settings.yml` file
  - Removes MongoDB dependency for Raspberry Pi deployment
  - Simplifies setup: just edit a YAML file

### P2
- [ ] Raspberry Pi deployment script (`start.sh` / `install.sh`)
- [ ] Vivantio ticketing integration (waiting on user-provided API keys)

### P3 — Backlog
- [ ] Dashboard KPIs wired to Wazuh summary endpoint
- [ ] DIA Circuits live data
- [ ] Alerts page live data from Wazuh

---

## Key API Endpoints
- GET  `/api/settings`          — load settings
- POST `/api/settings`          — save settings
- GET  `/api/sites`             — 8 sites + live Aruba circuit status (cached)
- GET  `/api/aruba/mesh`        — 36 SD-WAN mesh links (cached 5 min)
- GET  `/api/aruba/status`      — Aruba alarm summary
- GET  `/api/wazuh/status`      — Wazuh SIEM status (LAN-only)
- GET  `/api/circuits`          — DIA circuits data

---

## Important Notes for Next Agent
- **Wazuh**: Connection to `10.202.10.70` will ALWAYS fail in preview (LAN IP).
  This is expected and should NOT be treated as a bug.
- **Aruba Cache**: The `background_aruba_warmer()` task warms both `circuits`
  and `mesh` caches within 9s of server startup. Cache TTL = 5 minutes.
  Do NOT reduce the TTL without understanding the Aruba API response times.
- **MongoDB migration**: Settings are still stored in MongoDB. The P1 task is
  to migrate to `settings.yml`. Do NOT start this until explicitly instructed.
- **react-simple-maps**: v3.0.0 is installed. The GeoJSON URL is
  `https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json`
  Michigan FIPS=26, Ohio=39, Indiana=18.
