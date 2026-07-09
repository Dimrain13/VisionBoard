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
│   │   ├── App.js             # Routes
│   │   ├── App.css / index.css  # Cyberpunk NOC design system
│   │   ├── components/
│   │   │   ├── Layout.jsx     # Kiosk rotation logic
│   │   │   └── TopNav.jsx     # Nav with kiosk pause/timer
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── NetworkMap.jsx # Geographic mesh map (react-simple-maps)
│   │   │   ├── Alerts.jsx
│   │   │   ├── ServiceStatus.jsx  # Vendor status (Downdetector API)
│   │   │   ├── DIACircuits.jsx    # Circuit bandwidth from MongoDB, status from Aruba
│   │   │   ├── Tickets.jsx        # Live Vivantio ITSM data
│   │   │   ├── WazuhPage.jsx
│   │   │   └── Settings.jsx       # Includes Downdetector credentials section
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

### Cyberpunk NOC UI Redesign ✅
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

### Geographic Network Map ✅ (2026-07-09)
- Replaced hand-drawn SVG polygon with `react-simple-maps` using US states GeoJSON
- Shows accurate Michigan mitten outline + Ohio + Indiana + context states
- All 9 nodes (8 physical sites + Azure Cloud) positioned at real lat/lon
- 36 live SD-WAN mesh tunnel lines rendered, colored by status
- Animated flowing packet effect on tunnel lines

### Vivantio ITSM Integration ✅ (2026-07-09)
- Live ticket data from Vivantio via POST /api/Ticket/SelectList strategy
- Background cache warmer refreshes every 60s
- Priority normalization (Critical/High/Medium/Low)
- Settings page has Vivantio URL + credentials

### DIA Circuit Bandwidth Fix ✅ (2026-07-09)
- `get_aruba_circuits_live()` no longer uses Aruba's `systemBandwidth`
- MongoDB is the source of truth for static fields: bandwidth, provider, IP, circuit_id
- Aruba only provides the `status` field (up/down/degraded) per site
- Cache invalidated on circuit create/update/delete so edits show immediately
- All 8 circuits now display correct bandwidth (50–1000 Mbps) and providers

### Downdetector API Integration ✅ (2026-07-09)
- OAuth2 client_credentials flow: POST /tokens with Basic Auth (client_id:client_secret)
- Token cached for ~55 minutes (auto-refresh before expiry)
- Company ID lookup via GET /companies/search (cached per process)
- Status mapped: success→operational, warning→minor_outage, danger→major_outage
- When DD credentials not configured, falls back to public Statuspage.io polling
- Settings page has dedicated "DOWNDETECTOR API" section with CLIENT ID + CLIENT SECRET
- Supported vendors: CrowdStrike, NinjaOne (ninjarmm), Zscaler, Microsoft 365, Dynamics 365

---

## Prioritized Backlog

### P1 — Next Sprint
- [ ] Migrate settings from MongoDB to flat `settings.yml` file
  - Removes MongoDB dependency for Raspberry Pi deployment
  - Simplifies setup: just edit a YAML file

### P2
- [ ] Raspberry Pi deployment script (`start.sh` / `install.sh`)

### P3 — Backlog
- [ ] Automated DIA circuit ping check every 60s → auto-flip status to DOWN if unreachable
- [ ] Dashboard KPIs wired to Wazuh summary endpoint
- [ ] Alerts page live data from Wazuh

---

## Key API Endpoints
- GET  `/api/settings`          — load settings (excludes passwords/secrets)
- PUT  `/api/settings`          — save settings
- GET  `/api/sites`             — 8 sites + live Aruba circuit status (cached)
- GET  `/api/aruba/mesh`        — 36 SD-WAN mesh links (cached 5 min)
- GET  `/api/aruba/status`      — Aruba alarm summary
- GET  `/api/wazuh/status`      — Wazuh SIEM status (LAN-only)
- GET  `/api/circuits`          — DIA circuits (MongoDB data + Aruba status overlay)
- PUT  `/api/circuits/{id}`     — Update circuit (cache-invalidating)
- GET  `/api/vivantio/tickets`  — Vivantio live tickets (cached 60s)
- GET  `/api/vendor-status`     — Vendor health (Downdetector API when configured)

---

## Important Notes for Next Agent
- **Wazuh**: Connection to `10.202.10.70` will ALWAYS fail in preview (LAN IP).
  This is expected and should NOT be treated as a bug.
- **Aruba Cache**: Background warmer runs every 5 min. Cache TTL = 5 minutes.
- **DIA Circuits**: MongoDB is source of truth for static data. Aruba only contributes `status`.
  Editing a circuit via the UI invalidates the cache immediately.
- **Downdetector**: Enterprise API, requires client_id + client_secret from dashboard.downdetector.com.
  When not configured, falls back to polling vendor status pages.
- **react-simple-maps**: v3.0.0 installed. GeoJSON from `https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json`
