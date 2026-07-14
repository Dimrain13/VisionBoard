/**
 * MapEmbed — geographic NOC topology map.
 *
 * Animation strategy: Canvas 2D overlay at 20 fps.
 * WHY CANVAS, not CSS/SVG animation:
 *   - offset-path: doesn't work on Pi --disable-gpu (dots appear at wrong positions)
 *   - CSS opacity on static circles: only blinks, no movement
 *   - rAF + SVG attribute updates: black-screens Pi (DOM re-layout on every element)
 *   - Canvas 2D: just writes pixels — no DOM updates, no style/layout triggers.
 *     Pi 4 CPU handles 90 ctx.arc() calls at 20fps with ease.
 *
 * The canvas layer is sized to the parent container. Dot positions are computed
 * in SVG user-unit space (viewBox 0 0 1000 540) then scaled to canvas pixels.
 */
import React, { useRef, useEffect } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";

const GEO_URL           = "/us-states-10m.json";
const PROJECTION_CONFIG = { scale: 4500, center: [-84.8, 42.4] };
const PRIMARY_STATES    = new Set(["26", "39", "18", "17"]);
const CONTEXT_STATES    = new Set(["55", "21", "42", "54"]);

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

const VW = 1000, VH = 540;
function mercY(lat) { return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)); }
const _CY = mercY(42.4);
function svgPx(lng, lat) {
  return [
    4500 * ((lng + 84.8) * Math.PI / 180) + VW / 2,
    -4500 * (mercY(lat) - _CY) + VH / 2,
  ];
}
const SITE_PX = Object.fromEntries(
  Object.entries(SITES).map(([k, v]) => [k, svgPx(...v.coords)])
);

// Build dot descriptors once at module load — constant for the lifetime of the app.
const DOT_DEFS = MESH_PAIRS.flatMap(({ src, dst, idx }) => {
  const [x1, y1] = SITE_PX[src];
  const [x2, y2] = SITE_PX[dst];
  const backbone = src === "Novi" || dst === "Novi" || src === "Azure" || dst === "Azure";
  const numDots  = backbone ? 3 : 2;
  const speed    = backbone ? 0.50 : 0.25;  // link traversals per second
  const r        = backbone ? 2.4 : 1.6;    // dot radius in SVG user units

  return Array.from({ length: numDots }, (_, i) => ({
    x1, y1, x2, y2, speed, r,
    // Stagger starting positions so dots are evenly spaced at page load
    progress: ((i / numDots) + (idx * 0.11)) % 1,
  }));
});

export default function MapEmbed() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Match canvas pixel dimensions to its CSS display size
    const syncSize = () => {
      const p = canvas.parentElement;
      if (!p) return;
      canvas.width  = p.clientWidth;
      canvas.height = p.clientHeight;
    };
    syncSize();
    window.addEventListener("resize", syncSize);

    const ctx  = canvas.getContext("2d");
    // Mutable progress state — one float per dot, mutated each frame
    const prog = DOT_DEFS.map(d => d.progress);

    let animId = null;
    let lastTs = null;
    const TARGET_FPS = 20;
    const FRAME_MS   = 1000 / TARGET_FPS;
    let   accumulated = 0;

    const tick = (ts) => {
      animId = requestAnimationFrame(tick);

      if (lastTs === null) { lastTs = ts; return; }
      accumulated += Math.min(ts - lastTs, 50); // clamp: tab hidden / large gap
      lastTs = ts;

      if (accumulated < FRAME_MS) return; // wait until next frame interval

      const dt = accumulated / 1000; // seconds elapsed this batch
      accumulated = 0;

      const cW = canvas.width;
      const cH = canvas.height;
      if (!cW || !cH) return;

      // Scale: SVG user units (0–1000 × 0–540) → canvas pixels
      const sx = cW / VW;
      const sy = cH / VH;

      ctx.clearRect(0, 0, cW, cH);

      for (let i = 0; i < DOT_DEFS.length; i++) {
        const d = DOT_DEFS[i];

        // Advance progress
        prog[i] += d.speed * dt;
        if (prog[i] >= 1) prog[i] -= 1;

        const t = prog[i];

        // Lerp position along the link (in SVG user units, then scale to canvas)
        const cx = (d.x1 + (d.x2 - d.x1) * t) * sx;
        const cy = (d.y1 + (d.y2 - d.y1) * t) * sy;

        // Fade in 0→8% of journey, fully opaque 8→88%, fade out 88→100%
        const alpha = t < 0.08 ? t / 0.08
                    : t > 0.88 ? (1 - t) / 0.12
                    : 1.0;

        ctx.globalAlpha = alpha;
        ctx.fillStyle   = "#00FF66";
        ctx.beginPath();
        ctx.arc(cx, cy, d.r * Math.min(sx, sy), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    };

    animId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", syncSize);
    };
  }, []); // mount once — DOT_DEFS is module-level constant

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>

      {/* Base map */}
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

      {/* Static mesh guide lines — zero animation cost */}
      <svg
        viewBox="0 0 1000 540"
        style={{
          position: "absolute", top: 0, left: 0,
          width: "100%", height: "100%",
          pointerEvents: "none",
        }}
      >
        {MESH_PAIRS.map(({ src, dst }) => {
          const [x1, y1] = SITE_PX[src];
          const [x2, y2] = SITE_PX[dst];
          const backbone = src === "Novi" || dst === "Novi" || src === "Azure" || dst === "Azure";
          return (
            <line
              key={`${src}-${dst}`}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#00FF66"
              strokeWidth={backbone ? 0.7 : 0.35}
              opacity={backbone ? 0.18 : 0.09}
            />
          );
        })}
      </svg>

      {/* Canvas overlay — dots drawn at exact line positions, 20 fps, no DOM updates */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute", top: 0, left: 0,
          width: "100%", height: "100%",
          pointerEvents: "none",
        }}
      />

    </div>
  );
}
