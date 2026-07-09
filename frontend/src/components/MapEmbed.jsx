/**
 * MapEmbed — geographic NOC topology map for the Dashboard.
 * Lines show DIA circuit (WAN) status ONLY: Novi hub → each remote site.
 *   Green flowing  = WAN UP
 *   Amber dashed   = WAN DEGRADED
 *   Red pulsing    = WAN DOWN
 */
import React, { useState, useEffect } from "react";
import { ComposableMap, Geographies, Geography, Marker, Line } from "react-simple-maps";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const PROJECTION_CONFIG = { scale: 4500, center: [-84.8, 42.4] };

const PRIMARY_STATES = new Set(["26", "39", "18", "17"]);  // MI OH IN IL
const CONTEXT_STATES = new Set(["55", "21", "42", "54"]);  // WI KY PA WV

const STATUS_COLOR = {
  up:       "#00FF66",
  down:     "#FF2A2A",
  degraded: "#FFB014",
  unknown:  "#3A3A48",
};

// Site lon/lat. Novi is the WAN hub (HQ). Azure = Chicago egress.
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

// Static SD-WAN mesh: regional site-to-site tunnels shown when Aruba data unavailable.
// Lines go red if either endpoint's WAN circuit is down.
const MESH_LINKS = [
  { src: "Remus",        dst: "Mt. Pleasant"    },
  { src: "Mt. Pleasant", dst: "Ovid"            },
  { src: "Remus",        dst: "Novi"            },
  { src: "Constantine",  dst: "Middlebury"      },
  { src: "Constantine",  dst: "Novi"            },
  { src: "Canton",       dst: "Canton Warehouse"},
  { src: "Canton",       dst: "Novi"            },
  { src: "Middlebury",   dst: "Novi"            },
];

function normalize(name) {
  return (name || "").replace(/\s+plant$/i, "").trim();
}

export default function MapEmbed({ sites = [] }) {
  const [circuits, setCircuits] = useState([]);

  const fetch = () => {
    axios.get(`${API}/circuits`)
      .then(r => setCircuits(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  };

  useEffect(() => { fetch(); const iv = setInterval(fetch, 60_000); return () => clearInterval(iv); }, []);

  // Build: site name → worst circuit status
  const circuitStatus = {};
  circuits.forEach(c => {
    const key = normalize(c.site);
    const ord = { down: 0, degraded: 1, unknown: 2, up: 3 };
    if (circuitStatus[key] === undefined || ord[c.status] < ord[circuitStatus[key]]) {
      circuitStatus[key] = c.status || "unknown";
    }
  });

  // Fallback from /api/sites prop
  const siteStatus = {};
  sites.forEach(s => { siteStatus[normalize(s.name)] = s.status || "unknown"; });

  const hubCoords   = SITES["Novi"].coords;
  const azureCoords = SITES["Azure"].coords;

  const wanLines = Object.entries(SITES)
    .filter(([, s]) => !s.hub && !s.cloud)
    .map(([name, { coords }], i) => ({
      name, coords, i,
      status: circuitStatus[name] || siteStatus[name] || "unknown",
    }));

  // Worst overall circuit status drives the Novi → Azure line colour
  const overallDown = wanLines.some(l => l.status === "down");
  const overallDeg  = !overallDown && wanLines.some(l => l.status === "degraded");
  const cloudStatus = overallDown ? "down" : overallDeg ? "degraded" : "up";

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
          @keyframes pkt-up   { from{stroke-dashoffset:0} to{stroke-dashoffset:-24} }
          @keyframes pkt-deg  { from{stroke-dashoffset:0} to{stroke-dashoffset:-16} }
          @keyframes wan-down { 0%,100%{opacity:.45} 50%{opacity:.9} }
        `}</style>
      </defs>

      <Geographies geography={GEO_URL}>
        {({ geographies }) =>
          geographies
            .filter(g => PRIMARY_STATES.has(g.id) || CONTEXT_STATES.has(g.id))
            .map(geo => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill={PRIMARY_STATES.has(geo.id) ? "#0A1A0A" : "#13131F"}
                stroke={PRIMARY_STATES.has(geo.id) ? "#1A3A1A" : "#2C2C40"}
                strokeWidth={PRIMARY_STATES.has(geo.id) ? 1.2 : 0.8}
                style={{ default:{outline:"none"}, hover:{outline:"none"}, pressed:{outline:"none"} }}
              />
            ))
        }
      </Geographies>

      {/* Mesh links: site-to-site SD-WAN tunnels (thinner, behind hub lines) */}
      {MESH_LINKS.map(({ src, dst }, i) => {
        const srcCoords = SITES[src]?.coords;
        const dstCoords = SITES[dst]?.coords;
        if (!srcCoords || !dstCoords) return null;
        const srcDown = circuitStatus[src] === "down" || siteStatus[src] === "offline";
        const dstDown = circuitStatus[dst] === "down" || siteStatus[dst] === "offline";
        const isDown  = srcDown || dstDown;
        const color   = isDown ? "#FF2A2A" : "#00FF66";
        const dur     = 2.2 + (i % 6) * 0.25;
        const del     = (i % 8) * 0.3;
        return (
          <g key={`mesh-${src}-${dst}`}>
            <Line from={srcCoords} to={dstCoords}
              stroke={color} strokeWidth={isDown ? 1.2 : 0.5}
              opacity={isDown ? 0.22 : 0.10} />
            {!isDown && (
              <Line from={srcCoords} to={dstCoords}
                stroke={color} strokeWidth={0.9} strokeDasharray="3 22"
                style={{ animation:`pkt-up ${dur}s ${del}s linear infinite`, opacity:.55 }} />
            )}
            {isDown && (
              <Line from={srcCoords} to={dstCoords}
                stroke={color} strokeWidth={1.4}
                style={{ animation:`wan-down 2.2s ${del}s ease-in-out infinite`, opacity:.55 }} />
            )}
          </g>
        );
      })}

      {/* WAN lines: Novi → each site — green unless WAN is DOWN */}
      {wanLines.map(({ name, coords, status, i }) => {
        const isDown = status === "down";
        const color  = isDown ? "#FF2A2A" : "#00FF66";
        const dur    = 1.5 + (i % 8) * 0.18;
        const del    = (i % 6) * 0.22;
        return (
          <g key={`wan-${name}`}>
            <Line from={hubCoords} to={coords}
              stroke={color} strokeWidth={isDown ? 1.6 : 0.7}
              opacity={isDown ? 0.28 : 0.13} />
            {!isDown && (
              <Line from={hubCoords} to={coords}
                stroke={color} strokeWidth={1.4} strokeDasharray="5 19"
                style={{ animation:`pkt-up ${dur}s ${del}s linear infinite`, opacity:.82 }} />
            )}
            {isDown && (
              <Line from={hubCoords} to={coords}
                stroke={color} strokeWidth={1.8}
                style={{ animation:`wan-down 1.8s ${del}s ease-in-out infinite`, opacity:.72 }} />
            )}
          </g>
        );
      })}

      {/* Novi → Azure cloud line — green unless all WANs are down */}
      {(() => {
        const isDown = cloudStatus === "down";
        const color  = isDown ? "#FF2A2A" : "#00FF66";
        return (
          <g key="wan-azure">
            <Line from={hubCoords} to={azureCoords} stroke={color}
              strokeWidth={isDown ? 1.8 : 0.8} opacity={isDown ? 0.28 : 0.13} strokeDasharray="2 6" />
            {!isDown && <Line from={hubCoords} to={azureCoords} stroke={color} strokeWidth={1.2}
              strokeDasharray="5 22" style={{ animation:"pkt-up 2.2s 0s linear infinite", opacity:.65 }} />}
            {isDown  && <Line from={hubCoords} to={azureCoords} stroke={color} strokeWidth={1.8}
              style={{ animation:"wan-down 1.8s 0s ease-in-out infinite", opacity:.65 }} />}
          </g>
        );
      })()}

      {/* Site nodes */}
      {Object.entries(SITES).map(([name, { coords, hub, cloud }]) => {
        if (cloud) {
          return (
            <Marker key={name} coordinates={coords}>
              <g>
                <rect x={-24} y={-13} width={48} height={26}
                  fill="#0B0B12" stroke="#00E5FF" strokeWidth={1.2} rx={2} />
                <text y={-2} textAnchor="middle" style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 6.5,
                  fill: "#00E5FF", letterSpacing: "0.1em", fontWeight: 700,
                }}>AZURE</text>
                <text y={8} textAnchor="middle" style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 5.5,
                  fill: "#00E5FF", letterSpacing: "0.08em", opacity: 0.6,
                }}>CHICAGO</text>
              </g>
            </Marker>
          );
        }
        const key    = normalize(name);
        const status = hub ? "up" : (circuitStatus[key] || siteStatus[key] || "unknown");
        const color  = STATUS_COLOR[status] || STATUS_COLOR.unknown;
        const nr     = hub ? 7 : 5;
        const rr     = hub ? 11 : 8;

        return (
          <Marker key={name} coordinates={coords}>
            <g>
              {!hub && status !== "up" && status !== "unknown" && (
                <circle r={rr + 3} fill="none" stroke={color} strokeWidth={0.7}
                  opacity={0.32} style={{ animation:"wan-down 2s ease-in-out infinite" }} />
              )}
              <circle r={nr} fill={color} opacity={hub ? 1 : 0.88} />
              <circle r={rr} fill="none" stroke={color} strokeWidth={hub ? 0.8 : 0.5} opacity={0.22} />
              <text y={-(nr + 5)} textAnchor="middle" style={{
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
