# IT Command Center — PRD

## Original Problem Statement
Create a dashboard in Python/React to display important IT information at a glance for a NOC team running on a Raspberry Pi (1920x1080). Features include WUG alerting (via emails), DIA circuits from HP Aruba/Orchestrator, ticket info from Vivantio, vendor health checks (CrowdStrike, NinjaOne, Zscaler, O365/D365), a network map with 8 specific locations, and UniFi alerts via UDP Syslog receiver.

## Tech Stack
- Frontend: React + TailwindCSS + Shadcn/UI + Lucide React
- Backend: FastAPI + MongoDB (Motor async driver)
- Design: "Precision Command Center" — JetBrains Mono, zero border-radius, square dots, numbered text-only sidebar

## 8 Site Locations
Remus MI, Ovid MI, Mt. Pleasant MI, Constantine MI, Novi MI, Canton OH (Plant), Canton OH (Warehouse), Middlebury IN

## Architecture
```
/app/
├── backend/
│   ├── server.py          # FastAPI app + UniFi UDP syslog receiver + all API routes
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── App.js         # Routes (includes /unifi for UniFi Events)
│   │   ├── App.css        # All component classes: .card, .btn, .badge-*, .nav-item, .section-label
│   │   ├── index.css      # Google Fonts import (JetBrains Mono, Inter)
│   │   ├── components/
│   │   │   ├── Layout.jsx
│   │   │   ├── Sidebar.jsx   # Numbered text-only nav, no icons
│   │   │   └── Header.jsx    # Page label + clock + square status dot
│   │   └── pages/
│   │       ├── Dashboard.jsx
│   │       ├── NetworkMap.jsx
│   │       ├── Alerts.jsx
│   │       ├── ServiceStatus.jsx
│   │       ├── DIACircuits.jsx
│   │       ├── Tickets.jsx
│   │       ├── UniFiEvents.jsx  # NEW: terminal-style syslog feed
│   │       └── Settings.jsx     # Includes UniFi syslog port config
├── memory/
│   ├── PRD.md
│   └── test_credentials.md
└── design_guidelines.json
```

## What's Been Implemented

### Session 1 — Foundation (2025-06)
- React + FastAPI scaffolding, routing, layout
- Mocked data: alerts, circuits (8), tickets (5), vendor status (5), sites (8)
- Initial retro-futuristic UI (rejected by user)

### Session 2 — Modern UI + UniFi (2025-06)
- New design: "Precision Command Center" (JetBrains Mono, zero-radius, square dots)
- Sidebar: numbered text-only, no icons (01-08)
- Applied consistent design across ALL 8 pages (Dashboard, NetworkMap, Alerts, ServiceStatus, DIACircuits, Tickets, Settings, UniFiEvents)
- **UniFi UDP Syslog Receiver**: asyncio DatagramProtocol class, RFC3164 parser, severity auto-classification
- **UniFi Events page**: Terminal-style live feed, auto-refresh every 5s, severity filter, 3 KPI cards
- 8 seeded demo UniFi events in DB (1 critical port scan, 2 warnings, 5 info)
- Settings page: UniFi syslog port config + usage instructions
- Backend tested: 8/8 API tests pass

## P0 — Active (Next Priority)
- [ ] Connect WUG email parsing (IMAP poller exists but needs user's IMAP credentials)
- [ ] Integrate live Vivantio ticket data (needs API URL + key from user)
- [ ] Integrate HP Aruba/Orchestrator for real DIA circuit data (needs API URL + key from user)

## P1 — Real Vendor Status Checks
- [ ] Implement authenticated status page scrapers for CrowdStrike, NinjaOne, Zscaler, M365, D365
- [ ] Currently using public status page APIs (can be slow/unreliable)

## P2 — Enhancements
- [ ] Kiosk auto-rotation mode (Dashboard → Map → Alerts cycling every 30s for wall display)
- [ ] WebSocket real-time push for UniFi syslog events (currently polling every 5s)
- [ ] Email-to-alert webhook endpoint for WUG integration
- [ ] Historical trend charts for circuit uptime / alert frequency
