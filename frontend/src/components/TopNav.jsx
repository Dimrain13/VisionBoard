import React, { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { format } from "date-fns";
import {
  Activity, Map, ShieldAlert, Network, Wifi, CheckSquare, Terminal, Settings, Clock,
} from "lucide-react";

const TABS = [
  { path: "/dashboard",  label: "DASHBOARD",     Icon: Activity    },
  { path: "/map",        label: "NETWORK MAP",   Icon: Map         },
  { path: "/alerts",     label: "ALERTS",        Icon: ShieldAlert },
  { path: "/status",     label: "VENDOR STATUS", Icon: Network     },
  { path: "/circuits",   label: "DIA CIRCUITS",  Icon: Wifi        },
  { path: "/tickets",    label: "TICKETS",       Icon: CheckSquare },
  { path: "/wazuh",      label: "WAZUH",         Icon: Terminal    },
  { path: "/settings",   label: "SETTINGS",      Icon: Settings    },
];

export default function TopNav() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <nav
      data-testid="top-nav"
      style={{
        height: 52,
        background: "#030305",
        borderBottom: "1px solid #1C1C24",
        display: "flex",
        alignItems: "stretch",
        flexShrink: 0,
      }}
    >
      {/* Brand */}
      <div style={{
        padding: "0 20px",
        display: "flex",
        alignItems: "center",
        borderRight: "1px solid #1C1C24",
        flexShrink: 0,
        gap: 12,
        minWidth: 170,
      }}>
        {/* Diamond icon */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, flexShrink: 0 }}>
          <div style={{
            position: "absolute", inset: 3,
            border: "1px solid rgba(0,229,255,0.45)",
            transform: "rotate(45deg)",
          }} />
          <Terminal size={13} style={{ color: "#00E5FF", position: "relative", zIndex: 1 }} />
        </div>
        <div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            fontWeight: 700,
            color: "#00E5FF",
            letterSpacing: "0.28em",
            lineHeight: 1.2,
          }}>
            IT CMD CTR
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 8,
            color: "#3A3A48",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}>
            NOC OPERATIONS
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", alignItems: "stretch", flex: 1 }}>
        {TABS.map(({ path, label, Icon }) => (
          <NavLink
            key={path}
            to={path}
            data-testid={`tab-${label.toLowerCase().replace(/\s+/g, "-")}`}
            className={({ isActive }) => `tab-item${isActive ? " tab-item-active" : ""}`}
          >
            <Icon size={11} style={{ marginRight: 6, flexShrink: 0, opacity: 0.7 }} />
            {label}
          </NavLink>
        ))}
      </div>

      {/* Right: Status + Clock */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "0 20px",
        borderLeft: "1px solid #1C1C24",
        flexShrink: 0,
      }}>
        {/* Node status */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }} data-testid="system-status">
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            color: "#3A3A48",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
          }}>
            NODE
          </span>
          <div style={{ position: "relative", display: "flex", width: 8, height: 8 }}>
            <div className="ping" style={{ position: "absolute", width: 8, height: 8, background: "#00FF66", opacity: 0.7 }} />
            <div style={{ position: "relative", width: 8, height: 8, background: "#00FF66", boxShadow: "0 0 8px #00FF66" }} />
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#00FF66", letterSpacing: "0.1em" }}>
            ONLINE
          </span>
        </div>

        {/* Clock */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={12} style={{ color: "#00E5FF", opacity: 0.6 }} />
          <div>
            <div
              data-testid="live-clock"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 14,
                fontWeight: 700,
                color: "#E2E2E5",
                letterSpacing: "0.06em",
                lineHeight: 1.2,
              }}
            >
              {format(time, "HH:mm:ss")}
            </div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 8,
              color: "#3A3A48",
              letterSpacing: "0.1em",
              lineHeight: 1,
            }}>
              {format(time, "yyyy-MM-dd")}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
