/**
 * WUGDevices — Per-site device scatter view.
 *
 * Each location gets a card with ALL devices shown as concentric-ring dots.
 * Scales from 3 to 100+ devices per site. Connection lines drawn for all
 * parent→child relationships (faint, with offline devices highlighted red).
 *
 * Pi-safe: Static SVG + CSS opacity animations only.
 */
import React, { useState, useEffect } from "react";
import axios from "axios";
import { RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_COLOR = {
  up:      "#00FF66",
  down:    "#FF2A2A",
  warning: "#FFB014",
  unknown: "#505068",
};

const TYPE_CHIP = {
  firewall:     "#FF6B35",
  gateway:      "#A78BFA",
  switch:       "#00FF66",
  poe_switch:   "#00DD55",
  access_point: "#00E5FF",
  camera:       "#FFB014",
  device:       "#2A2A3A",
};

// ── Demo data ─────────────────────────────────────────────────────────────────
// Builds a realistic device list for a site (deterministic, no Math.random)
function genDevices(prefix, n, downIdxs = []) {
  const devices = [];
  const rootId  = `${prefix}-gw`;
  devices.push({ id: rootId, name: "USG-Pro", type: "gateway", status: "up", parent_id: null });

  const numCores = Math.min(4, Math.max(1, Math.floor(n / 18)));
  const coreIds  = [];
  for (let i = 0; i < numCores; i++) {
    const id = `${prefix}-sw${i}`;
    coreIds.push(id);
    devices.push({ id, name: `Core-SW${i + 1}`, type: i % 2 ? "poe_switch" : "switch",
      status: "up", parent_id: rootId });
  }

  const rest = n - 1 - numCores;
  for (let i = 0; i < rest; i++) {
    const mod = i % 6;
    const type = mod === 0 ? "access_point" : mod === 3 ? "camera" : "device";
    const name = type === "access_point" ? `AP-${String(i).padStart(2, "0")}`
               : type === "camera"       ? `Cam-${i}`
               : `Host-${i + 1}`;
    devices.push({
      id: `${prefix}-d${i}`, name, type,
      status: downIdxs.includes(i) ? "down" : "up",
      parent_id: coreIds[i % coreIds.length],
    });
  }
  return devices;
}

const MOCK = {
  locations: [
    { id: "novi",        name: "Novi HQ",      devices: genDevices("novi",   42, []) },
    { id: "remus",       name: "Remus",         devices: genDevices("remus",  28, [4, 11]) },
    { id: "mt-pleasant", name: "Mt. Pleasant",  devices: genDevices("mp",     31, []) },
    { id: "canton",      name: "Canton",        devices: genDevices("canton", 68, [7, 14, 31, 45]) },
    { id: "canton-whs",  name: "Canton WHS",    devices: genDevices("cwhs",   35, []) },
    { id: "constantine", name: "Constantine",   devices: genDevices("const",  22, []) },
    { id: "ovid",        name: "Ovid",          devices: genDevices("ovid",   18, []) },
    { id: "middlebury",  name: "Middlebury",    devices: genDevices("mb",     25, [2]) },
  ],
};

// ── Layout helpers ─────────────────────────────────────────────────────────────

const RING_BASE = 32;   // radius of innermost ring (ring 1 — root sits at center)
const RING_STEP = 24;   // additional radius per ring
const MIN_GAP   = 20;   // min arc-distance between adjacent device dots

function ringR(idx)   { return RING_BASE + idx * RING_STEP; }
function ringCap(idx) { return Math.max(6, Math.floor(2 * Math.PI * ringR(idx) / MIN_GAP)); }

/**
 * Place devices in concentric rings centered at (cx, cy).
 * Root device (no parent_id) is placed at the center.
 * All others fill rings 1, 2, 3… ordered by: offline first, then online.
 */
function layoutDevices(devices, cx, cy) {
  if (!devices?.length) return [];

  const roots   = devices.filter(d => !d.parent_id);
  const offline = devices.filter(d => d.parent_id && d.status === "down");
  const warning = devices.filter(d => d.parent_id && d.status === "warning");
  const online  = devices.filter(d => d.parent_id && !["down", "warning"].includes(d.status));

  const result = [];

  // Root at center
  if (roots.length === 1) {
    result.push({ ...roots[0], x: cx, y: cy });
  } else {
    roots.forEach((r, i) => {
      const a = (2 * Math.PI * i / roots.length) - Math.PI / 2;
      result.push({ ...r, x: cx + 16 * Math.cos(a), y: cy + 16 * Math.sin(a) });
    });
  }

  // Non-root devices in concentric rings
  const queue = [...offline, ...warning, ...online];
  let ring = 1, pos = 0, cap = ringCap(1);
  for (const dev of queue) {
    if (pos >= cap) { ring++; pos = 0; cap = ringCap(ring); }
    const r = ringR(ring);
    const a = (2 * Math.PI * pos / cap) - Math.PI / 2;
    result.push({ ...dev, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    pos++;
  }

  return result;
}

// ── SiteCard ──────────────────────────────────────────────────────────────────

const SVGW = 460, SVGH = 340;
const CX = SVGW / 2, CY = SVGH / 2 + 8;
const DEV_R = 6;   // standard device dot radius
const ROOT_R = 9;  // root (gateway/firewall) dot radius

function SiteCard({ loc }) {
  const nodes    = layoutDevices(loc.devices, CX, CY);
  const byId     = {};
  nodes.forEach(n => (byId[n.id] = n));

  const total    = loc.devices.length;
  const downCnt  = loc.devices.filter(d => d.status === "down").length;
  const warnCnt  = loc.devices.filter(d => d.status === "warning").length;
  const hasIssue = downCnt > 0;
  const hasWarn  = warnCnt > 0;
  const bc       = hasIssue ? "#FF2A2A" : hasWarn ? "#FFB014" : "#00FF66";

  return (
    <div data-testid={`wug-card-${loc.id}`} style={{
      background: "#06060F",
      border: `1px solid ${hasIssue ? "#FF2A2A33" : "#0C0C1A"}`,
      borderRadius: 3,
      display: "flex", flexDirection: "column",
      overflow: "hidden", flex: 1, minWidth: 0,
      boxShadow: hasIssue ? "0 0 12px #FF2A2A18" : "none",
    }}>
      {/* Card header */}
      <div style={{ padding: "6px 10px", borderBottom: `1px solid ${hasIssue ? "#FF2A2A22" : "#0C0C1A"}`,
        display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700,
          color: hasIssue ? "#FF8080" : "#B0B0C8", letterSpacing: "0.14em" }}>
          {loc.name.toUpperCase()}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: "#2A2A3A",
            letterSpacing: "0.06em" }}>
            {total}
          </span>
          {downCnt > 0 && (
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: "#FF4444",
              background: "#180808", padding: "1px 5px", border: "1px solid #FF2A2A44",
              letterSpacing: "0.06em" }}>
              {downCnt} DN
            </span>
          )}
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: bc,
            boxShadow: `0 0 6px ${bc}88`,
            flexShrink: 0,
          }} />
        </div>
      </div>

      {/* SVG scatter plot */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <svg viewBox={`0 0 ${SVGW} ${SVGH}`}
          style={{ width: "100%", height: "100%", display: "block" }}>

          <defs>
            <style>{`
              @keyframes wugdot-pulse {
                0%, 100% { opacity: 0.15; }
                50%       { opacity: 0.9; }
              }
            `}</style>
          </defs>

          {/* Background */}
          <rect width={SVGW} height={SVGH} fill="#040410" />

          {/* Faint concentric ring guides */}
          {[1, 2, 3, 4, 5, 6].map(i => (
            <circle key={i} cx={CX} cy={CY} r={ringR(i)}
              fill="none" stroke="#0C1428" strokeWidth="0.6" strokeDasharray="2 4" />
          ))}

          {/* Connection lines: parent → child */}
          {nodes.map(dev => {
            if (!dev.parent_id) return null;
            const par = byId[dev.parent_id];
            if (!par) return null;
            const isDown = dev.status === "down";
            const isWarn = dev.status === "warning";
            return (
              <line key={`ln-${dev.id}`}
                x1={par.x} y1={par.y} x2={dev.x} y2={dev.y}
                stroke={isDown ? "#FF3030" : isWarn ? "#FFB01480" : "#0E2A50"}
                strokeWidth={isDown ? 0.9 : 0.55}
                opacity={isDown ? 0.7 : 0.85}
              />
            );
          })}

          {/* Device dots */}
          {nodes.map(dev => {
            const isRoot  = !dev.parent_id;
            const isDown  = dev.status === "down";
            const isWarn  = dev.status === "warning";
            const sc      = STATUS_COLOR[dev.status] || STATUS_COLOR.unknown;
            const tc      = TYPE_CHIP[dev.type] || TYPE_CHIP.device;
            const dotC    = isRoot ? tc : sc;
            const r       = isRoot ? ROOT_R : DEV_R;

            return (
              <g key={`dot-${dev.id}`} data-testid={`wug-dev-${dev.id}`}>
                {/* Outer glow */}
                <circle cx={dev.x} cy={dev.y} r={r + 4}
                  fill="none" stroke={dotC} strokeWidth="0.5"
                  opacity={isDown ? 0.4 : isRoot ? 0.18 : 0.06} />
                {/* Offline pulse ring */}
                {isDown && (
                  <circle cx={dev.x} cy={dev.y} r={r + 3}
                    fill="none" stroke="#FF2A2A" strokeWidth="0.9"
                    style={{ animation: "wugdot-pulse 1.6s ease-in-out infinite" }}
                  />
                )}
                {/* Main dot */}
                <circle cx={dev.x} cy={dev.y} r={r}
                  fill={isDown ? "#3D0808" : isRoot ? "#1A0D2E" : isDown ? "#3D0808" : "#004422"}
                  stroke={dotC} strokeWidth={isRoot ? 1.5 : isDown ? 1.2 : 0.9}
                />
                {/* Root type label */}
                {isRoot && (
                  <text x={dev.x} y={dev.y + 3.5}
                    fontSize="5.5" fontFamily="'JetBrains Mono',monospace"
                    fill={tc} textAnchor="middle" fontWeight={700}>
                    {dev.type === "firewall" ? "FW"
                     : dev.type === "gateway" ? "GW"
                     : dev.type.startsWith("switch") || dev.type === "poe_switch" ? "SW"
                     : "??"}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
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

  const totalDevices = data.locations.reduce((s, l) => s + l.devices.length, 0);
  const totalDown    = data.locations.reduce((s, l) =>
    s + l.devices.filter(d => d.status === "down").length, 0);
  const anyIssue = totalDown > 0;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <h1 data-testid="wug-header" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13,
            fontWeight: 700, color: "#E2E2E5", letterSpacing: "0.18em" }}>
            WUG NETWORK TOPOLOGY
          </h1>
          {isMock && !wugError && (
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5, color: "#FFB014",
              background: "#1A1200", border: "1px solid #FFB01430", padding: "2px 7px", letterSpacing: "0.1em" }}>
              DEMO DATA — WUG API NOT CONNECTED
            </span>
          )}
          {wugError && (
            <span data-testid="wug-error-banner" style={{ fontFamily: "'JetBrains Mono',monospace",
              fontSize: 7.5, color: "#FF4444", background: "#180808",
              border: "1px solid #FF2A2A33", padding: "2px 7px", letterSpacing: "0.1em" }}>
              WUG ERROR: {wugError.slice(0, 80)}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {[
            ["SITES",   data.locations.length,   "#3A3A50"],
            ["DEVICES", totalDevices,              "#C4C4D8"],
            ["DOWN",    totalDown, totalDown > 0 ? "#FF4444" : "#3A3A50"],
          ].map(([label, val, color]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 700,
                color, lineHeight: 1 }}>{val}</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                color: "#28283A", letterSpacing: "0.1em", marginTop: 2 }}>{label}</div>
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
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
              color: "#28283A", letterSpacing: "0.06em" }}>
              {lastFetch.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* ── Status banner ── */}
      {anyIssue ? (
        <div data-testid="wug-alert-banner" style={{ flexShrink: 0, padding: "6px 14px",
          background: "#140808", border: "1px solid #FF2A2A33",
          display: "flex", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={12} color="#FF4444" />
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
            color: "#FF6060", letterSpacing: "0.1em" }}>
            {totalDown} DEVICE{totalDown !== 1 ? "S" : ""} DOWN — CHECK AFFECTED LOCATIONS
          </span>
        </div>
      ) : (
        <div data-testid="wug-status-ok" style={{ flexShrink: 0, padding: "6px 14px",
          background: "#080F08", border: "1px solid #00FF6622",
          display: "flex", alignItems: "center", gap: 10 }}>
          <CheckCircle2 size={12} color="#00FF66" />
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
            color: "#00CC44", letterSpacing: "0.1em" }}>
            ALL {totalDevices} DEVICES OPERATIONAL ACROSS {data.locations.length} SITES
          </span>
        </div>
      )}

      {/* ── 4×2 site card grid ── */}
      <div style={{ flex: 1, minHeight: 0, display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gridTemplateRows: "repeat(2, 1fr)",
        gap: 8 }}>
        {data.locations.map(loc => (
          <SiteCard key={loc.id} loc={loc} />
        ))}
      </div>

    </div>
  );
}
