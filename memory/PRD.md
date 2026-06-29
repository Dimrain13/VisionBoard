# IT Command Center - PRD

## Overview
A futuristic, dark-mode IT Operations Dashboard built for 1920x1080 display on a Raspberry Pi. Provides at-a-glance monitoring for IT teams across 8 locations in MI, OH, and IN.

**App URL:** https://network-monitor-65.preview.emergentagent.com  
**Architecture:** React frontend + FastAPI backend + MongoDB

---

## User Personas
- IT Operations staff monitoring infrastructure
- NOC (Network Operations Center) team
- IT managers reviewing site and service health

---

## Locations (8 Sites)
| Site | State | Type |
|---|---|---|
| Remus | MI | Office |
| Ovid | MI | Office |
| Mt. Pleasant | MI | Office |
| Constantine | MI | Office |
| Novi | MI | HQ (hub) |
| Canton Plant | OH | Plant |
| Canton Warehouse | OH | Warehouse |
| Middlebury | IN | Office |

---

## Architecture

### Backend (`/app/backend/server.py`)
- FastAPI with MongoDB (motor async)
- Vendor status checks via httpx (async, 8s timeout)
- IMAP email polling for WUG alerts (background task, 2 min interval)
- WUG email webhook endpoint
- Seed demo data on startup if collections empty

### Frontend (`/app/frontend/src/`)
- React 19 with React Router v7
- react-simple-maps v3 (geoMercator projection, MI/OH/IN states)
- framer-motion, lucide-react, date-fns
- Rajdhani (headings) + JetBrains Mono (data) fonts
- Auto-refresh every 30 seconds on all pages

---

## Core Requirements (Static)
1. Display WUG alerts from email (IMAP polling + webhook)
2. Show DIA circuit status for all 8 sites
3. Vivantio ticket queue
4. Vendor service status: CrowdStrike, NinjaOne, Zscaler, Microsoft 365, Dynamics 365
5. Network map with 8 location markers and WAN connections
6. Secure configuration for API credentials (Settings page)
7. Dark mode futuristic design for Raspberry Pi display

---

## What's Been Implemented (v1.0 - 2026-06-29)

### Pages
- **Dashboard** - 4 KPI cards, active alerts list, vendor status, recent tickets, circuit overview
- **Network Map** - Interactive react-simple-maps with MI/OH/IN states, 8 site markers, hub-and-spoke connections from Novi, status-colored markers
- **Alert Center** - Full CRUD, severity filter, acknowledge/delete, manual alert creation, WUG email webhook support
- **Vendor Status** - Health cards for CrowdStrike, NinjaOne, Zscaler, M365, D365 + IsItDown.right tool
- **DIA Circuits** - 8 circuits table with full CRUD (add/edit/delete), status badges
- **Ticket Queue** - Vivantio-labeled queue with status/priority filters, card layout, full CRUD
- **Settings** - IMAP email config, WUG webhook URL display, Vivantio API config, Aruba Orchestrator config, refresh interval

### Backend APIs
- `GET /api/dashboard/summary` - aggregated KPI counts
- `GET/POST/PUT/DELETE /api/alerts` - alert management
- `POST /api/alerts/email-webhook` - WUG email webhook receiver
- `GET/POST/PUT/DELETE /api/circuits` - circuit management
- `GET/POST/PUT/DELETE /api/tickets` - ticket management
- `GET /api/vendor-status` - live checks of vendor status pages
- `GET /api/sites` - 8 sites with dynamic status derived from circuits/alerts
- `GET/PUT /api/settings` - dashboard configuration

### Demo Data Seeded
- 5 alerts (2 critical, 2 warning, 1 info)
- 8 circuits (6 up, 1 down at Remus, 1 degraded at Constantine)
- 5 tickets (TKT-1041 through TKT-1045)
- App settings with defaults

---

## Test Results (v1.0)
- Backend: 100% (19/19 tests passed)
- Frontend: 95% (all pages load, all CRUD flows work)

---

## P0 Backlog (Next Phase)

### API Integrations (Awaiting Customer Credentials)
- **Vivantio API** - Real ticket sync (URL + API key needed)
- **HP Aruba Orchestrator** - Real DIA circuit pull (URL + API token needed)
- **CrowdStrike Falcon API** - Real threat/device status (Client ID + Secret needed)
- **NinjaOne API** - Real device/alert status (API key needed)
- **Zscaler API** - Real ZIA/ZPA status (tenant + API key needed)
- **Microsoft 365 / D365** - Service health via Microsoft Graph API (Azure App credentials needed)
- **WUG Email Integration** - IMAP credentials for email polling

### P1 Features
- Authentication (JWT login) for Raspberry Pi kiosk mode
- Alert sound notifications for critical severity
- Historical alert charts (last 24h/7d)
- Circuit bandwidth utilization graphs (if Aruba API available)
- Email alert rules (notify by email on critical alerts)
- Kiosk auto-rotation mode (cycle through pages automatically)

### P2 Features  
- Mobile responsive layout
- Dark/light theme toggle
- Export reports to PDF/CSV
- Alert grouping and deduplication
- Custom dashboard widget arrangement
