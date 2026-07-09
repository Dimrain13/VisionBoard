import React, { useState, useEffect } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Approximate geographical SVG positions (1000 x 580 viewport)
// Covers Michigan / Ohio / Indiana region
const SITE_COORDS = {
  "Remus":            { x: 210, y: 88  },
  "Mt. Pleasant":     { x: 310, y: 88  },
  "Ovid":             { x: 395, y: 148 },
  "Novi":             { x: 510, y: 228 },
  "Constantine":      { x: 170, y: 308 },
  "Middlebury":       { x: 155, y: 335 },
  "Canton":           { x: 750, y: 420 },
  "Canton Warehouse": { x: 790, y: 448 },
  "Azure":            { x: 920, y: 52  },
};

const STATUS_COLOR = {
  up:       "#00FF66",
  degraded: "#FFB014",
  down:     "#FF2A2A",
  unknown:  "#3A3A48",
};
const DOT_CLASS = {
  online:   "dot-online",
  degraded: "dot-degraded",
  offline:  "dot-offline",
  unknown:  "dot-unknown",
};

function siteCoords(name) {
  const base = SITE_COORDS[name];
  if (base) return base;
  // Fallback: spread unknown sites across top
  return { x: 500, y: 30 };
}

export default function NetworkMap() {
  const [sites,    setSites]    = useState([]);
  const [links,    setLinks]    = useState([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [selected, setSelected] = useState(null);

  // Load sites independently
  useEffect(() => {
    const fetchSites = () =>
      axios.get(`${API}/sites`)
        .then(r => setSites(r.data))
        .catch(e => console.error("Sites load error:", e))
        .finally(() => setLoadingSites(false));
    fetchSites();
    const iv = setInterval(fetchSites, 30000);
    return () => clearInterval(iv);
  }, []);

  // Load mesh links independently
  useEffect(() => {
    const fetchLinks = () =>
      axios.get(`${API}/aruba/mesh`)
        .then(r => setLinks(r.data))
        .catch(e => console.error("Mesh load error:", e))
        .finally(() => setLoadingLinks(false));
    fetchLinks();
    const iv = setInterval(fetchLinks, 30000);
    return () => clearInterval(iv);
  }, []);

  const statusBadge = (s) =>
    ({ online: "badge-green", degraded: "badge-amber", offline: "badge-red", unknown: "badge-zinc" }[s] || "badge-zinc");

  const siteStatusMap = {};
  sites.forEach(s => { siteStatusMap[s.name] = s; });

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <h1 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, color: "#E2E2E5", letterSpacing: "0.18em" }}>
          SD-WAN MESH TOPOLOGY
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {[["#00FF66","TUNNEL UP"],["#FFB014","DEGRADED"],["#FF2A2A","TUNNEL DOWN"],["#3A3A48","UNKNOWN"]].map(([c, l]) => (
            <span key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: "#3A3A48", letterSpacing: "0.1em" }}>
              <span style={{ width: 16, height: 2, background: c, display: "inline-block", flexShrink: 0, boxShadow: c !== "#3A3A48" ? `0 0 4px ${c}` : "none" }} />
              {l}
            </span>
          ))}
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: "#3A3A48", letterSpacing: "0.1em" }}>
            {links.length} LINKS · {sites.length} SITES
          </span>
        </div>
      </div>

      <div className="flex-1 grid gap-3 min-h-0" style={{ gridTemplateColumns: "1fr 290px" }}>

        {/* SVG Topology */}
        <div className="card overflow-hidden" style={{ padding: 0, position: "relative", minHeight: 200 }}>
          {loadingLinks && (
            <div style={{ position: "absolute", top: 8, right: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#3A3A48", zIndex: 2, letterSpacing: "0.1em" }}>
              LOADING TUNNELS...
            </div>
          )}
          <svg
            data-testid="mesh-topology-svg"
            viewBox="0 0 1000 580"
            style={{ width: "100%", height: "100%", background: "transparent", display: "block", minHeight: 200 }}
          >
              {/* Subtle state outline */}
              <text x="500" y="290" textAnchor="middle"
                style={{ fontSize: 120, fontFamily: "JetBrains Mono", fill: "#1C1C24", fontWeight: 700, opacity: 0.3 }}
              >MI</text>

              {/* Mesh Links */}
              {links.map((link, i) => {
                const s = siteCoords(link.src);
                const d = siteCoords(link.dst);
                const color = STATUS_COLOR[link.status] || "#3A3A48";
                const opacity = link.status === "up" ? 0.22 : 0.6;
                return (
                  <line key={i}
                    x1={s.x} y1={s.y} x2={d.x} y2={d.y}
                    stroke={color}
                    strokeWidth={link.status === "down" ? 1.5 : 0.8}
                    strokeOpacity={opacity}
                    style={{ filter: link.status !== "up" ? `drop-shadow(0 0 3px ${color})` : "none" }}
                  />
                );
              })}

              {/* Site Nodes */}
              {Object.entries(SITE_COORDS).map(([name, pos]) => {
                const siteData = siteStatusMap[name];
                const isCloud  = name === "Azure";
                const status   = siteData?.status || "unknown";
                const color    = STATUS_COLOR[
                  status === "online" ? "up" : status === "offline" ? "down" : status
                ] || "#3A3A48";
                const isSelected = selected?.name === name;

                return (
                  <g key={name} data-testid={`map-site-${name.replace(/\s+/g, "-")}`}
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelected(isSelected ? null : (siteData || { name }))}
                  >
                    {/* Glow ring for selected or unhealthy */}
                    {(isSelected || status === "offline" || status === "degraded") && (
                      <circle cx={pos.x} cy={pos.y} r={14}
                        fill="none" stroke={color} strokeWidth={1}
                        strokeOpacity={0.35}
                      />
                    )}
                    {/* Node */}
                    {isCloud ? (
                      <>
                        <rect x={pos.x - 14} y={pos.y - 9} width={28} height={18}
                          fill="#0B0B0F" stroke={color} strokeWidth={1.5} rx={0}
                        />
                        <text x={pos.x} y={pos.y + 4.5} textAnchor="middle"
                          style={{ fontSize: 7.5, fontFamily: "JetBrains Mono", fill: color, letterSpacing: "0.05em" }}
                        >AZURE</text>
                      </>
                    ) : (
                      <rect x={pos.x - 7} y={pos.y - 7} width={14} height={14}
                        fill={isSelected ? color : "#0D0D12"}
                        stroke={color} strokeWidth={isSelected ? 2 : 1.5}
                        transform={`rotate(45 ${pos.x} ${pos.y})`}
                      />
                    )}
                    {/* Site label */}
                    <text x={pos.x} y={pos.y + 22} textAnchor="middle"
                      style={{ fontSize: 9, fontFamily: "JetBrains Mono", fill: isSelected ? color : "#9090A0", letterSpacing: "0.06em", fontWeight: isSelected ? 700 : 400 }}
                    >{name.toUpperCase()}</text>
                  </g>
                );
              })}
            </svg>
        </div>

        {/* Site Panel */}
        <div className="card flex flex-col min-h-0 overflow-hidden">
          <div className="card-header">
            <span>SITES ({sites.length})</span>
          </div>
          <div className="flex-1 overflow-auto">
            {sites.map(site => (
              <button key={site.id} data-testid={`site-item-${site.id}`}
                onClick={() => setSelected(selected?.name === site.name ? null : site)}
                className="w-full table-row"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 16px", background: selected?.name === site.name ? "rgba(0,229,255,0.04)" : "transparent",
                  border: "none", cursor: "pointer", width: "100%", textAlign: "left",
                  borderLeft: selected?.name === site.name ? "2px solid #00E5FF" : "2px solid transparent",
                }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#C0C0CC", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {site.name}
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: "#3A3A48", marginTop: 2, letterSpacing: "0.05em" }}>
                    {site.state} · {site.circuit_count} circuit{site.circuit_count !== 1 ? "s" : ""}
                  </div>
                </div>
                <div style={{ position: "relative", display: "flex", width: 8, height: 8, flexShrink: 0 }}>
                  {site.status !== "online" && site.status !== "unknown" && (
                    <div className={`ping absolute ${DOT_CLASS[site.status] || "dot-unknown"}`}
                      style={{ width: 8, height: 8 }} />
                  )}
                  <div className={`relative ${DOT_CLASS[site.status] || "dot-unknown"}`}
                    style={{ width: 8, height: 8 }} />
                </div>
              </button>
            ))}
          </div>

          {selected && (
            <div style={{ flexShrink: 0, padding: "14px 16px", borderTop: "1px solid #1C1C24" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: "#E2E2E5", letterSpacing: "0.08em" }}>
                  {selected.name?.toUpperCase()}
                </span>
                {selected.status && (
                  <span className={`badge ${statusBadge(selected.status)}`}>{selected.status.toUpperCase()}</span>
                )}
              </div>
              {[
                ["State",        selected.state],
                ["Type",         selected.type],
                ["Circuits",     selected.circuit_count],
                ["Active Alerts",selected.alert_count],
              ].filter(([,v]) => v !== undefined).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(28,28,36,0.8)" }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: "#3A3A48" }}>{k}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: k === "Active Alerts" && v > 0 ? "#FFB014" : "#9090A0" }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
