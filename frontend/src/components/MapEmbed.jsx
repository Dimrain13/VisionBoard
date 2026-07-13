/**
 * MapEmbed — geographic NOC topology map.
 *
 * Animation: pure requestAnimationFrame moving circle cx/cy attributes.
 * No SMIL, no CSS animation, no stroke-dasharray.
 * Works under --disable-gpu (Skia CPU rasterizer + rAF timer fallback).
 */
import React, { useRef, useEffect } from "react";
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

// Mercator projection matching ComposableMap (scale 4500, center [-84.8, 42.4], 1000×540)
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
  const svgRef = useRef(null);

  useEffect(() => {
    let frame;
    const origin = performance.now();

    const tick = (now) => {
      frame = requestAnimationFrame(tick);
      const elapsed = now - origin;

      svgRef.current?.querySelectorAll("circle.pkt").forEach(el => {
        const dur = parseFloat(el.dataset.dur);   // ms
        const off = parseFloat(el.dataset.off);   // ms offset
        const x1  = parseFloat(el.dataset.x1);
        const y1  = parseFloat(el.dataset.y1);
        const x2  = parseFloat(el.dataset.x2);
        const y2  = parseFloat(el.dataset.y2);
        const t   = ((elapsed + off) % dur) / dur;  // 0..1
        el.setAttribute("cx", String(x1 + (x2 - x1) * t));
        el.setAttribute("cy", String(y1 + (y2 - y1) * t));
      });
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>

      {/* ── Map background: state fills + site markers ── */}
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
                <text
                  y={-(nr + 5)}
                  textAnchor="middle"
                  style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: hub ? 7.5 : 6.5,
                    fill: hub ? "#FAFAFA" : "#D0D0D8",
                    letterSpacing: "0.05em",
                    fontWeight: hub ? 700 : 400,
                  }}
                >
                  {name.toUpperCase()}
                </text>
              </g>
            </Marker>
          );
        })}
      </ComposableMap>

      {/* ── Mesh overlay: rAF moves circle cx/cy directly, no CSS/SMIL needed ── */}
      <svg
        ref={svgRef}
        viewBox="0 0 1000 540"
        style={{
          position: "absolute", top: 0, left: 0,
          width: "100%", height: "100%",
          pointerEvents: "none", overflow: "visible",
        }}
      >
        {MESH_PAIRS.map(({ src, dst, idx }) => {
          const [x1, y1] = SITE_PX[src];
          const [x2, y2] = SITE_PX[dst];
          const backbone = src === "Novi" || dst === "Novi" || src === "Azure" || dst === "Azure";
          const durMs  = (backbone ? 2200 : 3400);
          const dur2Ms = Math.round(durMs * 0.82);
          const off1   = Math.round((idx * 310) % durMs);
          const off2   = Math.round((idx * 310 + durMs / 2) % dur2Ms);

          return (
            <g key={`${src}-${dst}`}>
              {/* Static guide line */}
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#00FF66"
                strokeWidth={backbone ? 0.8 : 0.4}
                opacity={backbone ? 0.25 : 0.12}
              />

              {/* Primary packet — rAF moves this via cx/cy */}
              <circle
                className="pkt"
                data-x1={x1} data-y1={y1} data-x2={x2} data-y2={y2}
                data-dur={durMs} data-off={off1}
                cx={x1} cy={y1}
                r={backbone ? 2.5 : 1.8}
                fill="#00FF66"
                opacity={backbone ? 0.95 : 0.6}
              />

              {/* Second packet on backbone links */}
              {backbone && (
                <circle
                  className="pkt"
                  data-x1={x1} data-y1={y1} data-x2={x2} data-y2={y2}
                  data-dur={dur2Ms} data-off={off2}
                  cx={x1} cy={y1}
                  r={1.8}
                  fill="#00FF66"
                  opacity={0.5}
                />
              )}
            </g>
          );
        })}
      </svg>

    </div>
  );
}
