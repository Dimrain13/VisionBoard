/**
 * WUGDevices — Radial hub-and-spoke NOC topology.
 *
 * Layout:
 *   ┌──────────────────────────────────────────┐
 *   │  Header: title + KPIs + refresh          │
 *   │  Status banner                           │
 *   │  ┌────────── Radial SVG ──────────────┐  │
 *   │  │  Central WUG POLLER node (cyan)    │  │
 *   │  │  Spokes to each location           │  │
 *   │  │  Canvas overlay: traveling dots    │  │
 *   │  └────────────────────────────────────┘  │
 *   │  Device roster (scrollable compact table)│
 *   └──────────────────────────────────────────┘
 *
 * Animation (Pi-safe):
 *   - Sonar rings on central node: CSS opacity keyframe (Pi-confirmed)
 *   - Traveling data dots: Canvas 2D rAF at 15fps (Pi-confirmed)
 *   - Offline node pulse: CSS opacity keyframe
 */
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── SVG coordinate space ─────────────────────────────────────────────────────
const VW = 1000, VH = 500;   // viewBox dimensions
const CX  = 500, CY  = 230;  // WUG poller center
const R   = 185;              // spoke radius (center → location node center)
const NW  = 138, NH = 52;    // location node dimensions

const TYPE_COLOR = {
  gateway:      "#A78BFA",
  switch:       "#00FF66",
  poe_switch:   "#00FF66",
  access_point: "#00E5FF",
  camera:       "#FFB014",
  device:       "#3A3A48",
};

// ── Embedded mock data ────────────────────────────────────────────────────────
const MOCK = {
  locations: [
    { id: "novi",         name: "Novi HQ",
      devices: [
        { id:"n-gw", name:"UDM-Pro",       type:"gateway",     status:"up"   },
        { id:"n-s1", name:"USW-48-Pro",    type:"switch",      status:"up"   },
        { id:"n-s2", name:"USW-24-POE",    type:"switch",      status:"up"   },
        { id:"n-a1", name:"U6-Pro Lobby",  type:"access_point",status:"up"   },
        { id:"n-a2", name:"U6-Pro Office", type:"access_point",status:"up"   },
        { id:"n-a3", name:"U6-LR Whs",     type:"access_point",status:"up"   },
      ] },
    { id: "remus",        name: "Remus",
      devices: [
        { id:"r-gw", name:"USG-Pro",   type:"gateway",     status:"up"   },
        { id:"r-s1", name:"USW-24",    type:"switch",      status:"up"   },
        { id:"r-a1", name:"U6-Lite A", type:"access_point",status:"down" },
        { id:"r-a2", name:"U6-Lite B", type:"access_point",status:"up"   },
      ] },
    { id: "mt-pleasant",  name: "Mt. Pleasant",
      devices: [
        { id:"m-gw", name:"USG",          type:"gateway",     status:"up" },
        { id:"m-s1", name:"USW-16",       type:"switch",      status:"up" },
        { id:"m-a1", name:"U6-Pro Flr 1", type:"access_point",status:"up" },
        { id:"m-a2", name:"U6-Pro Flr 2", type:"access_point",status:"up" },
      ] },
    { id: "ovid",         name: "Ovid",
      devices: [
        { id:"o-gw", name:"USG",      type:"gateway",     status:"up" },
        { id:"o-s1", name:"USW-8",    type:"switch",      status:"up" },
        { id:"o-a1", name:"U6-Lite",  type:"access_point",status:"up" },
      ] },
    { id: "middlebury",   name: "Middlebury",
      devices: [
        { id:"mb-gw", name:"USG-Pro",    type:"gateway",     status:"up" },
        { id:"mb-s1", name:"USW-16-POE", type:"poe_switch",  status:"up" },
        { id:"mb-a1", name:"U6-LR",      type:"access_point",status:"up" },
      ] },
    { id: "canton",       name: "Canton",
      devices: [
        { id:"k-gw", name:"USG-Pro",        type:"gateway",     status:"up" },
        { id:"k-s1", name:"USW-24-POE",     type:"poe_switch",  status:"up" },
        { id:"k-a1", name:"U6-Pro Office",  type:"access_point",status:"up" },
        { id:"k-a2", name:"U6-Lite Flr 2",  type:"access_point",status:"up" },
      ] },
    { id: "constantine",  name: "Constantine",
      devices: [
        { id:"c-gw", name:"USG",     type:"gateway",     status:"up" },
        { id:"c-s1", name:"USW-8",   type:"switch",      status:"up" },
        { id:"c-a1", name:"U6-Lite", type:"access_point",status:"up" },
      ] },
    { id: "canton-whs",   name: "Canton Whs",
      devices: [
        { id:"cw-gw", name:"USG",     type:"gateway",     status:"up" },
        { id:"cw-s1", name:"USW-8",   type:"switch",      status:"up" },
        { id:"cw-a1", name:"U6-Nano", type:"access_point",status:"up" },
      ] },
  ],
};

// ── Position each location node around the central hub ────────────────────────
function computeLayout(locations) {
  const N = locations.length;
  return locations.map((loc, i) => {
    const angle = (2 * Math.PI * i / N) - Math.PI / 2;
    return {
      ...loc,
      angle,
      x: CX + R * Math.cos(angle),  // center of node
      y: CY + R * Math.sin(angle),
      nx: CX + R * Math.cos(angle) - NW / 2,  // top-left of node rect
      ny: CY + R * Math.sin(angle) - NH / 2,
    };
  });
}

// Build canvas dot definitions for spoke animation
function buildSpokeDots(locs) {
  return locs.flatMap((loc, i) => {
    const hasIssue = loc.devices.some(d => d.status === "down");
    const numDots  = 3;
    const speed    = 0.20;
    return Array.from({ length: numDots }, (_, j) => ({
      x1: CX, y1: CY,
      x2: loc.x, y2: loc.y,
      speed, hasIssue,
      progress: (j / numDots + i * 0.13) % 1,
    }));
  });
}

// ── Radial topology with canvas overlay ──────────────────────────────────────
function RadialTopology({ locs }) {
  const canvasRef = useRef(null);
  const dotDefs   = useRef([]);

  // Recompute dot definitions whenever layout changes
  useEffect(() => {
    dotDefs.current = buildSpokeDots(locs).map(d => ({ ...d }));
  }, [locs]);

  // Canvas animation: 15fps, same coordinate transform as SVG viewBox
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const syncSize = () => {
      const p = canvas.parentElement;
      if (p) { canvas.width = p.clientWidth; canvas.height = p.clientHeight; }
    };
    syncSize();
    window.addEventListener("resize", syncSize);

    const ctx  = canvas.getContext("2d");
    let animId = null, lastTs = null, acc = 0;
    const FRAME = 1000 / 15;

    const tick = (ts) => {
      animId = requestAnimationFrame(tick);
      if (!lastTs) { lastTs = ts; return; }
      acc += Math.min(ts - lastTs, 50); lastTs = ts;
      if (acc < FRAME) return;
      const dt = acc / 1000; acc = 0;

      const cW = canvas.width, cH = canvas.height;
      if (!cW || !cH) return;

      // Same preserveAspectRatio="xMidYMid meet" transform as SVG
      const scale   = Math.min(cW / VW, cH / VH);
      const offsetX = (cW - VW * scale) / 2;
      const offsetY = (cH - VH * scale) / 2;

      ctx.clearRect(0, 0, cW, cH);

      for (const d of dotDefs.current) {
        d.progress += d.speed * dt;
        if (d.progress >= 1) d.progress -= 1;

        const t   = d.progress;
        const svgX = d.x1 + (d.x2 - d.x1) * t;
        const svgY = d.y1 + (d.y2 - d.y1) * t;
        const cx  = svgX * scale + offsetX;
        const cy  = svgY * scale + offsetY;

        const alpha = t < 0.08 ? t / 0.08 : t > 0.88 ? (1 - t) / 0.12 : 1;
        ctx.globalAlpha = alpha;
        ctx.fillStyle   = d.hasIssue ? "#FF4444" : "#00FF66";
        ctx.beginPath();
        ctx.arc(cx, cy, 3 * scale, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    animId = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", syncSize); };
  }, []);  // mounts once; dotDefs ref updates without re-running

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
      {/* ── Static SVG topology ── */}
      <svg
        data-testid="wug-radial-svg"
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <defs>
          <style>{`
            @keyframes wug-sonar {
              0%   { opacity: 0.55; }
              100% { opacity: 0;    }
            }
            @keyframes wug-offline-pulse {
              0%, 100% { opacity: 0.2; }
              50%       { opacity: 0.8; }
            }
            @keyframes wug-center-breathe {
              0%, 100% { opacity: 0.85; }
              50%       { opacity: 1;   }
            }
          `}</style>
          {/* Dot-grid background */}
          <pattern id="wug-dotgrid" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill="#0D0D1E" />
          </pattern>
        </defs>

        {/* Background dot grid */}
        <rect x="0" y="0" width={VW} height={VH} fill="url(#wug-dotgrid)" />

        {/* ── Spokes: center → each location ── */}
        {locs.map(loc => {
          const hasIssue = loc.devices.some(d => d.status === "down");
          const color    = hasIssue ? "#FF2A2A" : "#00FF66";
          return (
            <line key={`spoke-${loc.id}`}
              x1={CX} y1={CY} x2={loc.x} y2={loc.y}
              stroke={color}
              strokeWidth={hasIssue ? 0.9 : 0.6}
              opacity={hasIssue ? 0.4 : 0.18}
            />
          );
        })}

        {/* ── WUG Poller: sonar rings ── */}
        {[1.6, 2.3, 3.1].map((factor, i) => (
          <circle key={`ring-${i}`}
            cx={CX} cy={CY} r={36 * factor}
            fill="none" stroke="#00E5FF" strokeWidth="0.8"
            style={{
              animation: "wug-sonar 2.6s ease-out infinite",
              animationDelay: `${i * 0.85}s`,
              opacity: 0,
            }}
          />
        ))}

        {/* ── WUG Poller: outer glow ring ── */}
        <circle cx={CX} cy={CY} r={42} fill="none" stroke="#00E5FF" strokeWidth="1" opacity="0.15" />

        {/* ── WUG Poller: main hexagon-ish shape (octagon using rect+clip) ── */}
        <rect x={CX - 30} y={CY - 30} width={60} height={60} rx="6"
          fill="#060614" stroke="#00E5FF" strokeWidth="1.5"
          style={{ animation: "wug-center-breathe 3s ease-in-out infinite" }} />
        {/* Inner accent */}
        <rect x={CX - 22} y={CY - 22} width={44} height={44} rx="4"
          fill="none" stroke="#00E5FF" strokeWidth="0.5" opacity="0.35" />
        {/* WUG label */}
        <text x={CX} y={CY - 6} fontSize="9" fontFamily="'JetBrains Mono',monospace"
          fill="#00E5FF" textAnchor="middle" fontWeight={700} letterSpacing="0.15em">
          WUG
        </text>
        <text x={CX} y={CY + 7} fontSize="6" fontFamily="'JetBrains Mono',monospace"
          fill="#00E5FF" textAnchor="middle" letterSpacing="0.12em" opacity="0.65">
          POLLER
        </text>
        {/* Center dot */}
        <circle cx={CX} cy={CY} r="3.5" fill="#00E5FF" opacity="0.9"
          data-testid="node-wug-poller" />

        {/* ── Location nodes ── */}
        {locs.map(loc => {
          const hasIssue  = loc.devices.some(d => d.status === "down");
          const downCount = loc.devices.filter(d => d.status === "down").length;
          const upCount   = loc.devices.filter(d => d.status !== "down").length;
          const total     = loc.devices.length;
          const bc        = hasIssue ? "#FF2A2A" : "#00FF66";
          const textC     = hasIssue ? "#FF8080" : "#C4C4D8";

          return (
            <g key={`node-${loc.id}`} data-testid={`wug-node-${loc.id}`}>
              {/* Offline pulse ring */}
              {hasIssue && (
                <rect
                  x={loc.nx - 5} y={loc.ny - 5}
                  width={NW + 10} height={NH + 10} rx="5"
                  fill="none" stroke="#FF2A2A" strokeWidth="1.5"
                  style={{ animation: "wug-offline-pulse 1.6s ease-in-out infinite" }}
                />
              )}

              {/* Node background */}
              <rect x={loc.nx} y={loc.ny} width={NW} height={NH} rx="3"
                fill="#070710"
                stroke={bc} strokeWidth={hasIssue ? 1.2 : 0.7} />

              {/* Left accent bar */}
              <rect x={loc.nx} y={loc.ny} width="3" height={NH} rx="1"
                fill={bc} opacity={hasIssue ? 0.7 : 0.85} />

              {/* Site name */}
              <text x={loc.nx + 11} y={loc.ny + 17}
                fontSize="9" fontFamily="'JetBrains Mono',monospace"
                fill={textC} fontWeight={700} letterSpacing="0.12em">
                {loc.name.toUpperCase()}
              </text>

              {/* Up/down count */}
              <text x={loc.nx + 11} y={loc.ny + 31}
                fontSize="7.5" fontFamily="'JetBrains Mono',monospace"
                fill={hasIssue ? "#FF4444" : "#286040"} letterSpacing="0.06em">
                {upCount}/{total} UP
                {downCount > 0 ? ` · ${downCount} DOWN` : ""}
              </text>

              {/* Device type mini-dots */}
              {loc.devices.slice(0, 8).map((dev, di) => (
                <circle key={dev.id}
                  cx={loc.nx + NW - 14 - di * 10} cy={loc.ny + 15}
                  r="3.2"
                  fill={dev.status === "down" ? "#FF2A2A" : (TYPE_COLOR[dev.type] || "#3A3A48")}
                  opacity={dev.status === "down" ? 0.9 : 0.55}
                />
              ))}

              {/* Status corner dot */}
              <circle cx={loc.nx + NW - 8} cy={loc.ny + NH - 10} r="4"
                fill={bc} opacity={hasIssue ? 1 : 0.7}
                style={hasIssue ? { animation: "wug-offline-pulse 1.6s ease-in-out infinite" } : {}} />
            </g>
          );
        })}
      </svg>

      {/* ── Canvas overlay: traveling data dots ── */}
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WUGDevices() {
  const [data,      setData]      = useState(MOCK);
  const [loading,   setLoading]   = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [isMock,    setIsMock]    = useState(true);
  const [wugError,  setWugError]  = useState(null);

  const fetchTopology = () => {
    setLoading(true);
    axios.get(`${API}/wug/topology`, { timeout: 30000 })
      .then(r => {
        if (r.data?.locations?.length) {
          setData(r.data); setIsMock(false); setWugError(null);
        } else if (r.data?.source === "error") {
          setWugError(r.data.message || "WUG API error");
        }
      })
      .catch(e => setWugError(e.message))
      .finally(() => { setLoading(false); setLastFetch(new Date()); });
  };

  useEffect(() => {
    fetchTopology();
    const iv = setInterval(fetchTopology, 60_000);
    return () => clearInterval(iv);
  }, []);

  const locs         = computeLayout(data.locations);
  const totalDevices = data.locations.reduce((s, l) => s + l.devices.length, 0);
  const totalDown    = data.locations.reduce((s, l) => s + l.devices.filter(d => d.status === "down").length, 0);
  const anyIssue     = totalDown > 0;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <h1 style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700,
            color: "#E2E2E5", letterSpacing: "0.18em" }}>
            WUG NETWORK TOPOLOGY
          </h1>
          {isMock && !wugError && (
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5, color: "#FFB014",
              background: "#1A1200", border: "1px solid #FFB01430", padding: "2px 7px", letterSpacing: "0.1em" }}>
              DEMO DATA — WUG API NOT CONNECTED
            </span>
          )}
          {wugError && (
            <span data-testid="wug-error-banner" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5,
              color: "#FF4444", background: "#180808", border: "1px solid #FF2A2A33", padding: "2px 7px", letterSpacing: "0.1em" }}>
              WUG ERROR: {wugError.slice(0, 80)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {[
            ["SITES",   data.locations.length, "#3A3A50"],
            ["DEVICES", totalDevices,           "#C4C4D8"],
            ["DOWN",    totalDown,               totalDown > 0 ? "#FF4444" : "#3A3A50"],
          ].map(([label, val, color]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: "#28283A", letterSpacing: "0.1em", marginTop: 2 }}>{label}</div>
            </div>
          ))}
          <button data-testid="wug-refresh-btn" onClick={fetchTopology}
            style={{ background: "transparent", border: "1px solid #1C1C2A", color: "#3A3A50",
              cursor: "pointer", padding: "5px 10px", display: "flex", alignItems: "center", gap: 6,
              fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: "0.1em" }}>
            <RefreshCw size={10} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            REFRESH
          </button>
          {lastFetch && (
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: "#28283A", letterSpacing: "0.06em" }}>
              {lastFetch.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* ── Status banner ── */}
      {anyIssue ? (
        <div data-testid="wug-alert-banner" style={{ flexShrink: 0, padding: "6px 14px", background: "#140808",
          border: "1px solid #FF2A2A33", display: "flex", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={12} color="#FF4444" />
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#FF6060", letterSpacing: "0.1em" }}>
            {totalDown} DEVICE{totalDown !== 1 ? "S" : ""} DOWN — CHECK AFFECTED LOCATIONS
          </span>
        </div>
      ) : (
        <div data-testid="wug-status-ok" style={{ flexShrink: 0, padding: "6px 14px", background: "#080F08",
          border: "1px solid #00FF6622", display: "flex", alignItems: "center", gap: 10 }}>
          <CheckCircle2 size={12} color="#00FF66" />
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#00CC44", letterSpacing: "0.1em" }}>
            ALL {totalDevices} DEVICES OPERATIONAL ACROSS {data.locations.length} SITES
          </span>
        </div>
      )}

      {/* ── Radial topology (main area, flex:1) ── */}
      <RadialTopology locs={locs} />

      {/* ── Device roster ── */}
      <div style={{ flexShrink: 0, height: 160, background: "#07070F",
        border: "1px solid #10101C", borderTop: "2px solid #1C2830",
        display: "flex", flexDirection: "column", overflow: "hidden" }}>

        <div style={{ padding: "6px 16px", borderBottom: "1px solid #0E0E1A",
          display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, fontWeight: 700,
            color: "#505068", letterSpacing: "0.18em" }}>
            DEVICE ROSTER
          </span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: "#28283A", letterSpacing: "0.06em" }}>
            {totalDevices} DEVICES · POLLING EVERY 60S
          </span>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "4px 12px 8px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {data.locations.flatMap(loc =>
              loc.devices.map(dev => {
                const down = dev.status === "down";
                const tc   = TYPE_COLOR[dev.type] || "#3A3A48";
                return (
                  <div key={dev.id} data-testid={`wug-roster-${dev.id}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 7,
                      padding: "4px 10px 4px 0", paddingLeft: 7,
                      borderLeft: `2px solid ${down ? "#FF2A2A" : tc}`,
                      background: down ? "#0E0606" : "#0A0A13",
                      minWidth: 190, flex: "1 1 190px",
                    }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                      background: down ? "#FF2A2A" : tc, boxShadow: `0 0 4px ${down ? "#FF2A2A" : tc}` }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5,
                        color: down ? "#FF7070" : "#B0B0C8", letterSpacing: "0.04em",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {dev.name}
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 6,
                        color: "#28283A", letterSpacing: "0.04em" }}>
                        {loc.name} · {dev.ip || dev.type}
                      </div>
                    </div>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 5.5,
                      color: down ? "#FF4444" : "#28283A", letterSpacing: "0.08em", flexShrink: 0 }}>
                      {down ? "DOWN" : "UP"}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
