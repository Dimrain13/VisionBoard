# IT Command Center — PRD

## Original Problem Statement
Create a dashboard in Python/React to display important IT information at a glance for a NOC team, running on a Raspberry Pi (1920x1080). Primarily a READ-ONLY display pulling from external APIs. Features: WUG alerting (via emails), DIA circuits from HP Aruba/Orchestrator, ticket info from Vivantio, vendor health checks, network map with 8 locations, UniFi/Wazuh SIEM alerts.

## Tech Stack
- Frontend: React + TailwindCSS + Shadcn/UI + Lucide React
- Backend: FastAPI + MongoDB (settings only — minimal writes)
- Design: "Cyberpunk NOC" — JetBrains Mono, zero border-radius, corner crosshairs, cyan (#00E5FF) accents, top-tab navigation
- Color Palette: Critical=#FF2A2A, Warning=#FFB014, OK=#00FF66, Info=#00E5FF, BG=#030305

## 8 Site Locations
Remus MI, Ovid MI, Mt. Pleasant MI, Constantine MI, Novi MI, Canton OH (Plant), Canton OH (Warehouse), Middlebury IN

## Architecture
```
/app/
├── backend/
│   ├── server.py          # FastAPI + Wazuh service + all API routes
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── App.js         # Routes
│   │   ├── App.css        # Cyberpunk NOC CSS design system
│   │   ├── index.css      # Base styles — JetBrains Mono, #030305 bg
│   │   ├── components/
│   │   │   ├── Layout.jsx    # flex-col h-screen, TopNav + main + grid overlay
│   │   │   ├── TopNav.jsx    # Top tab bar with icons, clock, NODE ONLINE indicator
│   │   │   ├── Sidebar.jsx   # UNUSED (kept for reference)
│   │   │   └── Header.jsx    # UNUSED
│   │   └── pages/
│   │       ├── Dashboard.jsx
│   │       ├── NetworkMap.jsx
│   │       ├── Alerts.jsx
│   │       ├── ServiceStatus.jsx
│   │       ├── DIACircuits.jsx
│   │       ├── Tickets.jsx
│   │       ├── WazuhPage.jsx    # Wazuh SIEM — live alerts + agents
│   │       ├── UniFiEvents.jsx  # UDP syslog (accessible at /unifi)
│   │       └── Settings.jsx
├── memory/
│   └── PRD.md
└── design_guidelines.json
```

## Wazuh Connection
- Server: 10.202.10.70
- REST API: port 55000 (JWT auth) → agents
- Indexer: port 9200 (Basic Auth) → wazuh-alerts-* index
- alert.rule.groups[] contains source tags (UniFi, WUG, HP, etc.)
- SSL verify=False (self-signed cert)
- NOTE: Always UNREACHABLE in preview env — connects on Pi deployment

## What's Been Implemented

### Session 1 — Foundation
- React + FastAPI scaffolding, routing, layout, mocked data

### Session 2 — Modern UI + UniFi Syslog
- "Precision Command Center" design across all pages
- UniFi UDP syslog receiver (port 5140)

### Session 3 — Wazuh SIEM Integration
- Full Wazuh backend service + API endpoints
- WazuhPage.jsx with terminal alert feed, filters, agent grid
- Settings WAZUH SIEM section (IP 10.202.10.70 pre-filled)

### Session 4 — Top Tab Navigation
- Replaced left sidebar with TopNav top tab bar
- Full 1920px width now used for content
- Layout.jsx simplified: TopNav + children

### Session 5 — Cyberpunk NOC Redesign (2026-02-07)
- Complete visual overhaul: "Cyberpunk NOC" theme
- New color palette: Critical=#FF2A2A, Warning=#FFB014, OK=#00FF66, Info=#00E5FF
- Background: #030305 (deep black), Surface: #0B0B0F
- JetBrains Mono font everywhere (removed Plus Jakarta Sans / Inter)
- Cards with corner crosshair accents via CSS pseudo-elements
- Subtle cyan grid overlay in Layout
- Lucide icons added to TopNav tabs
- Glowing status dots for online/degraded/offline states
- All pages updated with new color constants
- 100% test pass rate (testing agent verified all 8 pages)

## P0 — Next Priority (needs user credentials)
- [ ] WUG email IMAP (mail server credentials needed in Settings)
- [ ] Vivantio live tickets (API URL + key needed)
- [ ] HP Aruba live DIA circuits (Orchestrator URL + key needed)

## P1 — Enhancements
- [ ] Kiosk auto-rotation: Dashboard → Wazuh → Circuits → Alerts cycling every 30s
- [ ] Replace MongoDB with flat settings.yml (simpler Pi deploy, no DB dependency)
- [ ] Real vendor status checks (authenticated status pages)

## P2 — Future
- [ ] WebSocket push for Wazuh alerts (currently 30s polling)
- [ ] Raspberry Pi deployment: start.sh install script
- [ ] Dashboard KPI wired to Wazuh summary endpoint
