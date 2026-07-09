/**
 * WUG Network Topology
 * Circuit-board style hierarchical topology diagrams per location.
 * Fetches from /api/wug/topology — falls back to embedded mock data
 * until the real WUG API is wired up.
 */
import React, { useState, useEffect } from "react";
import axios from "axios";
import { Network, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ─── Device type styling ───────────────────────────────────────────────────────
const TYPE = {
  gateway:     { label: "GATEWAY",  color: "#00E5FF", abbr: "GW"  },
  switch_core: { label: "CORE SW",  color: "#00FF66", abbr: "CSW" },
  switch:      { label: "SWITCH",   color: "#4A8CFF", abbr: "SW"  },
  ap:          { label: "AP",       color: "#FFB014", abbr: "AP"  },
};

// ─── Embedded mock topology (used while WUG API isn't connected) ───────────────
const MOCK = {
  locations: [
    {
      id: "novi", name: "Novi HQ",
      devices: [
        { id: "n-gw",  name: "UDM-Pro",      type: "gateway",     parent_id: null,   ip: "10.202.1.1",  status: "up" },
        { id: "n-cs",  name: "USW-48-Pro",   type: "switch_core", parent_id: "n-gw", ip: "10.202.1.2",  status: "up" },
        { id: "n-s1",  name: "USW-24-POE",   type: "switch",      parent_id: "n-cs", ip: "10.202.1.10", status: "up" },
        { id: "n-s2",  name: "USW-16-POE",   type: "switch",      parent_id: "n-cs", ip: "10.202.1.11", status: "up" },
        { id: "n-a1",  name: "U6-Pro Lobby", type: "ap",          parent_id: "n-s1", ip: "10.202.1.50", status: "up" },
        { id: "n-a2",  name: "U6-Pro Office",type: "ap",          parent_id: "n-s1", ip: "10.202.1.51", status: "up" },
        { id: "n-a3",  name: "U6-LR Whse",   type: "ap",          parent_id: "n-s2", ip: "10.202.1.52", status: "up" },
        { id: "n-s3",  name: "USW-8 Srv",    type: "switch",      parent_id: "n-s2", ip: "10.202.1.20", status: "up" },
      ],
    },
    {
      id: "remus", name: "Remus",
      devices: [
        { id: "r-gw",  name: "USG-Pro",      type: "gateway",     parent_id: null,   ip: "10.202.2.1",  status: "up" },
        { id: "r-cs",  name: "USW-24",       type: "switch_core", parent_id: "r-gw", ip: "10.202.2.2",  status: "up" },
        { id: "r-a1",  name: "U6-Lite A",    type: "ap",          parent_id: "r-cs", ip: "10.202.2.50", status: "up" },
        { id: "r-a2",  name: "U6-Lite B",    type: "ap",          parent_id: "r-cs", ip: "10.202.2.51", status: "up" },
        { id: "r-s1",  name: "USW-8-POE",    type: "switch",      parent_id: "r-cs", ip: "10.202.2.10", status: "up" },
      ],
    },
    {
      id: "mt-pleasant", name: "Mt. Pleasant",
      devices: [
        { id: "m-gw",  name: "USG-Pro",      type: "gateway",     parent_id: null,   ip: "10.202.3.1",  status: "up" },
        { id: "m-cs",  name: "USW-16",       type: "switch_core", parent_id: "m-gw", ip: "10.202.3.2",  status: "up" },
        { id: "m-a1",  name: "U6-Pro Flr 1", type: "ap",          parent_id: "m-cs", ip: "10.202.3.50", status: "up" },
        { id: "m-a2",  name: "U6-Pro Flr 2", type: "ap",          parent_id: "m-cs", ip: "10.202.3.51", status: "up" },
        { id: "m-s1",  name: "USW-8",        type: "switch",      parent_id: "m-cs", ip: "10.202.3.10", status: "up" },
      ],
    },
    {
      id: "constantine", name: "Constantine",
      devices: [
        { id: "c-gw",  name: "USG",          type: "gateway",     parent_id: null,   ip: "10.202.4.1",  status: "up" },
        { id: "c-cs",  name: "USW-8",        type: "switch_core", parent_id: "c-gw", ip: "10.202.4.2",  status: "up" },
        { id: "c-a1",  name: "U6-Lite",      type: "ap",          parent_id: "c-cs", ip: "10.202.4.50", status: "up" },
        { id: "c-s1",  name: "USW-8-POE",    type: "switch",      parent_id: "c-cs", ip: "10.202.4.10", status: "up" },
      ],
    },
    {
      id: "canton", name: "Canton",
      devices: [
        { id: "k-gw",  name: "USG-Pro",      type: "gateway",     parent_id: null,   ip: "10.202.5.1",  status: "up" },
        { id: "k-cs",  name: "USW-24-POE",   type: "switch_core", parent_id: "k-gw", ip: "10.202.5.2",  status: "up" },
        { id: "k-s1",  name: "USW-8-POE",    type: "switch",      parent_id: "k-cs", ip: "10.202.5.10", status: "up" },
        { id: "k-a1",  name: "U6-Pro Office",type: "ap",          parent_id: "k-cs", ip: "10.202.5.50", status: "up" },
        { id: "k-a2",  name: "U6-Lite Flr 2",type: "ap",          parent_id: "k-s1", ip: "10.202.5.51", status: "up" },
      ],
    },
  ],
};

// ─── Tree layout ───────────────────────────────────────────────────────────────
const NW = 122;  // node width
const NH = 34;   // node height
const LH = 72;   // level (depth) height
const CG = 12;   // column gap between sibling nodes

function buildLayout(devices) {
  if (!devices?.length) return { nodes: [], svgW: NW, svgH: NH + 16 };

  const m = {};
  devices.forEach(d => (m[d.id] = { ...d, children: [] }));

  let root = null;
  devices.forEach(d => {
    if (d.parent_id && m[d.parent_id]) m[d.parent_id].children.push(m[d.id]);
    else root = m[d.id];
  });
  if (!root) return { nodes: [], svgW: NW, svgH: NH + 16 };

  const leaves = n => (!n.children.length ? 1 : n.children.reduce((s, c) => s + leaves(c), 0));

  const place = (n, x0, d) => {
    n.depth = d;
    const lc = leaves(n);
    n.x = x0 + (lc * (NW + CG) - CG) / 2 - NW / 2;
    n.y = d * LH + 14;
    let cx = x0;
    n.children.forEach(c => { place(c, cx, d + 1); cx += leaves(c) * (NW + CG); });
  };
  place(root, 0, 0);

  const flat = [];
  const walk = n => { flat.push(n); n.children.forEach(walk); };
  walk(root);

  const maxD  = Math.max(...flat.map(n => n.depth));
  const svgW  = leaves(root) * (NW + CG) - CG;
  const svgH  = maxD * LH + NH + 24;
  return { nodes: flat, svgW, svgH };
}

// Orthogonal elbow connector: parent-bottom → right-angle → child-top
function elbow(p, c) {
  const px = p.x + NW / 2, py = p.y + NH;
  const cx = c.x + NW / 2, cy = c.y;
  const my = py + (cy - py) * 0.44;
  return `M${px},${py} L${px},${my} L${cx},${my} L${cx},${cy}`;
}

// ─── Single location topology card ────────────────────────────────────────────
function LocationCard({ loc }) {
  const { nodes, svgW, svgH } = buildLayout(loc.devices);
  const downCount  = loc.devices.filter(d => d.status === "down").length;
  const alertCount = loc.devices.filter(d => d.alert).length;
  const hasIssue   = downCount > 0 || alertCount > 0;
  const accentColor = hasIssue ? "#FF2A2A" : "#1C2C34";
  const upCount    = loc.devices.filter(d => d.status !== "down").length;
  const uid        = `wug-${loc.id}`;

  return (
    <div
      data-testid={`wug-card-${loc.id}`}
      style={{
        flex: "1 1 0",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        background: "#070710",
        borderTop: `2px solid ${hasIssue ? "#FF2A2A" : "#1C3040"}`,
        border: `1px solid ${hasIssue ? "#1E0C0C" : "#10101C"}`,
        borderTopWidth: 2,
        borderTopColor: hasIssue ? "#FF2A2A" : "#1C3040",
        overflow: "hidden",
        boxShadow: hasIssue ? "0 0 18px rgba(255,42,42,0.06)" : "none",
      }}
    >      {/* ── Card header ── */}
      <div style={{ padding: "9px 13px 8px", borderBottom: "1px solid #0E0E1A", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
          <span style={{
            fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, fontWeight: 700,
            color: hasIssue ? "#FF8080" : "#C4C4D8", letterSpacing: "0.15em",
          }}>
            {loc.name.toUpperCase()}
          </span>
          {hasIssue ? (
            <span style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5, color: "#FF4444",
              background: "#180808", border: "1px solid #FF2A2A33",
              padding: "2px 6px", letterSpacing: "0.1em",
            }} data-testid={`wug-alert-${loc.id}`}>
              {downCount} DOWN
            </span>
          ) : (
            <span style={{
              width: 7, height: 7, borderRadius: "1px",
              background: "#00FF66", boxShadow: "0 0 5px #00FF66",
              display: "inline-block", flexShrink: 0,
            }} />
          )}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 6.5, color: "#28283C", letterSpacing: "0.08em" }}>
          {upCount}/{loc.devices.length} DEVICES UP
        </div>
      </div>

      {/* ── SVG topology ── */}
      <div style={{ padding: "10px 8px 12px" }}>
        <svg
          width="100%"
          viewBox={`-6 0 ${svgW + 12} ${svgH}`}
          preserveAspectRatio="xMidYMin meet"
          style={{ display: "block" }}
        >
          <defs>
            {/* Subtle grid background */}
            <pattern id={`${uid}-grid`} width="22" height="22" patternUnits="userSpaceOnUse">
              <path d="M22 0L0 0 0 22" fill="none" stroke="#0A0A16" strokeWidth="0.4" />
            </pattern>
            {/* Junction dot for line branches */}
            <circle id={`${uid}-dot`} r="2.5" fill="#0D1A24" />
            <style>{`
              @keyframes ${uid}-flow { from{stroke-dashoffset:0} to{stroke-dashoffset:-28} }
              @keyframes ${uid}-down { 0%,100%{opacity:.3} 50%{opacity:.9} }
            `}</style>
          </defs>

          {/* PCB-style grid background */}
          <rect x="-6" y="0" width={svgW + 12} height={svgH} fill={`url(#${uid}-grid)`} />

          {/* ── Connector traces ── */}
          {nodes.flatMap(n =>
            (n.children || []).map(child => {
              const tc      = TYPE[n.type] || TYPE.switch;
              const isLive  = n.status !== "down" && child.status !== "down";
              const d       = elbow(n, child);
              return (
                <g key={`e-${n.id}-${child.id}`}>
                  {/* Substrate trace (dark channel) */}
                  <path d={d} fill="none" stroke="#0C1020" strokeWidth="2.5" strokeLinecap="square" />
                  {/* Active color trace */}
                  <path d={d} fill="none" stroke={tc.color} strokeWidth="1"
                    strokeLinecap="square" opacity="0.25" />
                  {/* Flowing data pulse (when both ends are up) */}
                  {isLive && (
                    <path d={d} fill="none" stroke={tc.color}
                      strokeWidth="1.5" strokeDasharray="4 20"
                      strokeLinecap="round" opacity="0.60"
                      style={{ animation: `${uid}-flow 2.4s linear infinite` }} />
                  )}
                  {/* Branch junction dot at parent bottom */}
                  <circle cx={n.x + NW / 2} cy={n.y + NH + 1} r="2"
                    fill={tc.color} opacity="0.45" />
                </g>
              );
            })
          )}

          {/* ── Device nodes ── */}
          {nodes.map(n => {
            const tc     = TYPE[n.type] || TYPE.switch;
            const down   = n.status === "down";
            const alert  = n.alert;
            const bc     = down ? "#FF2A2A" : tc.color;
            const textC  = down ? "#FF7070" : "#C6C6DC";
            const subC   = down ? "#4A2020" : "#26263A";

            return (
              <g key={n.id} data-testid={`wug-node-${n.id}`}>
                {/* Outer alert ring */}
                {down && (
                  <rect x={n.x - 3} y={n.y - 3} width={NW + 6} height={NH + 6} rx="3"
                    fill="none" stroke="#FF2A2A" strokeWidth="1" opacity="0.25"
                    style={{ animation: `${uid}-down 1.8s ease-in-out infinite` }} />
                )}

                {/* Node body */}
                <rect x={n.x} y={n.y} width={NW} height={NH} rx="2"
                  fill={down ? "#100808" : "#0B0B16"}
                  stroke={bc} strokeWidth={down ? 1.5 : 0.7} />

                {/* Left type accent bar */}
                <rect x={n.x} y={n.y} width="3" height={NH} rx="1"
                  fill={bc} opacity={down ? 0.65 : 0.90} />

                {/* Corner type badge */}
                <rect x={n.x + NW - 22} y={n.y + 1} width={21} height={10} rx="1"
                  fill={down ? "#1A0A0A" : "#0E0E1C"} opacity="0.9" />
                <text x={n.x + NW - 11} y={n.y + 9}
                  fontSize="5.2" fontFamily="'JetBrains Mono',monospace"
                  fill={bc} textAnchor="middle" letterSpacing="0.06em" fontWeight={700}
                  opacity="0.8">
                  {tc.abbr}
                </text>

                {/* Device name */}
                <text x={n.x + 11} y={n.y + 13.5}
                  fontSize="7.5" fontFamily="'JetBrains Mono',monospace"
                  fill={textC} letterSpacing="0.03em"
                  fontWeight={n.type === "gateway" ? 700 : 400}>
                  {n.name}
                </text>

                {/* IP address */}
                <text x={n.x + 11} y={n.y + 25}
                  fontSize="5.8" fontFamily="'JetBrains Mono',monospace"
                  fill={subC} letterSpacing="0.04em">
                  {n.ip}
                </text>

                {/* Status dot */}
                <circle cx={n.x + NW - 8} cy={n.y + NH / 2} r="3.5"
                  fill={bc} opacity={down ? 1 : 0.75}
                  style={down ? { animation: `${uid}-down 1.8s ease-in-out infinite` } : {}} />

                {/* DOWN label */}
                {down && (
                  <text x={n.x + NW / 2} y={n.y + NH + 10}
                    fontSize="5.5" fontFamily="'JetBrains Mono',monospace"
                    fill="#FF4444" textAnchor="middle" fontWeight={700} letterSpacing="0.1em">
                    ▼ DOWN
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

// ─── Legend ────────────────────────────────────────────────────────────────────
function Legend() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      {Object.entries(TYPE).map(([, tc]) => (
        <span key={tc.abbr} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 1, borderLeft: `3px solid ${tc.color}`, background: "#0B0B16", display: "inline-block" }} />
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: "#36364A", letterSpacing: "0.1em" }}>
            {tc.label}
          </span>
        </span>
      ))}
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 18, height: 1.5, background: "#4A8CFF", opacity: 0.6, display: "inline-block", boxShadow: "0 0 3px #4A8CFF" }} />
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: "#36364A", letterSpacing: "0.1em" }}>
          ACTIVE TRACE
        </span>
      </span>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function WUGDevices() {
  const [data,      setData]      = useState(MOCK);
  const [loading,   setLoading]   = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [isMock,    setIsMock]    = useState(true);

  const fetchTopology = () => {
    setLoading(true);
    axios.get(`${API}/wug/topology`, { timeout: 10000 })
      .then(r => {
        if (r.data?.locations?.length) {
          setData(r.data);
          setIsMock(false);
        }
      })
      .catch(() => { /* keep mock data */ })
      .finally(() => { setLoading(false); setLastFetch(new Date()); });
  };

  useEffect(() => {
    fetchTopology();
    const iv = setInterval(fetchTopology, 60_000);
    return () => clearInterval(iv);
  }, []);

  const totalDevices = data.locations.reduce((s, l) => s + l.devices.length, 0);
  const totalDown    = data.locations.reduce((s, l) => s + l.devices.filter(d => d.status === "down").length, 0);
  const totalAlerts  = data.locations.reduce((s, l) => s + l.devices.filter(d => d.alert).length, 0);
  const anyIssue     = totalDown > 0 || totalAlerts > 0;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 10 }}>

      {/* ── Page header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <h1 style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: "#E2E2E5", letterSpacing: "0.18em" }}>
            WUG NETWORK TOPOLOGY
          </h1>
          {isMock && (
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5, color: "#FFB014",
              background: "#1A1200", border: "1px solid #FFB01430", padding: "2px 7px", letterSpacing: "0.1em" }}>
              DEMO DATA — WUG API NOT CONNECTED
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Legend />

          {/* Stats */}
          <div style={{ display: "flex", gap: 16 }}>
            {[
              ["LOCATIONS", data.locations.length, "#3A3A50"],
              ["DEVICES",   totalDevices,           "#3A3A50"],
              ["DOWN",      totalDown,               totalDown > 0 ? "#FF4444" : "#3A3A50"],
              ["ALERTS",    totalAlerts,             totalAlerts > 0 ? "#FFB014" : "#3A3A50"],
            ].map(([label, val, color]) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: "#28283A", letterSpacing: "0.1em", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Refresh */}
          <button
            data-testid="wug-refresh-btn"
            onClick={fetchTopology}
            style={{
              background: "transparent", border: "1px solid #1C1C2A",
              color: "#3A3A50", cursor: "pointer", padding: "5px 10px",
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: "0.1em",
            }}
          >
            <RefreshCw size={10} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            REFRESH
          </button>
        </div>
      </div>

      {/* ── Status banner ── */}
      {anyIssue ? (
        <div style={{
          flexShrink: 0, padding: "7px 14px", background: "#140808",
          border: "1px solid #FF2A2A33", display: "flex", alignItems: "center", gap: 10,
        }} data-testid="wug-alert-banner">
          <AlertTriangle size={12} color="#FF4444" />
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#FF6060", letterSpacing: "0.1em" }}>
            {totalDown} DEVICE{totalDown !== 1 ? "S" : ""} DOWN — CHECK AFFECTED LOCATIONS
          </span>
        </div>
      ) : (
        <div style={{
          flexShrink: 0, padding: "7px 14px", background: "#080F08",
          border: "1px solid #00FF6622", display: "flex", alignItems: "center", gap: 10,
        }} data-testid="wug-status-ok">
          <CheckCircle2 size={12} color="#00FF66" />
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#00CC44", letterSpacing: "0.1em" }}>
            ALL NETWORK DEVICES OPERATIONAL — {totalDevices} DEVICES MONITORED ACROSS {data.locations.length} SITES
          </span>
        </div>
      )}

      {/* ── Location topology grid ── */}
      <div style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        flexShrink: 0,
      }}>
        {data.locations.map(loc => (
          <LocationCard key={loc.id} loc={loc} />
        ))}
      </div>

      {/* ── Device roster ── */}
      <div style={{
        flex: 1,
        minHeight: 0,
        background: "#07070F",
        border: "1px solid #10101C",
        borderTop: "2px solid #1C2830",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Roster header */}
        <div style={{
          padding: "8px 16px", borderBottom: "1px solid #0E0E1A",
          display: "flex", alignItems: "center", gap: 16, flexShrink: 0,
        }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700,
            color: "#505068", letterSpacing: "0.18em" }}>
            DEVICE ROSTER
          </span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5, color: "#282838", letterSpacing: "0.08em" }}>
            {totalDevices} DEVICES · POLLING EVERY 60S · {lastFetch ? `LAST: ${lastFetch.toLocaleTimeString()}` : "—"}
          </span>
        </div>

        {/* Roster body */}
        <div style={{ flex: 1, overflow: "auto", padding: "6px 12px 10px" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {data.locations.map(loc =>
              loc.devices.map(d => {
                const tc   = TYPE[d.type] || TYPE.switch;
                const down = d.status === "down";
                return (
                  <div key={d.id} data-testid={`roster-${d.id}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 10px 5px 0",
                      borderLeft: `2px solid ${down ? "#FF2A2A" : tc.color}`,
                      paddingLeft: 8,
                      background: down ? "#0E0606" : "#0A0A13",
                      minWidth: 200, flex: "1 1 200px",
                    }}>
                    {/* Status dot */}
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                      background: down ? "#FF2A2A" : tc.color,
                      boxShadow: `0 0 4px ${down ? "#FF2A2A" : tc.color}`,
                    }} />
                    {/* Device info */}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                        color: down ? "#FF7070" : "#B0B0C8", letterSpacing: "0.04em",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {d.name}
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 6.5,
                        color: "#28283A", letterSpacing: "0.04em" }}>
                        {loc.name} · {d.ip}
                      </div>
                    </div>
                    {/* Type badge */}
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 6,
                      color: tc.color, opacity: 0.6, letterSpacing: "0.08em", flexShrink: 0 }}>
                      {tc.abbr}
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
