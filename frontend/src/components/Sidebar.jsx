import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Map, Bell, ShieldCheck, Network, Ticket, Settings, Activity } from "lucide-react";

const NAV = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/map",       icon: Map,             label: "Network Map" },
  { path: "/alerts",    icon: Bell,            label: "Alerts" },
  { path: "/status",    icon: ShieldCheck,     label: "Vendor Status" },
  { path: "/circuits",  icon: Network,         label: "DIA Circuits" },
  { path: "/tickets",   icon: Ticket,          label: "Tickets" },
  { path: "/settings",  icon: Settings,        label: "Settings" },
];

export default function Sidebar() {
  return (
    <aside
      data-testid="sidebar"
      className="w-56 h-screen flex flex-col flex-shrink-0"
      style={{ background: "rgba(9,9,11,0.95)", borderRight: "1px solid #27272A" }}
    >
      {/* Logo */}
      <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: "1px solid #27272A" }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <Activity size={15} className="text-white" strokeWidth={2} />
        </div>
        <div>
          <div className="text-sm font-semibold text-white leading-tight" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>
            IT Command
          </div>
          <div className="text-xs leading-tight" style={{ color: "#52525B" }}>Operations Center</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5">
        {NAV.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={path}
            data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
            className={({ isActive }) => `nav-item ${isActive ? "nav-item-active" : ""}`}
          >
            <Icon size={16} strokeWidth={1.5} className="flex-shrink-0" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4" style={{ borderTop: "1px solid #27272A" }}>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
          <span className="text-xs" style={{ color: "#52525B", fontFamily: "JetBrains Mono, monospace" }}>
            All systems nominal
          </span>
        </div>
      </div>
    </aside>
  );
}
