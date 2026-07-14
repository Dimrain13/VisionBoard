/**
 * MapEmbed — geographic NOC topology map.
 *
 * Animation: CSS Motion Path (offset-path + offset-distance).
 * Dots physically travel src → dst along each mesh link.
 * Pure CSS — no rAF, no SMIL, no stroke-dashoffset.
 * offset-path supported in Chromium 97+ (Pi ships Chromium ≥117).
 * Falls back to static dot at line midpoint if motion path unsupported.
 */
import React from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";

const GEO_URL           = "/us-states-10m.json";
const PROJECTION_CONFIG = { scale: 4500, center: [-84.8, 42.4] };

const PRIMARY_STATES = new Set(["26", "39", "18", "17"]);
const CONTEXT_STATES = new Set(["55", "21", "42", "54"]);

const SITES = {
  "Novi":             { coords: [-83.476, 42.481], hub: true  },
  "Remus":            { coords: [-85.147, 43.742]             },
  "Mt. Pleasant":     { coords: [-84.774, 43.603]             },
  "Ovid":             { coords: [-84.370, 43.009]             },
  "Middlebury":       { coords: [-85.960, 41.630]             },
  "Canton Warehouse": { coords: [-81.560, 40.550]             },
  "Constantine":      { coords: [-85.480, 41.950]             },
  "Canton":           { coords: [-81.350, 40.870]             },
  "Azure":            { coords: [-87.63,  41.88 ], cloud: true},
};

const SITE_KEYS = Object.keys(SITES);
const MESH_PAIRS = [];
for (let i = 0; i < SITE_KEYS.length; i++)
  for (let j = i + 1; j < SITE_KEYS.length; j++)
    MESH_PAIRS.push({ src: SITE_KEYS[i], dst: SITE_KEYS[j], idx: i * SITE_KEYS.length + j });

const W = 1000, H = 540;
function mercY(lat) { return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); }
const _CY = mercY(42.4);
function px(lng, lat) {
  return [
    4500 * ((lng + 84.8) * Math.PI / 180) + W / 2,
    -4500 * (mercY(lat) - _CY) + H / 2,
  ];
}
const SITE_PX = Object.fromEntries(
  Object.entries(SITES).map(([k, v]) => [k, px(...v.coords)])
);

export default function MapEmbed() {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>

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

        {Object.entries(SITES).map(([name, { coords, hub, cloud }]) => {
          if (cloud) return (
            <Marker key={name} coordinates={coords}>
              <g>
                <rect x={-24} y={-13} width={48} height={26} fill="#0B0B12" stroke="#00E5FF" strokeWidth={1.2} rx={2} />
                <text y={-2} textAnchor="middle" style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:6.5, fill:"#00E5FF", letterSpacing:"0.1em", fontWeight:700 }}>AZURE</text>
                <text y={8}  textAnchor="middle" style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:5.5, fill:"#00E5FF", opacity:0.6 }}>CHICAGO</text>
              </g>
            </Marker>
          );
          const nr = hub ? 7 : 5, rr = hub ? 11 : 8;
          return (
            <Marker key={name} coordinates={coords}>
              <g>
                <circle r={nr} fill="#00FF66" opacity={hub ? 1 : 0.88} />
                <circle r={rr} fill="none" stroke="#00FF66" strokeWidth={hub ? 0.8 : 0.5} opacity={0.22} />
                <text y={-(nr + 5)} textAnchor="middle" style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: hub ? 7.5 : 6.5,
                  fill: hub ? "#FAFAFA" : "#D0D0D8",
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

      {/* Overlay SVG — animated dots travel along mesh links */}
      <svg
        viewBox="0 0 1000 540"
        style={{
          position: "absolute", top: 0, left: 0,
          width: "100%", height: "100%",
          pointerEvents: "none", overflow: "visible",
        }}
      >
        <defs>
          <style>{`
            /*
             * CSS Motion Path animation — dots travel along offset-path.
             * offset-distance: 0% = source node, 100% = destination node.
             * Fade in quickly, stay visible for the journey, fade out on arrival.
             */
            @keyframes travel {
              0%   { offset-distance: 0%;   opacity: 0;   }
              6%   { opacity: 1;            }
              88%  { opacity: 1;            }
              100% { offset-distance: 100%; opacity: 0;   }
            }
            .mover {
              animation-name: travel;
              animation-timing-function: linear;
              animation-iteration-count: infinite;
            }
          `}</style>
        </defs>

        {MESH_PAIRS.map(({ src, dst, idx }) => {
          const [x1, y1] = SITE_PX[src];
          const [x2, y2] = SITE_PX[dst];
          const backbone = src === "Novi" || dst === "Novi" || src === "Azure" || dst === "Azure";

          // Backbone (hub/cloud) links: faster, more dots
          // Remote links: slower, fewer dots
          const numDots = backbone ? 3 : 2;
          const dur     = backbone ? 1.8 : 3.5;
          const r       = backbone ? 2.4 : 1.6;

          // Path string in SVG user-unit coordinates
          const pathD = `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`;

          return (
            <g key={`${src}-${dst}`}>
              {/* Faint static guide line */}
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#00FF66"
                strokeWidth={backbone ? 0.7 : 0.35}
                opacity={backbone ? 0.18 : 0.09}
              />

              {/*
               * Moving dots via CSS Motion Path.
               * - offset-path places each dot at the correct SVG coordinates.
               * - Negative animation-delay evenly distributes dots along the
               *   path at page load (already "in transit").
               * - Per-link phase offset (idx * 0.23) staggers different links
               *   so they don't all fire simultaneously.
               * - cx/cy set to line midpoint as a graceful fallback if the
               *   browser doesn't support offset-path.
               */}
              {Array.from({ length: numDots }, (_, i) => {
                const delay = -((i * dur) / numDots) + ((idx * 0.23) % dur);
                return (
                  <circle
                    key={i}
                    className="mover"
                    cx={(x1 + x2) / 2}
                    cy={(y1 + y2) / 2}
                    r={r}
                    fill="#00FF66"
                    style={{
                      offsetPath:        `path('${pathD}')`,
                      animationDuration:  `${dur}s`,
                      animationDelay:     `${delay.toFixed(2)}s`,
                    }}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

    </div>
  );
}
