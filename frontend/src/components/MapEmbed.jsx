/**
 * MapEmbed — geographic NOC topology map for the Dashboard.
 * Hub-and-spoke: Novi HQ → every other site (8 lines vs 36 full-mesh).
 * Uses opacity animation (GPU-composited) instead of stroke-dashoffset (CPU paint).
 *   Green pulse  = WAN up
 *   Red pulse    = either endpoint WAN is DOWN
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
  "Canton Warehouse": { coords: [-81.536, 40.578]             },
  "Middlebury":       { coords: [-85.960, 41.630]             },
  "Azure":            { coords: [-87.63,  41.88 ], cloud: true},
};

// Hub-and-spoke: Novi → every other site (8 lines total — much lighter than 36-line full mesh)
const SITE_KEYS = Object.keys(SITES);
const SPOKES = SITE_KEYS
  .filter(k => k !== "Novi")
  .map((k, idx) => ({ src: "Novi", dst: k, idx }));

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
          @keyframes spoke-up   { 0%,100%{opacity:0.25} 50%{opacity:0.70} }
          @keyframes spoke-down { 0%,100%{opacity:0.30} 50%{opacity:0.90} }
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

      {/* Hub-and-spoke: Novi → 8 sites (opacity animation = GPU composited, no CPU repaint) */}
      {SPOKES.map(({ src, dst, idx }) => {
        const srcC  = SITES[src]?.coords;
        const dstC  = SITES[dst]?.coords;
        if (!srcC || !dstC) return null;

        const down  = isWanDown(normalize(dst));
        const color = down ? "#FF2A2A" : "#00FF66";
        const w     = dst === "Azure" ? 1.0 : 0.75;
        // Negative delay = start partway through cycle so lines don't all pulse together
        const delay = `-${((idx * 0.45) % 3.0).toFixed(2)}s`;

        return (
          <g key={`spoke-${dst}`}>
            {/* Static ghost base — no animation, pure fill */}
            <Line from={srcC} to={dstC} stroke={color} strokeWidth={w * 0.35} opacity={0.07} />
            {/* Opacity-animated active line — GPU composited, zero CPU repaint */}
            <Line from={srcC} to={dstC} stroke={color} strokeWidth={w}
              style={{
                animation: down
                  ? `spoke-down 1.6s ease-in-out ${delay} infinite`
                  : `spoke-up 3.0s ease-in-out ${delay} infinite`,
                willChange: "opacity",
              }}
            />
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

        const key   = normalize(name);
        const down  = isWanDown(key);
        const color = down ? "#FF2A2A" : "#00FF66";
        const nr    = hub ? 7 : 5;
        const rr    = hub ? 11 : 8;

        return (
          <Marker key={name} coordinates={coords}>
            <g>
              <circle r={nr} fill={color} opacity={hub ? 1 : 0.88} />
              <circle r={rr} fill="none" stroke={color} strokeWidth={hub ? 0.8 : 0.5} opacity={0.22} />
              <text y={-(nr + 5)} textAnchor="middle" style={{
                fontFamily:"'JetBrains Mono',monospace",
                fontSize: hub ? 7.5 : 6.5,
                fill: hub ? "#FAFAFA" : "#D0D0D8",
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
