/**
 * MapEmbed — lightweight hub-and-spoke topology diagram for the Dashboard.
 * Shows all network sites connected to the Azure hub, colored by circuit status.
 * Does NOT depend on react-simple-maps (fast, no GeoJSON needed).
 */
import React from "react";

const STATUS_COLOR = {
  online:   "#00FF66",
  up:       "#00FF66",
  offline:  "#FF2A2A",
  down:     "#FF2A2A",
  degraded: "#FFB014",
  unknown:  "#3A3A48",
};

// Fixed polar layout — sites arranged clockwise around Azure hub
const SITE_ANGLES = {
  "Remus":             -100,
  "Mt. Pleasant":       -70,
  "Ovid":               -35,
  "Novi":                10,
  "Canton":              45,
  "Canton Warehouse":    70,
  "Constantine":        130,
  "Middlebury":         165,
};

export default function MapEmbed({ sites = [] }) {
  const W = 700, H = 420, CX = W / 2, CY = H / 2 - 10;
  const R = Math.min(W, H) * 0.38;

  const siteNodes = (sites.length ? sites : Object.keys(SITE_ANGLES).map(name => ({ name, status: "unknown" }))).map(site => {
    const angle = SITE_ANGLES[site.name] ?? 0;
    const rad   = (angle * Math.PI) / 180;
    return {
      ...site,
      x:     CX + R * Math.cos(rad),
      y:     CY + R * Math.sin(rad),
      color: STATUS_COLOR[site.status] ?? STATUS_COLOR.unknown,
    };
  });

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ background: "transparent" }}
    >
      <defs>
        <filter id="me-glow-cyan">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <style>{`
          @keyframes me-packet { 0% { stroke-dashoffset: 32; } 100% { stroke-dashoffset: 0; } }
          .me-tunnel { animation: me-packet 2s linear infinite; }
        `}</style>
      </defs>

      {/* Orbit ring */}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#1C1C24" strokeWidth={0.5} strokeDasharray="4 6" />

      {/* Tunnel lines */}
      {siteNodes.map(site => (
        <g key={`l-${site.id || site.name}`}>
          <line x1={site.x} y1={site.y} x2={CX} y2={CY} stroke={site.color} strokeWidth={1} opacity={0.15} />
          <line className="me-tunnel" x1={site.x} y1={site.y} x2={CX} y2={CY}
            stroke={site.color} strokeWidth={1.5} opacity={0.7}
            strokeDasharray="6 26"
            style={{ animationDelay: `${(SITE_ANGLES[site.name] ?? 0) * 5}ms` }}
          />
        </g>
      ))}

      {/* Site nodes */}
      {siteNodes.map(site => {
        const isLeft  = site.x < CX - 20;
        const isRight = site.x > CX + 20;
        const anchor  = isLeft ? "end" : isRight ? "start" : "middle";
        const lx = isLeft ? site.x - 10 : isRight ? site.x + 10 : site.x;
        const ly = site.y < CY ? site.y - 12 : site.y + 16;
        return (
          <g key={`n-${site.id || site.name}`}>
            <circle cx={site.x} cy={site.y} r={7} fill="none" stroke={site.color} strokeWidth={0.5} opacity={0.4} />
            <circle cx={site.x} cy={site.y} r={4} fill={site.color} opacity={0.9} />
            <text x={lx} y={ly} textAnchor={anchor}
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fill: "#A1A1AA", letterSpacing: "0.06em" }}>
              {(site.name || "").toUpperCase()}
            </text>
          </g>
        );
      })}

      {/* Azure hub */}
      <g filter="url(#me-glow-cyan)">
        <circle cx={CX} cy={CY} r={22} fill="none" stroke="#00E5FF" strokeWidth={0.5} opacity={0.2} />
        <circle cx={CX} cy={CY} r={16} fill="none" stroke="#00E5FF" strokeWidth={1} opacity={0.35} />
        <circle cx={CX} cy={CY} r={10} fill="#030305" stroke="#00E5FF" strokeWidth={1.5} />
        <circle cx={CX} cy={CY} r={5}  fill="#00E5FF" opacity={0.85} />
        <text x={CX} y={CY + 32} textAnchor="middle"
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fill: "#00E5FF", letterSpacing: "0.14em", fontWeight: 700 }}>
          AZURE
        </text>
        <text x={CX} y={CY + 43} textAnchor="middle"
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7.5, fill: "#3A3A48", letterSpacing: "0.1em" }}>
          CHICAGO
        </text>
      </g>
    </svg>
  );
}
