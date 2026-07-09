/**
 * MapEmbed — geographic NOC topology map for the Dashboard.
 * Full mesh: every site connected to every other site.
 *   Green flowing = both endpoints WAN up
 *   Red pulsing   = either endpoint WAN is DOWN
 */
import React, { useState, useEffect } from "react";
import { ComposableMap, Geographies, Geography, Marker, Line } from "react-simple-maps";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const PROJECTION_CONFIG = { scale: 4500, center: [-84.8, 42.4] };

const PRIMARY_STATES = new Set(["26", "39", "18", "17"]);  // MI OH IN IL
const CONTEXT_STATES = new Set(["55", "21", "42", "54"]);  // WI KY PA WV

// Site lon/lat
const SITES = {
  "Novi":             { coords: [-83.476, 42.481], hub: true  },
  "Remus":            { coords: [-85.147, 43.742]             },
  "Mt. Pleasant":     { coords: [-84.774, 43.603]             },
  "Ovid":             { coords: [-84.370, 43.009]             },
  "Constantine":      { coords: [-85.667, 41.841]             },
  "Canton":           { coords: [-81.378, 40.799]             },
  "Canton Warehouse": { coords: [-81.220, 41.020]             },
  "Middlebury":       { coords: [-85.960, 41.630]             },
  "Azure":            { coords: [-87.63,  41.88 ], cloud: true},
};

// Pre-generate all site pairs for the full mesh
const SITE_KEYS = Object.keys(SITES);
const MESH_PAIRS = [];
for (let i = 0; i < SITE_KEYS.length; i++)
  for (let j = i + 1; j < SITE_KEYS.length; j++)
    MESH_PAIRS.push({ src: SITE_KEYS[i], dst: SITE_KEYS[j] });

function normalize(name) {
  return (name || "").replace(/\s+plant$/i, "").trim();
}

export default function MapEmbed({ sites = [] }) {
  const [circuits, setCircuits] = useState([]);

  const fetchData = () =>
    axios.get(`${API}/circuits`)
      .then(r => setCircuits(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 60_000);
    return () => clearInterval(iv);
  }, []);

  // site name → worst circuit status
  const circuitStatus = {};
  circuits.forEach(c => {
    const key = normalize(c.site);
    const ord = { down: 0, degraded: 1, unknown: 2, up: 3 };
    if (circuitStatus[key] === undefined || ord[c.status] < ord[circuitStatus[key]])
      circuitStatus[key] = c.status || "unknown";
  });

  // fallback from /api/sites prop
  const siteStatus = {};
  sites.forEach(s => { siteStatus[normalize(s.name)] = s.status || "unknown"; });

  const isWanDown = name =>
    circuitStatus[name] === "down" || siteStatus[name] === "offline";

  return (
    <ComposableMap
      projection="geoMercator"
      projectionConfig={PROJECTION_CONFIG}
      width={1000}
      height={540}
      style={{ width: "100%", height: "100%", background: "transparent" }}
    >
      <defs>
        <style>{`
          @keyframes pkt-up  { from{stroke-dashoffset:0} to{stroke-dashoffset:-24} }
          @keyframes wan-down{ 0%,100%{opacity:.4} 50%{opacity:.85} }
        `}</style>
      </defs>

      <Geographies geography={GEO_URL}>
        {({ geographies }) =>
          geographies
            .filter(g => PRIMARY_STATES.has(g.id) || CONTEXT_STATES.has(g.id))
            .map(geo => (
              <Geography key={geo.rsmKey} geography={geo}
                fill={PRIMARY_STATES.has(geo.id) ? "#0A1A0A" : "#13131F"}
                stroke={PRIMARY_STATES.has(geo.id) ? "#1A3A1A" : "#2C2C40"}
                strokeWidth={PRIMARY_STATES.has(geo.id) ? 1.2 : 0.8}
                style={{ default:{outline:"none"}, hover:{outline:"none"}, pressed:{outline:"none"} }}
              />
            ))
        }
      </Geographies>

      {/* Full mesh: every site ↔ every other site */}
      {MESH_PAIRS.map(({ src, dst }, i) => {
        const srcC  = SITES[src]?.coords;
        const dstC  = SITES[dst]?.coords;
        if (!srcC || !dstC) return null;

        const down  = isWanDown(src) || isWanDown(dst);
        const color = down ? "#FF2A2A" : "#00FF66";

        // Connections to/from Novi or Azure are slightly more prominent (backbone role)
        const backbone = src === "Novi" || dst === "Novi" || src === "Azure" || dst === "Azure";
        const baseW  = backbone ? 0.65 : 0.35;
        const flowW  = backbone ? 1.1  : 0.7;
        const dash   = "4 20";   // total 24 — matches dashoffset delta for perfect loop
        const opFlow = backbone ? 0.70  : 0.40;
        const dur    = 2.4;      // uniform speed — no per-line variation

        return (
          <g key={`m-${src}-${dst}`}>
            {/* Ghost base trace */}
            <Line from={srcC} to={dstC}
              stroke={color} strokeWidth={down ? baseW * 2.5 : baseW}
              opacity={down ? 0.22 : 0.09} />
            {/* Flowing packets (only when up) */}
            {!down && (
              <Line from={srcC} to={dstC}
                stroke={color} strokeWidth={flowW} strokeDasharray={dash}
                style={{ animation:`pkt-up ${dur}s linear infinite`, opacity:opFlow }} />
            )}
            {/* Pulsing red (when down) */}
            {down && (
              <Line from={srcC} to={dstC}
                stroke={color} strokeWidth={baseW * 3}
                style={{ animation:`wan-down 1.8s ease-in-out infinite`, opacity:.6 }} />
            )}
          </g>
        );
      })}

      {/* Site nodes */}
      {Object.entries(SITES).map(([name, { coords, hub, cloud }]) => {
        if (cloud) {
          return (
            <Marker key={name} coordinates={coords}>
              <g>
                <rect x={-24} y={-13} width={48} height={26}
                  fill="#0B0B12" stroke="#00E5FF" strokeWidth={1.2} rx={2} />
                <text y={-2} textAnchor="middle" style={{
                  fontFamily:"'JetBrains Mono',monospace", fontSize:6.5,
                  fill:"#00E5FF", letterSpacing:"0.1em", fontWeight:700 }}>AZURE</text>
                <text y={8} textAnchor="middle" style={{
                  fontFamily:"'JetBrains Mono',monospace", fontSize:5.5,
                  fill:"#00E5FF", letterSpacing:"0.08em", opacity:.6 }}>CHICAGO</text>
              </g>
            </Marker>
          );
        }

        const key    = normalize(name);
        const down   = isWanDown(key);
        const color  = down ? "#FF2A2A" : "#00FF66";
        const nr     = hub ? 7 : 5;
        const rr     = hub ? 11 : 8;

        return (
          <Marker key={name} coordinates={coords}>
            <g>
              {down && (
                <circle r={rr + 3} fill="none" stroke={color} strokeWidth={0.7}
                  opacity={0.3} style={{ animation:"wan-down 2s ease-in-out infinite" }} />
              )}
              <circle r={nr} fill={color} opacity={hub ? 1 : 0.88} />
              <circle r={rr} fill="none" stroke={color} strokeWidth={hub ? 0.8 : 0.5} opacity={0.22} />
              <text y={-(nr + 5)} textAnchor="middle" style={{
                fontFamily:"'JetBrains Mono',monospace",
                fontSize: hub ? 7.5 : 6.5,
                fill: hub ? "#FAFAFA" : "#A1A1AA",
                letterSpacing:"0.05em",
                fontWeight: hub ? 700 : 400,
              }}>
                {name.toUpperCase()}
              </text>
            </g>
          </Marker>
        );
      })}
    </ComposableMap>
  );
}
