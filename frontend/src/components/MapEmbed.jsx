/**
 * MapEmbed — geographic NOC topology map for the Dashboard.
 * Uses react-simple-maps (same engine as NetworkMap page) so both maps
 * look identical. Fetches its own mesh-link data; accepts `sites` prop
 * from the dashboard for circuit-status colouring on each node.
 */
import React, { useState, useEffect } from "react";
import { ComposableMap, Geographies, Geography, Marker, Line } from "react-simple-maps";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

const PROJECTION_CONFIG = { scale: 4500, center: [-84.8, 42.4] };

// FIPS — same as NetworkMap
const PRIMARY_STATES = new Set(["26", "39", "18", "17"]);          // MI OH IN IL
const CONTEXT_STATES = new Set(["55", "21", "42", "54"]);          // WI KY PA WV

const STATUS_COLOR = {
  up:       "#00FF66",
  online:   "#00FF66",
  down:     "#FF2A2A",
  offline:  "#FF2A2A",
  degraded: "#FFB014",
  unknown:  "#3A3A48",
};

// Site coordinates (lon, lat) — must match NetworkMap.jsx
const SITES = {
  "Remus":             { coords: [-85.147, 43.742] },
  "Mt. Pleasant":      { coords: [-84.774, 43.603] },
  "Ovid":              { coords: [-84.370, 43.009] },
  "Constantine":       { coords: [-85.667, 41.841] },
  "Novi":              { coords: [-83.476, 42.481] },
  "Canton":            { coords: [-81.378, 40.799] },
  "Canton Warehouse":  { coords: [-81.220, 41.020] },
  "Middlebury":        { coords: [-85.960, 41.630] },
  "Azure":             { coords: [-87.63,  41.88 ] },
};

function normalize(name) {
  return name
    .replace(/\s+plant$/i, "")
    .replace(/\s+wh$/i, " Warehouse")
    .trim();
}

export default function MapEmbed({ sites = [] }) {
  const [links, setLinks] = useState([]);

  useEffect(() => {
    axios.get(`${API}/aruba/mesh`)
      .then(r => setLinks(r.data || []))
      .catch(() => {});
    const iv = setInterval(() => {
      axios.get(`${API}/aruba/mesh`).then(r => setLinks(r.data || [])).catch(() => {});
    }, 300_000); // refresh every 5 min
    return () => clearInterval(iv);
  }, []);

  // Build site → status map from the circuits / sites prop
  const siteStatusMap = {};
  sites.forEach(s => { siteStatusMap[normalize(s.name)] = s.status || "unknown"; });

  return (
    <ComposableMap
      projection="geoMercator"
      projectionConfig={PROJECTION_CONFIG}
      width={1000}
      height={540}
      style={{ width: "100%", height: "100%", background: "transparent" }}
    >
      {/* ── State fills ── */}
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
                  style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }}
                />
              );
            })
        }
      </Geographies>

      {/* ── Animated packet keyframe ── */}
      <defs>
        <style>{`
          @keyframes me-pkt { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -24; } }
        `}</style>
      </defs>

      {/* ── SD-WAN tunnel lines ── */}
      {links.map((link, i) => {
        const src   = SITES[normalize(link.src)]?.coords;
        const dst   = SITES[normalize(link.dst)]?.coords;
        if (!src || !dst) return null;
        const color    = STATUS_COLOR[link.status] || "#3A3A48";
        const duration = 1.6 + (i % 9) * 0.18;
        const delay    = (i % 7) * 0.22;
        return (
          <g key={i}>
            <Line from={src} to={dst} stroke={color} strokeWidth={0.8} opacity={0.25} />
            <Line from={src} to={dst}
              stroke={color} strokeWidth={1.2}
              strokeDasharray="5 19"
              style={{ animation: `me-pkt ${duration}s ${delay}s linear infinite`, opacity: 0.75 }}
            />
          </g>
        );
      })}

      {/* ── Site nodes ── */}
      {Object.entries(SITES).map(([name, { coords }]) => {
        const isCloud   = name === "Azure";
        const siteColor = isCloud
          ? "#00E5FF"
          : STATUS_COLOR[siteStatusMap[name] || "unknown"];

        return (
          <Marker key={name} coordinates={coords}>
            {isCloud ? (
              <g>
                <rect x={-22} y={-11} width={44} height={22}
                  fill="#0B0B0F" stroke="#00E5FF" strokeWidth={1.2} />
                <text y={-2} textAnchor="middle"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 6, fill: "#00E5FF", letterSpacing: "0.1em", fontWeight: 700 }}>
                  AZURE
                </text>
                <text y={7} textAnchor="middle"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 5.5, fill: "#00E5FF", letterSpacing: "0.08em", opacity: 0.7 }}>
                  CHICAGO
                </text>
              </g>
            ) : (
              <g>
                <circle r={5} fill={siteColor} opacity={0.85} />
                <circle r={8} fill="none" stroke={siteColor} strokeWidth={0.5} opacity={0.35} />
                <text
                  y={-10} textAnchor="middle"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 6.5, fill: "#A1A1AA", letterSpacing: "0.05em" }}>
                  {name.toUpperCase()}
                </text>
              </g>
            )}
          </Marker>
        );
      })}
    </ComposableMap>
  );
}
