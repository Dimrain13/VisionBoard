/**
 * MapEmbed — SVG state outlines + Canvas dot animation overlay.
 *
 * Canvas 2D is the only animation path that works reliably under
 * Chromium --disable-gpu (software renderer). SVG stroke-dashoffset
 * animations — both CSS and JS-driven — are silently skipped on Pi ARM.
 */
import React, { useRef, useEffect } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";

const GEO_URL            = "/us-states-10m.json";
const PROJECTION_CONFIG  = { scale: 4500, center: [-84.8, 42.4] };
const MAP_W = 1000, MAP_H = 540;

const PRIMARY_STATES = new Set(["26", "39", "18", "17"]);
const CONTEXT_STATES = new Set(["55", "21", "42", "54"]);

// ── Mercator projection (identical params to ComposableMap) ────────────────
function mercY(lat) {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}
const _CY = mercY(42.4);
function project(lng, lat) {
  return [
    4500 * ((lng - (-84.8)) * Math.PI / 180) + MAP_W / 2,
    -4500 * (mercY(lat) - _CY) + MAP_H / 2,
  ];
}

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

// Pre-project all site positions once (1000×540 coordinate space)
const SITE_PX = Object.fromEntries(
  Object.entries(SITES).map(([k, v]) => [k, project(...v.coords)])
);

// Full mesh
const SITE_NAMES = Object.keys(SITES);
const PAIRS = SITE_NAMES.flatMap((a, i) =>
  SITE_NAMES.slice(i + 1).map(b => [a, b])
);

export default function MapEmbed() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    let frame, offset = 0, last = 0;
    const FPS      = 12;
    const INTERVAL = 1000 / FPS;
    const DOT_R    = 2.5;   // dot radius (in SVG coords)
    const DOT_GAP  = 22;    // spacing between dots — matches "4 20" dasharray
    const SPEED    = 2;     // pixels per frame

    function drawFrame(now) {
      if (now - last < INTERVAL) { frame = requestAnimationFrame(drawFrame); return; }
      last = now;
      offset = (offset + SPEED) % DOT_GAP;

      // Canvas is styled 100%×100% but its pixel buffer matches MAP_W×MAP_H
      ctx.clearRect(0, 0, MAP_W, MAP_H);

      PAIRS.forEach(([src, dst], idx) => {
        const [ax, ay] = SITE_PX[src];
        const [bx, by] = SITE_PX[dst];
        const dx = bx - ax, dy = by - ay;
        const len = Math.hypot(dx, dy);
        if (len < 1) return;

        const isBackbone = src === "Novi" || dst === "Novi" ||
                           src === "Azure" || dst === "Azure";
        const color    = isBackbone ? "rgba(0,255,102,0.65)" : "rgba(0,255,102,0.35)";
        const dimColor = isBackbone ? "rgba(0,255,102,0.07)" : "rgba(0,255,102,0.04)";
        const r        = isBackbone ? DOT_R : DOT_R * 0.75;

        // Dim base line
        ctx.beginPath();
        ctx.strokeStyle = dimColor;
        ctx.lineWidth   = isBackbone ? 0.6 : 0.3;
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();

        // Moving dots
        const ux = dx / len, uy = dy / len;
        let t = (offset + idx * 3) % DOT_GAP;
        ctx.fillStyle = color;
        while (t < len) {
          ctx.beginPath();
          ctx.arc(ax + ux * t, ay + uy * t, r, 0, Math.PI * 2);
          ctx.fill();
          t += DOT_GAP;
        }
      });

      frame = requestAnimationFrame(drawFrame);
    }

    frame = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>

      {/* SVG layer — state fills + site nodes, no animated mesh lines */}
      <ComposableMap
        projection="geoMercator"
        projectionConfig={PROJECTION_CONFIG}
        width={MAP_W}
        height={MAP_H}
        style={{ width: "100%", height: "100%", background: "transparent" }}
      >
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

        {/* Site nodes */}
        {Object.entries(SITES).map(([name, { coords, hub, cloud }]) => {
          if (cloud) {
            return (
              <Marker key={name} coordinates={coords}>
                <g>
                  <rect x={-24} y={-13} width={48} height={26}
                    fill="#0B0B12" stroke="#00E5FF" strokeWidth={1.2} rx={2} />
                  <text y={-2} textAnchor="middle" style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:6.5, fill:"#00E5FF", letterSpacing:"0.1em", fontWeight:700 }}>AZURE</text>
                  <text y={8}  textAnchor="middle" style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:5.5, fill:"#00E5FF", letterSpacing:"0.08em", opacity:.6 }}>CHICAGO</text>
                </g>
              </Marker>
            );
          }
          const nr = hub ? 7 : 5, rr = hub ? 11 : 8;
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

      {/* Canvas layer — animated dots drawn in 2D API (works under --disable-gpu) */}
      <canvas
        ref={canvasRef}
        width={MAP_W}
        height={MAP_H}
        style={{
          position: "absolute",
          top: 0, left: 0,
          width: "100%", height: "100%",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
