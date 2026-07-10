/**
 * MapEmbed — static geographic NOC topology map for the Dashboard.
 * No API calls, no intervals. Renders once from local bundled geo JSON.
 * All mesh lines are permanently green (traffic-flow animation).
 * Circuit status is shown separately in the DIA Circuit Status Engine.
 */
import React from "react";
import { ComposableMap, Geographies, Geography, Marker, Line } from "react-simple-maps";

const GEO_URL = "/us-states-10m.json";
const PROJECTION_CONFIG = { scale: 4500, center: [-84.8, 42.4] };

const PRIMARY_STATES = new Set(["26", "39", "18", "17"]);  // MI OH IN IL
const CONTEXT_STATES = new Set(["55", "21", "42", "54"]);  // WI KY PA WV

const SITES = {
  "Novi":             { coords: [-83.476, 42.481], hub: true  },
  "Remus":            { coords: [-85.147, 43.742]             },
  "Mt. Pleasant":     { coords: [-84.774, 43.603]             },
  "Ovid":             { coords: [-84.370, 43.009]             },
  "Middlebury":       { coords: [-85.960, 41.630]             },
  "Canton Warehouse": { coords: [-81.580, 40.530]             },
  "Constantine":      { coords: [-85.480, 41.950]             },
  "Canton":           { coords: [-81.220, 40.980]             },
  "Azure":            { coords: [-87.63,  41.88 ], cloud: true},
};

// Full mesh: every site ↔ every other site
const SITE_KEYS = Object.keys(SITES);
const MESH_PAIRS = [];
for (let i = 0; i < SITE_KEYS.length; i++)
  for (let j = i + 1; j < SITE_KEYS.length; j++)
    MESH_PAIRS.push({ src: SITE_KEYS[i], dst: SITE_KEYS[j], idx: i * SITE_KEYS.length + j });

export default function MapEmbed() {
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
          @keyframes traffic-flow { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -24; } }
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

      {/* Full mesh with flowing traffic animation — static green */}
      {MESH_PAIRS.map(({ src, dst, idx }) => {
        const srcC = SITES[src]?.coords;
        const dstC = SITES[dst]?.coords;
        if (!srcC || !dstC) return null;

        const backbone = src === "Novi" || dst === "Novi" || src === "Azure" || dst === "Azure";
        const baseW    = backbone ? 0.65 : 0.30;
        const flowW    = backbone ? 1.0  : 0.55;
        const opFlow   = backbone ? 0.65 : 0.35;
        const dur      = backbone ? 2.2  : 3.0;
        const delay    = `-${((idx * 0.18) % dur).toFixed(2)}s`;

        return (
          <g key={`m-${src}-${dst}`}>
            <Line from={srcC} to={dstC}
              stroke="#00FF66" strokeWidth={baseW} opacity={0.07} />
            <Line from={srcC} to={dstC}
              stroke="#00FF66" strokeWidth={flowW}
              strokeDasharray="4 20"
              style={{ animation: `traffic-flow ${dur}s linear ${delay} infinite`, opacity: opFlow }}
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
        const nr = hub ? 7 : 5;
        const rr = hub ? 11 : 8;
        return (
          <Marker key={name} coordinates={coords}>
            <g>
              <circle r={nr} fill="#00FF66" opacity={hub ? 1 : 0.88} />
              <circle r={rr} fill="none" stroke="#00FF66" strokeWidth={hub ? 0.8 : 0.5} opacity={0.22} />
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
