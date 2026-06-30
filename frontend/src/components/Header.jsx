import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { useLocation } from "react-router-dom";

const PAGE_MAP = {
  "/dashboard": "DASHBOARD",
  "/map":       "NETWORK MAP",
  "/alerts":    "ALERTS",
  "/status":    "VENDOR STATUS",
  "/circuits":  "DIA CIRCUITS",
  "/tickets":   "TICKETS",
  "/unifi":     "UNIFI EVENTS",
  "/settings":  "SETTINGS",
};

export default function Header() {
  const [time, setTime] = useState(new Date());
  const { pathname } = useLocation();
  const label = PAGE_MAP[pathname] || "";

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header
      data-testid="main-header"
      className="flex items-center px-6 flex-shrink-0"
      style={{ height: 40, background: "#09090B", borderBottom: "1px solid #141416" }}
    >
      {/* Page slug */}
      <div style={{ flex: 1, fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: "#27272A", letterSpacing: "0.2em" }}>
        {label && `// ${label}`}
      </div>

      {/* Clock */}
      <div className="flex items-center gap-4">
        <span
          data-testid="live-clock"
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#3F3F46", letterSpacing: "0.12em" }}
        >
          {format(time, "HH:mm:ss")}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: "#1F1F23", letterSpacing: "0.1em" }}>
          {format(time, "yyyy-MM-dd")}
        </span>
      </div>

      {/* Online indicator */}
      <div className="flex-1 flex justify-end" data-testid="system-status">
        <div className="flex items-center gap-2">
          <div className="relative flex" style={{ width: 7, height: 7 }}>
            <div className="absolute inline-flex opacity-75 ping" style={{ width: 7, height: 7, background: "#10B981" }} />
            <div className="relative inline-flex" style={{ width: 7, height: 7, background: "#10B981" }} />
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#1F1F23", letterSpacing: "0.15em" }}>
            ONLINE
          </span>
        </div>
      </div>
    </header>
  );
}
