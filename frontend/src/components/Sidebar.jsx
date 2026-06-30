import React from "react";
import { NavLink } from "react-router-dom";

const NAV = [
  { num: "01", path: "/dashboard", label: "DASHBOARD"    },
  { num: "02", path: "/map",       label: "NETWORK MAP"  },
  { num: "03", path: "/alerts",    label: "ALERTS"       },
  { num: "04", path: "/status",    label: "VENDOR STATUS"},
  { num: "05", path: "/circuits",  label: "DIA CIRCUITS" },
  { num: "06", path: "/tickets",   label: "TICKETS"      },
  { num: "07", path: "/unifi",     label: "UNIFI EVENTS" },
  { num: "08", path: "/settings",  label: "SETTINGS"     },
];

export default function Sidebar() {
  return (
    <aside
      data-testid="sidebar"
      className="flex flex-col flex-shrink-0"
      style={{ width: 210, height: "100vh", background: "#09090B", borderRight: "1px solid #141416" }}
    >
      {/* Identity */}
      <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #141416" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: "#FAFAFA", letterSpacing: "0.2em" }}>
          IT CMD CTR
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#27272A", letterSpacing: "0.15em", marginTop: 4 }}>
          NOC OPERATIONS / v1.0
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1" style={{ paddingTop: 12, paddingBottom: 12 }}>
        {NAV.map(({ num, path, label }) => (
          <NavLink
            key={path}
            to={path}
            data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
            className={({ isActive }) => `nav-item${isActive ? " nav-item-active" : ""}`}
          >
            <span style={{ opacity: 0.25, fontSize: 9, minWidth: 14, fontFamily: "'JetBrains Mono', monospace" }}>{num}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Status bar */}
      <div style={{ padding: "14px 24px", borderTop: "1px solid #141416" }}>
        <div className="flex items-center gap-2.5">
          <div style={{ width: 5, height: 5, background: "#10B981", flexShrink: 0 }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#27272A", letterSpacing: "0.15em" }}>
            SYSTEM NOMINAL
          </span>
        </div>
      </div>
    </aside>
  );
}
