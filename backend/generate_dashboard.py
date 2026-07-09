"""
One-time script: Uses Gemini 3 Flash to analyze the current Dashboard.jsx and
generate an improved, NOC-optimized version. Run with:
  python generate_dashboard.py
"""
import asyncio, os, sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

CURRENT_DASHBOARD = open(Path(__file__).parent.parent / "frontend/src/pages/Dashboard.jsx").read()

DESIGN_SYSTEM = """
CYBERPUNK NOC DESIGN SYSTEM
============================
Background:  #0B0B0F (body), #0F0F14 (cards), #030305 (nav)
Borders:     #1C1C24 (subtle), #2A2A38 (medium)
Text:        #FAFAFA (heading), #E2E2E5 (body), #D4D4D8 (secondary), #A1A1AA (muted), #3A3A48 (dim)
Accent:      #00E5FF (cyan — info/links), #00FF66 (green — online/ok), #FF2A2A (red — offline/critical), #FFB014 (amber — warning/degraded)

FONTS: 'JetBrains Mono' monospace for ALL text. Never use system fonts.

AVAILABLE CSS CLASSES (Tailwind + custom):
- .card          → dark card with subtle border (#0F0F14 bg, #1C1C24 border)
- .card-header   → flex row header inside card (padding 10px 16px, border-bottom #1C1C24)
- .section-label → uppercase section label (9px, #3A3A48, letter-spacing 0.14em)
- .btn           → small mono button (bg #0F0F14, border #2A2A38, hover border #3A3A48)
- .badge-green/.badge-red/.badge-amber/.badge-blue/.badge-zinc → status pill badges
- .dot-online / .dot-offline / .dot-degraded / .dot-unknown → colored 7x7 status dots
- .table-row     → hover row (hover bg #131318)
- .ping          → CSS keyframe animation (pulsing ping for active dots)
- .skeleton      → loading shimmer

DATA AVAILABLE IN DASHBOARD:
- summary.alerts: { total, critical, warning, info, unacknowledged }
- summary.circuits: { total, up, down, degraded }
- summary.tickets: { total, open, in_progress, critical }
- alerts[]: { id, title, severity, site, device, created_at, acknowledged }
- vendors[]: { id, name, category, status, description, web_url } — 21 vendors
- tickets[]: { id, ticket_number, title, priority, status, created_at }
- sites[]: { id, name, status, bandwidth_mbps, provider }

REACT COMPONENTS AVAILABLE:
- <MapEmbed sites={sites} /> — renders the geographic mesh topology map (react-simple-maps)
- Link from react-router-dom
- Icons from lucide-react: Bell, Network, Ticket, Activity, CheckCircle, ArrowRight, ShieldAlert, Wifi, Camera, Monitor, Server, Router

IMPORTANT CONSTRAINTS:
1. Keep all existing data fetching logic (loadAll, useEffect, useState hooks) exactly as-is
2. Keep all data-testid attributes
3. All inline styles only — no new Tailwind classes beyond those listed above
4. JetBrains Mono for all text, never system fonts
5. No emojis, no gradients, no rounded corners (sharp edges only)
6. The component must export as default function Dashboard()
"""

PROMPT = f"""You are redesigning a React dashboard for a wall-mounted IT NOC display (1920×1080 Raspberry Pi kiosk). This is the MAIN screen that IT engineers look at all day on a wall monitor. It must be visually compelling, information-dense, and readable at a glance from across the room.

{DESIGN_SYSTEM}

CURRENT DASHBOARD CODE:
```jsx
{CURRENT_DASHBOARD}
```

REDESIGN GOALS:
1. **Map as centerpiece** — The geographic network topology map should be larger and more central. It's the most visually impressive element on the display.
2. **Compact vendor health** — There are 21 vendors now. Replace the scrolling vendor list with a tight 4-column dot-matrix grid showing: name + colored dot + status label. No descriptions needed here — just at-a-glance status.
3. **Alert prominence** — Active alerts (especially critical) should feel urgent. Use the left border color system aggressively.
4. **KPI drama** — The 4 KPI metrics at the top should feel like they belong on a command center. Larger numbers, glowing colors when there are issues.
5. **Better layout** — Current 3-row stacked layout wastes space. Consider a left-right split where the map takes the left 55% and alerts+vendor status take the right 45%, with KPIs spanning full width at the top.
6. **DIA Circuits strip** — Add a compact horizontal strip below the map showing each site name + its circuit status dot (online/offline). No separate row needed — just embed it near or below the map area.

OUTPUT: Return ONLY the complete, improved Dashboard.jsx code. No explanations, no markdown fences, just the raw JSX file starting with imports.
"""

async def main():
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        print("ERROR: EMERGENT_LLM_KEY not set", file=sys.stderr)
        sys.exit(1)

    print("Calling Gemini 3 Flash to redesign Dashboard.jsx...", flush=True)

    chat = LlmChat(
        api_key=api_key,
        session_id="noc-dashboard-redesign",
        system_message="You are an expert React/UI engineer specializing in NOC (Network Operations Center) displays. You write clean, production-quality JSX with inline styles matching the provided design system exactly. You return ONLY raw code — no markdown, no backticks, no explanation."
    ).with_model("gemini", "gemini-3-flash-preview")

    response = await chat.send_message(UserMessage(text=PROMPT))

    if not response or not response.strip():
        print("ERROR: Gemini returned empty response", file=sys.stderr)
        sys.exit(1)

    # Strip any accidental markdown fences
    code = response.strip()
    if code.startswith("```"):
        lines = code.split("\n")
        code = "\n".join(lines[1:])
    if code.endswith("```"):
        code = code.rsplit("```", 1)[0].strip()

    out_path = Path(__file__).parent.parent / "frontend/src/pages/Dashboard.jsx"

    # Keep a backup
    backup_path = Path(__file__).parent.parent / "frontend/src/pages/Dashboard.jsx.bak"
    backup_path.write_text(open(out_path).read())
    print(f"Backup saved: {backup_path}")

    out_path.write_text(code)
    print(f"Dashboard.jsx updated ({len(code)} chars). Review at /dashboard")

if __name__ == "__main__":
    asyncio.run(main())
