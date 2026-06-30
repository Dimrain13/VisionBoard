# IT Command Center — PRD

## Original Problem Statement
Create a dashboard in Python/React to display important IT information at a glance for a NOC team, running on a Raspberry Pi (1920x1080). Primarily a READ-ONLY display pulling from external APIs. Features: WUG alerting (via emails), DIA circuits from HP Aruba/Orchestrator, ticket info from Vivantio, vendor health checks, network map with 8 locations, UniFi/Wazuh SIEM alerts.

## Tech Stack
- Frontend: React + TailwindCSS + Shadcn/UI + Lucide React
- Backend: FastAPI + MongoDB (settings only — minimal writes)
- Design: "Precision Command Center" — JetBrains Mono, zero border-radius, square dots, top-tab navigation

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
│   │   ├── App.css        # .card .btn .badge-* .tab-item .section-label
│   │   ├── components/
│   │   │   ├── Layout.jsx    # flex-col h-screen, TopNav + main{children}
│   │   │   ├── TopNav.jsx    # Top tab bar (replaces sidebar)
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

## P0 — Next Priority (needs user credentials)
- [ ] WUG email IMAP (mail server credentials needed in Settings)
- [ ] Vivantio live tickets (API URL + key needed)
- [ ] HP Aruba live DIA circuits (Orchestrator URL + key needed)

## P1 — Enhancements
- [ ] Real vendor status checks (authenticated status pages)
- [ ] Dashboard KPI wired to Wazuh summary endpoint

## P2 — Future
- [ ] Kiosk auto-rotation (Dashboard → Map → Alerts cycling)
- [ ] WebSocket push for Wazuh alerts (currently 30s polling)
- [ ] Raspberry Pi deployment: Dockerfile or install script
- [ ] Replace MongoDB with flat settings.yml (simpler Pi deploy)
