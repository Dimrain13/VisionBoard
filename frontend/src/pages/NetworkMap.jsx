import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  Line,
} from "react-simple-maps";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// US States TopoJSON — filtered to MI/OH/IN + surrounding context
const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

// FIPS codes:  MI=26  OH=39  IN=18  IL=17  (context: WI=55, KY=21, PA=42, WV=54)
const PRIMARY_STATES  = new Set(["26", "39", "18", "17"]);
const CONTEXT_STATES  = new Set(["55", "21", "42", "54"]);

// Actual lon/lat for each site — used for Marker + Line coordinates
const SITES = {
  "Remus":            { coords: [-85.147, 43.598] },
  "Mt. Pleasant":     { coords: [-84.774, 43.598] },
  "Ovid":             { coords: [-84.371, 43.001] },
  "Constantine":      { coords: [-85.667, 41.841] },
  "Novi":             { coords: [-83.476, 42.481] },
  "Canton":           { coords: [-81.378, 40.799] },
  "Canton Warehouse": { coords: [-81.220, 41.020] }, // offset NW for readability
  "Middlebury":       { coords: [-85.960, 41.630] }, // offset slightly west to separate from Constantine
  // Azure Cloud — Microsoft Azure Central US region, hosted in Chicago, IL
  "Azure":            { coords: [-87.63,  41.88 ] },
};

const STATUS_COLOR = {
  up:      "#00FF66",
  degraded:"#FFB014",
  down:    "#FF2A2A",
  unknown: "#3A3A48",
};

const DOT_CLASS = {
  online:  "dot-online",
  degraded:"dot-degraded",
  offline: "dot-offline",
  unknown: "dot-unknown",
};

// Mercator projection — framed to show MI (full) + NE Ohio (Canton) + N Indiana + Chicago (Azure)
const PROJECTION_CONFIG = {
  scale: 4500,
  center: [-84.8, 42.4],
};

export default function NetworkMap() {
  const [sites,        setSites]        = useState([]);
  const [links,        setLinks]        = useState([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [linkError,    setLinkError]    = useState(false);
  const [selected,     setSelected]     = useState(null);

  useEffect(() => {
    const fetchSites = () =>
      axios.get(`${API}/sites`, { timeout: 60000 })
        .then(r => setSites(r.data))
        .catch(e => console.error("Sites error:", e))
        .finally(() => setLoadingSites(false));
    fetchSites();
    const iv = setInterval(fetchSites, 60000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const fetchLinks = () => {
      setLinkError(false);
      axios.get(`${API}/aruba/mesh`, { timeout: 60000 })
        .then(r => setLinks(Array.isArray(r.data) ? r.data : []))
        .catch(e => { console.error("Mesh error:", e); setLinkError(true); setLinks([]); })
        .finally(() => setLoadingLinks(false));
    };
    fetchLinks();
    const iv = setInterval(fetchLinks, 60000);
    return () => clearInterval(iv);
  }, []);

  const statusBadge = s =>
    ({ online:"badge-green", degraded:"badge-amber", offline:"badge-red", unknown:"badge-zinc" }[s] || "badge-zinc");

  const siteStatusMap = {};
  sites.forEach(s => { siteStatusMap[s.name] = s; });

  const upCount   = links.filter(l => l.status === "up").length;
  const downCount = links.filter(l => l.status === "down").length;

  return (
    <div className="h-full flex flex-col gap-3">

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <h1 style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:700, color:"#E2E2E5", letterSpacing:"0.18em" }}>
          SD-WAN MESH TOPOLOGY
        </h1>
        <div style={{ display:"flex", alignItems:"center", gap:20 }}>
          {[["#00FF66","TUNNEL UP"],["#FFB014","DEGRADED"],["#FF2A2A","TUNNEL DOWN"],["#3A3A48","UNKNOWN"]].map(([c,l]) => (
            <span key={l} style={{ display:"flex", alignItems:"center", gap:6, fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:"#3A3A48", letterSpacing:"0.1em" }}>
              <span style={{ width:18, height:2, background:c, display:"inline-block", flexShrink:0, boxShadow: c !== "#3A3A48" ? `0 0 4px ${c}` : "none" }} />
              {l}
            </span>
          ))}
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:"#3A3A48", letterSpacing:"0.1em" }}>
            {loadingLinks
              ? "FETCHING TUNNELS..."
              : linkError
                ? "ARUBA UNREACHABLE"
                : `${links.length} LINKS · ${upCount} UP · ${downCount} DOWN`}
          </span>
        </div>
      </div>

      <div className="flex-1 grid gap-3 min-h-0" style={{ gridTemplateColumns:"1fr 290px" }}>

        {/* Map */}
        <div className="card overflow-hidden" style={{ padding:0, position:"relative" }}>
          <ComposableMap
            data-testid="mesh-topology-svg"
            projection="geoMercator"
            projectionConfig={PROJECTION_CONFIG}
            width={1000}
            height={580}
            style={{ width:"100%", height:"100%", background:"transparent" }}
          >
            {/* State fills */}
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies
                  .filter(g => PRIMARY_STATES.has(g.id) || CONTEXT_STATES.has(g.id))
                  .map(geo => {
                    const isPrimary = PRIMARY_STATES.has(geo.id);
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={isPrimary ? "#0A1A0A" : "#13131F"}
                        stroke={isPrimary ? "#1A3A1A" : "#2C2C40"}
                        strokeWidth={isPrimary ? 1.2 : 0.9}
                        style={{ default:{ outline:"none" }, hover:{ outline:"none" }, pressed:{ outline:"none" } }}
                      />
                    );
                  })
              }
            </Geographies>

            {/* ── Keyframe for flowing packet animation ── */}
            <defs>
              <style>{`
                @keyframes packet-flow {
                  from { stroke-dashoffset: 0; }
                  to   { stroke-dashoffset: -24; }
                }
              `}</style>
            </defs>

            {/* Tunnel lines — two layers: base wire + flowing packets */}
            {links.map((link, i) => {
              const src = SITES[link.src]?.coords;
              const dst = SITES[link.dst]?.coords;
              if (!src || !dst) return null;
              const color     = STATUS_COLOR[link.status] || "#3A3A48";
              const isDown    = link.status === "down";
              const isDegraded= link.status === "degraded";
              // Stagger speed slightly per tunnel so they don't all pulse in sync
              const duration  = 1.6 + (i % 9) * 0.18;
              const delay     = (i % 7) * 0.22;
              return (
                <g key={i}>
                  {/* Base wire — always visible */}
                  <Line
                    from={src} to={dst}
                    stroke={color}
                    strokeWidth={isDown ? 1.2 : 0.6}
                    strokeOpacity={isDown ? 0.55 : isDegraded ? 0.30 : 0.12}
                    strokeLinecap="round"
                  />
                  {/* Flowing dashes — packets in transit (hidden when down) */}
                  {!isDown && (
                    <Line
                      from={src} to={dst}
                      stroke={color}
                      strokeWidth={isDegraded ? 1.4 : 1.0}
                      strokeOpacity={isDegraded ? 0.60 : 0.42}
                      strokeDasharray="4 20"
                      strokeLinecap="round"
                      style={{
                        animation: `packet-flow ${duration}s linear infinite`,
                        animationDelay: `${delay}s`,
                      }}
                    />
                  )}
                </g>
              );
            })}

            {/* Site markers */}
            {Object.entries(SITES).map(([name, { coords }]) => {
              const siteData   = siteStatusMap[name];
              const isCloud    = name === "Azure";
              const status     = siteData?.status || "unknown";
              const colorKey   = status === "online" ? "up" : status === "offline" ? "down" : status === "degraded" ? "degraded" : "unknown";
              const color      = STATUS_COLOR[colorKey];
              const isSelected = selected?.name === name;

              return (
                <Marker
                  key={name}
                  coordinates={coords}
                  data-testid={`map-site-${name.replace(/\s+/g,"-")}`}
                  onClick={() => setSelected(isSelected ? null : (siteData || { name }))}
                  style={{ cursor:"pointer" }}
                >
                  {isSelected && (
                    <circle r={isCloud ? 20 : 14} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.4} />
                  )}

                  {isCloud ? (
                    <g>
                      <rect x={-30} y={-14} width={60} height={28}
                        fill={isSelected ? `${color}22` : "#0B0B0F"}
                        stroke={color} strokeWidth={isSelected ? 2 : 1.5}
                      />
                      <text y={-2} textAnchor="middle"
                        style={{ fontSize:7, fontFamily:"JetBrains Mono", fill:color, letterSpacing:"0.08em", fontWeight:700 }}>
                        AZURE
                      </text>
                      <text y={8} textAnchor="middle"
                        style={{ fontSize:6, fontFamily:"JetBrains Mono", fill:color, letterSpacing:"0.06em", opacity:0.7 }}>
                        CHICAGO
                      </text>
                    </g>
                  ) : (
                    <rect
                      x={-7} y={-7} width={14} height={14}
                      fill={isSelected ? `${color}33` : "#0D0D12"}
                      stroke={color} strokeWidth={isSelected ? 2 : 1.5}
                      transform="rotate(45)"
                    />
                  )}

                  <text
                    y={isCloud ? 26 : 22}
                    textAnchor="middle"
                    style={{
                      fontSize:8.5,
                      fontFamily:"JetBrains Mono",
                      fill: isSelected ? color : "#7A7A8A",
                      letterSpacing:"0.06em",
                      fontWeight: isSelected ? 700 : 400,
                    }}
                  >
                    {name.toUpperCase()}
                  </text>
                </Marker>
              );
            })}
          </ComposableMap>

          {/* Overlay indicators */}
          {loadingLinks && (
            <div style={{ position:"absolute", top:8, right:12, fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, color:"#3A3A48", letterSpacing:"0.1em" }}>
              FETCHING TUNNELS...
            </div>
          )}
        </div>

        {/* Site panel */}
        <div className="card flex flex-col min-h-0 overflow-hidden">
          <div className="card-header">
            <span>SITES ({sites.length})</span>
            {loadingSites && (
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:8.5, color:"#3A3A48" }}>LOADING...</span>
            )}
          </div>

          <div className="flex-1 overflow-auto">
            {sites.map(site => (
              <button key={site.id}
                data-testid={`site-item-${site.id}`}
                onClick={() => setSelected(selected?.name === site.name ? null : site)}
                style={{
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  padding:"10px 16px",
                  background: selected?.name === site.name ? "rgba(0,229,255,0.04)" : "transparent",
                  border:"none", cursor:"pointer", width:"100%", textAlign:"left",
                  borderLeft: selected?.name === site.name ? "2px solid #00E5FF" : "2px solid transparent",
                }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#C0C0CC", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {site.name}
                  </div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:"#3A3A48", marginTop:2, letterSpacing:"0.05em" }}>
                    {site.state} · {site.circuit_count} circuit{site.circuit_count !== 1 ? "s" : ""}
                  </div>
                </div>
                <div style={{ position:"relative", display:"flex", width:8, height:8, flexShrink:0 }}>
                  {site.status !== "online" && site.status !== "unknown" && (
                    <div className={`ping absolute ${DOT_CLASS[site.status] || "dot-unknown"}`} style={{ width:8, height:8 }} />
                  )}
                  <div className={`relative ${DOT_CLASS[site.status] || "dot-unknown"}`} style={{ width:8, height:8 }} />
                </div>
              </button>
            ))}
          </div>

          {/* Selected site detail */}
          {selected && (
            <div style={{ flexShrink:0, padding:"14px 16px", borderTop:"1px solid #1C1C24" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:700, color:"#E2E2E5", letterSpacing:"0.08em" }}>
                  {selected.name?.toUpperCase()}
                </span>
                {selected.status && (
                  <span className={`badge ${statusBadge(selected.status)}`}>
                    {selected.status.toUpperCase()}
                  </span>
                )}
              </div>
              {[
                ["State",         selected.state],
                ["Type",          selected.type],
                ["Circuits",      selected.circuit_count],
                ["Active Alerts", selected.alert_count],
              ].filter(([, v]) => v !== undefined).map(([k, v]) => (
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid rgba(28,28,36,0.8)" }}>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:"#3A3A48" }}>{k}</span>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color: k === "Active Alerts" && v > 0 ? "#FFB014" : "#9090A0" }}>{v}</span>
                </div>
              ))}
              {(() => {
                const siteLinks = links.filter(l => l.src === selected.name || l.dst === selected.name);
                if (!siteLinks.length) return null;
                return (
                  <div style={{ marginTop:10 }}>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:"#3A3A48", letterSpacing:"0.08em", marginBottom:6 }}>
                      TUNNELS ({siteLinks.length})
                    </div>
                    {siteLinks.slice(0, 6).map((l, i) => {
                      const peer = l.src === selected.name ? l.dst : l.src;
                      const c    = STATUS_COLOR[l.status] || "#3A3A48";
                      return (
                        <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"3px 0" }}>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#7A7A8A" }}>{peer}</span>
                          <span style={{ width:24, height:2, background:c, boxShadow:`0 0 4px ${c}` }} />
                        </div>
                      );
                    })}
                    {siteLinks.length > 6 && (
                      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#3A3A48", marginTop:4 }}>
                        +{siteLinks.length - 6} more
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
