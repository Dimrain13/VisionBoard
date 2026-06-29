import React, { useState, useEffect } from "react";
import { format } from "date-fns";

export default function Header() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header
      data-testid="main-header"
      className="h-12 flex items-center px-6 flex-shrink-0"
      style={{ background: "rgba(9,9,11,0.95)", borderBottom: "1px solid #27272A" }}
    >
      {/* Left: breadcrumb placeholder */}
      <div className="flex-1" />

      {/* Center: Clock */}
      <div className="flex items-center gap-3">
        <span
          data-testid="live-clock"
          className="tabular-nums text-sm font-medium"
          style={{ fontFamily: "JetBrains Mono, monospace", color: "#A1A1AA" }}
        >
          {format(time, "HH:mm:ss")}
        </span>
        <span className="text-xs" style={{ color: "#52525B" }}>
          {format(time, "EEE, MMM dd yyyy")}
        </span>
      </div>

      {/* Right: status */}
      <div className="flex-1 flex justify-end">
        <div className="flex items-center gap-2" data-testid="system-status">
          <div className="relative flex h-2 w-2">
            <div className="absolute inline-flex h-full w-full rounded-full opacity-75 ping bg-emerald-400" />
            <div className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
          </div>
          <span className="text-xs" style={{ color: "#52525B" }}>Online</span>
        </div>
      </div>
    </header>
  );
}
