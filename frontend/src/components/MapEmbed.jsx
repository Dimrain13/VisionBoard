/**
 * MapEmbed — geographic NOC topology map for the Dashboard.
 * Draws DIA circuit lines (hub-and-spoke from Novi) colored by live circuit status.
 * Overlays Aruba SD-WAN tunnel links when available.
 */
import React, { useState, useEffect } from "react";
import { ComposableMap, Geographies, Geography, Marker, Line } from "react-simple-maps";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const PROJECTION_CONFIG = { scale: 4500, center: [-84.8, 42.4] };

const PRIMARY_STATES = new Set(["26", "39", "18", "17"]);   // MI OH IN IL
const CONTEXT_STATES = new Set(["55", "21", "42", "54"]);   // WI KY PA WV

const STATUS_COLOR = {
  up:       "#00FF66",
  online:   "#00FF66",
  down:     "#FF2A2A",
  offline:  "#FF2A2A",
  degraded: "#FFB014",
  unknown:  "#3A3A48",
};

// Site definitions — lon/lat. Novi is the WAN hub (HQ).
const SITES = {
  "Novi":              { coords: [-83.476, 42.481], hub: true  },
  "Remus":             { coords: [-85.147, 43.742]             },
  "Mt. Pleasant":      { coords: [-84.774, 43.603]             },
  "Ovid":              { coords: [-84.370, 43.009]             },
  "Constantine":       { coords: [-85.667, 41.841]             },
  "Canton":            { coords: [-81.378, 40.799]             },
  "Canton Warehouse":  { coords: [-81.220, 41.020]             },
  "Middlebury":        { coords: [-85.960, 41.630]             },
  "Azure":             { coords: [-87.63,  41.88 ], cloud: true},
};

function normalize(name) {
  return (name || "")
    .replace(/\s+plant$/i, "")
    .replace(/\s+whs?$/i, " Warehouse")
    .trim();
}

export default function MapEmbed({ sites = [] }) {
  const [circuits, setCircuits] = useState([]);
  const [meshLinks, setMeshLinks] = useState([]);

  const fetchData = () => {
    axios.get(`${API}/circuits`).then(r => {
      setCircuits(Array.isArray(r.data) ? r.data : []);
    }).catch(() => {});
    axios.get(`${API}/aruba/mesh`).then(r => {
      setMeshLinks(Array.isArray(r.data) ? r.data : []);
    }).catch(() => {});
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 60_000);
    return () => clearInterval(iv);
  }, []);

  // Build circuit status map: site name → worst circuit status
  const circuitStatusMap = {};
  circuits.forEach(c => {
    const key = normalize(c.site);
    const priority = { down: 0, degraded: 1, unknown: 2, up: 3 };
    const existing = circuitStatusMap[key];
    if (existing === undefined || priority[c.status] < priority[existing]) {
      circuitStatusMap[key] = c.status || "unknown";
    }
  });

  // Build site-level status map from the /api/sites prop (for node color)
  const siteStatusMap = {};
  sites.forEach(s => { siteStatusMap[normalize(s.name)] = s.status || "unknown"; });

  // Hub-and-spoke DIA circuit lines from Novi to each spoke site
  const hubCoords = SITES["Novi"].coords;
  const circuitLines = Object.entries(SITES)
    .filter(([name, s]) => !s.hub && !s.cloud)
    .map(([name, { coords }]) => {
      const status = circuitStatusMap[name] || siteStatusMap[name] || "unknown";
      return { name, coords, status };
    });

  // Aruba SD-WAN overlay links (shown on top when available)
  const arubaLines = meshLinks.map((link, i) => {
    const src = SITES[normalize(link.src)]?.coords;
    const dst = SITES[normalize(link.dst)]?.coords;
    if (!src || !dst) return null;
    return { src, dst, status: link.status, i };
  }).filter(Boolean);

  return (
    <ComposableMap
      projection="geoMercator"
      projectionConfig={PROJECTION_CONFIG}
      width={1000}
      height={540}
      style={{ width: "100%", height: "100%", background: "transparent" }}
    >
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

      {/* ── Animation keyframes ── */}
      <defs>
        <style>{`
          @keyframes pkt-flow  { from { stroke-dashoffset:  0; } to { stroke-dashoffset: -24; } }
          @keyframes pkt-warn  { from { stroke-dashoffset:  0; } to { stroke-dashoffset: -16; } }
          @keyframes line-pulse{ 0%,100%{ opacity:0.55 } 50%{ opacity:0.95 } }
        `}</style>
      </defs>

      {/* ── DIA circuit lines (hub-and-spoke: Novi → each site) ── */}
      {circuitLines.map(({ name, coords, status }, i) => {
        const color    = STATUS_COLOR[status] || STATUS_COLOR.unknown;
        const isUp     = status === "up";
        const isDown   = status === "down";
        const isDeg    = status === "degraded";
        const duration = 1.5 + (i % 8) * 0.2;
        const delay    = (i % 6) * 0.25;

        return (
          <g key={`dia-${name}`}>
            {/* Base glow trace */}
            <Line
              from={hubCoords} to={coords}
              stroke={color} strokeWidth={isDown ? 1.5 : 0.7}
              opacity={isDown ? 0.35 : 0.18}
            />
            {isUp && (
              /* Flowing green packet animation */
              <Line
                from={hubCoords} to={coords}
                stroke={color} strokeWidth={1.4}
                strokeDasharray="5 19"
                style={{
                  animation: `pkt-flow ${duration}s ${delay}s linear infinite`,
                  opacity: 0.8,
                }}
              />
            )}
            {isDeg && (
              /* Amber slow-pulse dashed line */
              <Line
                from={hubCoords} to={coords}
                stroke={color} strokeWidth={1.2}
                strokeDasharray="4 10"
                style={{
                  animation: `pkt-warn ${duration * 1.4}s ${delay}s linear infinite`,
                  opacity: 0.7,
                }}
              />
            )}
            {isDown && (
              /* Red static pulsing line */
              <Line
                from={hubCoords} to={coords}
                stroke={color} strokeWidth={1.6}
                style={{ animation: `line-pulse 1.8s ${delay}s ease-in-out infinite`, opacity: 0.7 }}
              />
            )}
          </g>
        );
      })}

      {/* ── Aruba SD-WAN overlay (shown in addition when available) ── */}
      {arubaLines.map(({ src, dst, status, i }) => {
        const color    = STATUS_COLOR[status] || "#3A3A48";
        const duration = 1.3 + (i % 9) * 0.15;
        const delay    = (i % 7) * 0.2;
        return (
          <g key={`mesh-${i}`}>
            <Line from={src} to={dst} stroke={color} strokeWidth={0.6} opacity={0.2} />
            <Line from={src} to={dst}
              stroke={color} strokeWidth={1.0}
              strokeDasharray="3 15"
              style={{ animation: `pkt-flow ${duration}s ${delay}s linear infinite`, opacity: 0.55 }}
            />
          </g>
        );
      })}

      {/* ── Site nodes ── */}
      {Object.entries(SITES).map(([name, { coords, hub, cloud }]) => {
        if (cloud) {
          return (
            <Marker key={name} coordinates={coords}>
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
            </Marker>
          );
        }

        const siteName  = normalize(name);
        const status    = hub ? "up" : (circuitStatusMap[siteName] || siteStatusMap[siteName] || "unknown");
        const color     = STATUS_COLOR[status] || STATUS_COLOR.unknown;
        const nodeR     = hub ? 7 : 5;
        const ringR     = hub ? 11 : 8;

        return (
          <Marker key={name} coordinates={coords}>
            <g>
              {/* Outer ping ring for non-up states */}
              {status !== "up" && status !== "unknown" && (
                <circle r={ringR + 2} fill="none" stroke={color} strokeWidth={0.8}
                  style={{ animation: "line-pulse 2s ease-in-out infinite" }} opacity={0.4} />
              )}
              <circle r={nodeR} fill={color} opacity={hub ? 1 : 0.85} />
              <circle r={ringR} fill="none" stroke={color} strokeWidth={hub ? 0.8 : 0.5} opacity={0.3} />
              <text
                y={-(nodeR + 5)} textAnchor="middle"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: hub ? 7.5 : 6.5,
                  fill: hub ? "#FAFAFA" : "#A1A1AA",
                  letterSpacing: "0.05em",
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
