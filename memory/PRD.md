# IT Command Center — PRD

## Original Problem Statement
Create a dashboard in Python/React to display important information for IT at a glance.
- Wazuh SIEM integration (consolidating UniFi, WUG, and HP alerts)
- DIA Circuits overview
- Ticket information (Vivantio)
- Service status (Downdetector)
- Run on wall-mounted Raspberry Pi (1920×1080) in kiosk mode
- Top tab navigation (no sidebar) to maximize horizontal width
- Live mesh map topology for locations connected via HP Aruba EdgeConnect

## Architecture

```
/app/
├── backend/
│   ├── server.py              # FastAPI app (Wazuh, Aruba, Vivantio, Downdetector, MongoDB)
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── App.js
│   │   ├── App.css / index.css
│   │   ├── components/
│   │   │   ├── Layout.jsx     # Kiosk rotation logic
│   │   │   └── TopNav.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── NetworkMap.jsx     # Geographic mesh map — MI/OH/IN/IL, Azure in Chicago
│   │   │   ├── Alerts.jsx
│   │   │   ├── ServiceStatus.jsx  # Vendor status (Downdetector API)
│   │   │   ├── DIACircuits.jsx
│   │   │   ├── Tickets.jsx
│   │   │   ├── WazuhPage.jsx
│   │   │   └── Settings.jsx       # Includes Downdetector credentials section
│   │   └── utils/api.js
└── memory/
    ├── PRD.md
    └── test_credentials.md
```

## Key Tech Stack
- React (CRA), Tailwind CSS, react-simple-maps v3.0.0 (US Atlas GeoJSON)
- FastAPI, MongoDB, httpx (async HTTP)
- HPE Aruba EdgeConnect Orchestrator API
- Wazuh SIEM API (LAN-only, expected to fail in preview)
- Vivantio ITSM REST API
- Downdetector Enterprise API (OAuth2 client_credentials)

## DB Schema (MongoDB)
- settings: { wazuh_enabled, wazuh_url, wazuh_username, wazuh_password,
              kiosk_enabled, kiosk_interval, aruba_api_url, aruba_api_key,
              vivantio_api_url, vivantio_api_key, vivantio_password,
              downdetector_client_id, downdetector_client_secret }
- circuits: { circuit_id, bandwidth_mbps, status, provider, ip_address, site, notes }

---

## What's Been Implemented

### Cyberpunk NOC UI ✅
- Dark theme, neon glows, JetBrains Mono font, Cyberpunk aesthetic

### Kiosk Auto-Rotation ✅
- Cycles pages every N seconds, configurable in Settings

### HPE Aruba EdgeConnect Integration ✅
- `/api/aruba/mesh` — live SD-WAN tunnel links (cached 5 min)
- `/api/aruba/status` — alarm summary
- Background warmer warms cache at startup

### Geographic Network Map ✅ (Michigan / Ohio / Indiana / Illinois)
- States: MI, OH, IN, IL (primary); WI, KY, PA, WV (context)
- Projection: scale=4500, center=[-84.8, 42.4]
- 9 nodes: 8 physical sites + Azure (Chicago, IL at [-87.63, 41.88])
- Azure box shows "AZURE / CHICAGO" label
- 36 live SD-WAN tunnel lines with animated flowing packet effect

### Vivantio ITSM Integration ✅
- Live tickets via POST /api/Ticket/SelectList
- Background cache warmer every 60s
- Priority normalization (Critical/High/Medium/Low)

### DIA Circuit Bandwidth Fix ✅
- MongoDB is source of truth for static fields (bandwidth, provider, IP, circuit_id)
- Aruba only contributes `status` per site
- Cache invalidated on circuit CRUD operations

### UniFi Devices Tab ✅ (2026-07-09)
- New `/unifi-devices` route + nav tab
- Auto-detects UniFi OS vs Legacy API path
- 2 controllers configurable in Settings → UNIFI CONTROLLERS
- background_unifi_warmer() polls every 60s
- Devices grouped by type: cameras, switches, APs, gateways

### Gemini 3 Flash Dashboard Redesign ✅ (2026-07-09)
- Left column: MapEmbed (hub-and-spoke SVG) + DIA Circuit strip
- Right column: Alert stream + Vendor Health Matrix (4-col dot grid) + Ticket queue
- 4 dramatic KPI cards at top (alerts, availability %, services, tickets)
- MapEmbed.jsx: pure SVG, no GeoJSON dependency

### Downdetector API Integration ✅
- OAuth2 client_credentials flow: POST /tokens → Bearer token
- Background `background_dd_token_refresher()` runs every 45 minutes (proactive refresh)
  - Reads credentials from MongoDB each cycle (picks up Settings changes automatically)
  - Uses `force=True` to always generate a fresh token
- Company ID lookup via `GET /slugs/{slug}/companies` (slug-based, not text search)
- Correct slugs confirmed:
  - CrowdStrike → "crowdstrike"
  - NinjaOne → "ninjaone"
  - Zscaler → "zscaler"
  - Microsoft 365 → "microsoft-365"
  - Dynamics 365 → "microsoft-dynamics"
- Status mapped: success→operational, warning→minor_outage, danger→major_outage
- Fallback to public Statuspage.io when DD not configured
- Settings page has "DOWNDETECTOR API" section (CLIENT ID + CLIENT SECRET)

---

## Prioritized Backlog

### P1 — Next Sprint
- [ ] Migrate settings from MongoDB to flat `settings.yml` file
  - Removes MongoDB dependency for Raspberry Pi deployment

### P2
- [ ] Raspberry Pi deployment script (`start.sh` / `install.sh`)

### P3 — Backlog
- [ ] Automated DIA circuit ping check every 60s → auto-flip status to DOWN
- [ ] Dashboard KPIs wired to Wazuh summary
- [ ] Alerts page live data from Wazuh

---

## Key API Endpoints
- GET  `/api/settings`          — load settings (hides passwords/secrets)
- PUT  `/api/settings`          — save settings
- GET  `/api/sites`             — 8 physical sites + Aruba circuit status
- GET  `/api/aruba/mesh`        — SD-WAN mesh links (cached 5 min)
- GET  `/api/circuits`          — DIA circuits (MongoDB + Aruba status overlay)
- GET  `/api/vivantio/tickets`  — Vivantio live tickets (cached 60s)
- GET  `/api/vendor-status`     — Vendor health via Downdetector (with fallback)

---

## Important Notes for Next Agent
- **Wazuh**: LAN IP `10.202.10.70` always fails in preview — expected, not a bug.
- **Aruba Cache**: Background warmer every 5 min. TTL = 5 min.
- **DIA Circuits**: MongoDB is source of truth. Aruba only gives `status`.
- **Downdetector**: Enterprise API. Credentials stored in MongoDB settings.
  Token auto-refreshed every 45 min by `background_dd_token_refresher()`.
  Company IDs resolved via `/slugs/{slug}/companies`, cached per process.
- **Azure Node**: Moved to Chicago, IL — Microsoft Azure Central US region.
  Coords: [-87.63, 41.88]. Map now includes Illinois as a primary state.
- **react-simple-maps**: v3.0.0, GeoJSON from us-atlas@3 CDN.
