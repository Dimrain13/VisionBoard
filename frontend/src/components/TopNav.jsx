import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { format } from "date-fns";

const TABS = [
  { path: "/dashboard", label: "DASHBOARD"    },
  { path: "/map",       label: "NETWORK MAP"  },
  { path: "/alerts",    label: "ALERTS"       },
  { path: "/status",    label: "VENDOR STATUS"},
  { path: "/circuits",  label: "DIA CIRCUITS" },
  { path: "/tickets",   label: "TICKETS"      },
  { path: "/wazuh",     label: "WAZUH"        },
  { path: "/settings",  label: "SETTINGS"     },
];

export default function TopNav() {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);

  return (
    <nav
      data-testid="top-nav"
      style={{
        height: 48,
        background: "#09090B",
        borderBottom: "1px solid #141416",
        display: "flex",
        alignItems: "stretch",
        flexShrink: 0,
      }}
    >
      {/* Brand */}
      <div style={{ padding: "0 24px", display: "flex", alignItems: "center", borderRight: "1px solid #141416", flexShrink: 0, gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: "#FAFAFA", letterSpacing: "0.2em" }}>
            IT CMD CTR
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, color: "#1A1A1C", letterSpacing: "0.15em", marginTop: 2 }}>
            NOC OPERATIONS
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", alignItems: "stretch", flex: 1 }}>
        {TABS.map(({ path, label }) => (
          <NavLink
            key={path}
            to={path}
            data-testid={`tab-${label.toLowerCase().replace(/\s+/g, "-")}`}
            className={({ isActive }) => `tab-item${isActive ? " tab-item-active" : ""}`}
          >
            {label}
          </NavLink>
        ))}
      </div>

      {/* Clock + status */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "0 24px", borderLeft: "1px solid #141416", flexShrink: 0 }}>
        <span
          data-testid="live-clock"
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "#3F3F46", letterSpacing: "0.12em" }}
        >
          {format(time, "HH:mm:ss")}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: "#1A1A1C", letterSpacing: "0.1em" }}>
          {format(time, "yyyy-MM-dd")}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }} data-testid="system-status">
          <div style={{ position: "relative", display: "flex", width: 7, height: 7 }}>
            <div className="ping" style={{ position: "absolute", width: 7, height: 7, background: "#10B981", opacity: 0.75 }} />
            <div style={{ position: "relative", width: 7, height: 7, background: "#10B981" }} />
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#1F1F23", letterSpacing: "0.15em" }}>
            ONLINE
          </span>
        </div>
      </div>
    </nav>
  );
}
