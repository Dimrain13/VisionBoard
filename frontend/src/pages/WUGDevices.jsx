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

const RING_BASE = 30;   // radius of innermost ring
const RING_STEP = 24;   // additional radius per ring
const MIN_GAP   = 18;   // min arc-gap between adjacent dots

function ringR(idx)   { return RING_BASE + idx * RING_STEP; }
function ringCap(idx) { return Math.max(6, Math.floor(2 * Math.PI * ringR(idx) / MIN_GAP)); }

/**
 * Returns { nodes, viewR }.
 * All positions in CENTERED coordinates — root at (0,0).
 * ViewR is computed tightly from the outermost ring actually used.
 */
function buildLayout(devices) {
  if (!devices?.length) return { nodes: [], viewR: 40 };

  const root   = { ...devices[0], x: 0, y: 0 };
  const others = devices.slice(1);

  // Sort: offline first so they appear in inner rings and stay visible
  others.sort((a, b) => {
    const rank = d => (d.status === "down" ? 0 : d.status === "warning" ? 1 : 2);
    return rank(a) - rank(b);
  });

  const nodes = [root];
  let ring = 1, qi = 0;
  while (qi < others.length) {
    const cap   = ringCap(ring);
    const r     = ringR(ring);
    const count = Math.min(cap, others.length - qi);
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      nodes.push({
        ...others[qi++],
        x: r * Math.cos(angle),
        y: r * Math.sin(angle),
      });
    }
    ring++;
    if (ring > 12) break;
  }

  const viewR = ringR(ring - 1) + 14; // 14px padding outside outermost ring
  return { nodes, viewR };
}

// ── SiteCard ──────────────────────────────────────────────────────────────────

const DEV_R  = 5.5;  // device dot radius
const ROOT_R = 9;    // root node radius

function SiteCard({ loc }) {
  const { nodes, viewR } = buildLayout(loc.devices);

  const total    = loc.devices.length;
  const downCnt  = loc.devices.filter(d => d.status === "down").length;
  const warnCnt  = loc.devices.filter(d => d.status === "warning").length;
  const hasIssue = downCnt > 0;
  const hasWarn  = warnCnt > 0;
  const bc       = hasIssue ? "#FF2A2A" : hasWarn ? "#FFB014" : "#00FF66";

  const root = nodes[0];

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
            background: bc, boxShadow: `0 0 6px ${bc}88`, flexShrink: 0,
          }} />
        </div>
      </div>

      {/* SVG — centered coordinate system, viewBox sized to actual content */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 4 }}>
        <svg
          viewBox={`${-viewR} ${-viewR} ${viewR * 2} ${viewR * 2}`}
          style={{ width: "100%", height: "100%", display: "block" }}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Ring guides */}
          {[1, 2, 3, 4, 5, 6, 7].map(i => (
            <circle key={i} cx={0} cy={0} r={ringR(i)}
              fill="none" stroke="#0C1428" strokeWidth="0.5" strokeDasharray="2 5" />
          ))}

          {/* Spoke lines: center → every non-root device */}
          {nodes.slice(1).map(dev => {
            const isDown = dev.status === "down";
            const isWarn = dev.status === "warning";
            return (
              <line key={`ln-${dev.id}`}
                x1={0} y1={0} x2={dev.x} y2={dev.y}
                stroke={isDown ? "#FF3030" : isWarn ? "#FFB014" : "#0E2A50"}
                strokeWidth={isDown ? 0.8 : 0.5}
                opacity={isDown ? 0.70 : 0.85}
              />
            );
          })}

          {/* Device dots */}
          {nodes.slice(1).map(dev => {
            const isDown = dev.status === "down";
            const isWarn = dev.status === "warning";
            const col    = isDown ? "#FF2A2A" : isWarn ? "#FFB014" : STATUS_COLOR[dev.status] || "#00FF66";
            return (
              <circle key={dev.id}
                cx={dev.x} cy={dev.y} r={DEV_R}
                fill={col}
                opacity={isDown ? 0.95 : 0.80}
              />
            );
          })}

          {/* Root node */}
          {root && (
            <g>
              <circle cx={0} cy={0} r={ROOT_R}
                fill="#0D0D20" stroke="#8060E0" strokeWidth={1.5} />
              <text x={0} y={3.5} fontSize="5" textAnchor="middle"
                fill="#8060E0" fontFamily="'JetBrains Mono',monospace">
                GW
              </text>
            </g>
          )}
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
