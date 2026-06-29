import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { Activity } from "lucide-react";

export default function Header() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header
      data-testid="main-header"
      className="h-16 border-b flex items-center px-6 flex-shrink-0"
      style={{ background: "rgba(0,0,0,0.85)", borderColor: "rgba(0,240,255,0.15)" }}
    >
      {/* Left */}
      <div className="flex items-center gap-3 w-64">
        <Activity size={18} style={{ color: "#00F0FF" }} strokeWidth={1.5} />
        <span
          className="text-lg font-bold tracking-widest uppercase"
          style={{ fontFamily: "Rajdhani, sans-serif", color: "#fff", letterSpacing: "0.18em" }}
        >
          IT Command Center
        </span>
      </div>

      {/* Center: Clock */}
      <div className="flex-1 flex flex-col items-center">
        <div
          data-testid="live-clock"
          className="text-2xl font-bold tracking-widest glow-cyan"
          style={{ fontFamily: "JetBrains Mono, monospace", color: "#00F0FF" }}
        >
          {format(time, "HH:mm:ss")}
        </div>
        <div
          className="text-xs tracking-wider mt-0.5"
          style={{ fontFamily: "JetBrains Mono, monospace", color: "#4A5568" }}
        >
          {format(time, "EEE, MMM dd yyyy")} UTC{format(time, "xxx")}
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3 w-64 justify-end" data-testid="system-status">
        <div
          className="w-2 h-2 rounded-full pulse-dot"
          style={{ background: "#00F0FF" }}
        />
        <span
          className="text-xs tracking-widest uppercase"
          style={{ fontFamily: "JetBrains Mono, monospace", color: "#00F0FF" }}
        >
          System Online
        </span>
      </div>
    </header>
  );
}
