import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Map, Bell, ShieldCheck, Network, Ticket, Settings } from "lucide-react";

const NAV_ITEMS = [
  { path: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/map",       icon: Map,            label: "Map" },
  { path: "/alerts",    icon: Bell,           label: "Alerts" },
  { path: "/status",    icon: ShieldCheck,    label: "Vendors" },
  { path: "/circuits",  icon: Network,        label: "Circuits" },
  { path: "/tickets",   icon: Ticket,         label: "Tickets" },
  { path: "/settings",  icon: Settings,       label: "Settings" },
];

export default function Sidebar() {
  return (
    <nav
      data-testid="sidebar"
      className="w-[72px] h-screen flex flex-col items-center pt-3 pb-4 flex-shrink-0"
      style={{ background: "rgba(0,0,0,0.92)", borderRight: "1px solid rgba(0,240,255,0.12)" }}
    >
      {/* Logo */}
      <div className="mb-5 flex items-center justify-center">
        <div
          className="w-9 h-9 flex items-center justify-center"
          style={{ border: "1px solid rgba(0,240,255,0.35)", borderRadius: 3 }}
        >
          <div
            className="w-3 h-3 rounded-sm"
            style={{ background: "#00F0FF", boxShadow: "0 0 8px #00F0FF" }}
          />
        </div>
      </div>

      {NAV_ITEMS.map(({ path, icon: Icon, label }) => (
        <NavLink
          key={path}
          to={path}
          data-testid={`nav-${label.toLowerCase()}`}
          className={({ isActive }) =>
            `w-full flex flex-col items-center py-3 gap-1 transition-all duration-150 ${
              isActive ? "nav-active" : ""
            }`
          }
          style={({ isActive }) =>
            isActive
              ? {}
              : { color: "#4A5568", borderRight: "2px solid transparent" }
          }
          onMouseEnter={e => { if (!e.currentTarget.classList.contains("nav-active")) e.currentTarget.style.color = "#9CA3AF"; }}
          onMouseLeave={e => { if (!e.currentTarget.classList.contains("nav-active")) e.currentTarget.style.color = "#4A5568"; }}
        >
          <Icon size={17} strokeWidth={1.5} />
          <span style={{ fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "JetBrains Mono, monospace" }}>
            {label}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
