/**
 * UniFiDevices — PCB topology trees per controller site.
 * Same circuit-board aesthetic as WUG: each site is a tree card with
 * orthogonal connectors, device nodes, and status coloring.
 */
import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TYPE = {
  gateway:      { color: "#A78BFA", abbr: "GW",  label: "GATEWAY" },
  switch:       { color: "#00FF66", abbr: "SW",  label: "SWITCH"  },
  poe_switch:   { color: "#00FF66", abbr: "PSW", label: "POE SW"  },
  access_point: { color: "#00E5FF", abbr: "AP",  label: "AP"      },
  camera:       { color: "#FFB014", abbr: "CAM", label: "CAMERA"  },
  device:       { color: "#3A3A48", abbr: "DEV", label: "DEVICE"  },
};

// ── Tree layout (same algorithm as WUG) ─────────────────────────────────────
const NW = 122, NH = 34, LH = 72, CG = 12;

function buildLayout(devices) {
  if (!devices?.length) return { nodes: [], svgW: NW, svgH: NH + 16 };
  const m = {};
  devices.forEach(d => (m[d.id] = { ...d, children: [] }));
  const childSet = new Set(devices.filter(d => d.parent_id).map(d => d.id));
  let root = m[devices.find(d => !childSet.has(d.id))?.id];
  if (!root) root = m[devices[0].id];
  devices.forEach(d => {
    if (d.parent_id && m[d.parent_id] && d.id !== root.id)
      m[d.parent_id].children.push(m[d.id]);
  });
  const leaves = n => (!n.children.length ? 1 : n.children.reduce((s, c) => s + leaves(c), 0));
  const place  = (n, x0, d) => {
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
  const maxD = Math.max(...flat.map(n => n.depth));
  return { nodes: flat, svgW: leaves(root) * (NW + CG) - CG, svgH: maxD * LH + NH + 24 };
}

function elbow(p, c) {
  const px = p.x + NW / 2, py = p.y + NH;
  const cx = c.x + NW / 2, cy = c.y;
  const my = py + (cy - py) * 0.44;
  return `M${px},${py} L${px},${my} L${cx},${my} L${cx},${cy}`;
}

// Infer parent_id from device types when API doesn't provide topology
function inferParents(devices) {
  if (!devices?.length) return [];
  const gateways = devices.filter(d => d.type === "gateway");
  const switches  = devices.filter(d => d.type === "switch" || d.type === "poe_switch");
  const aps       = devices.filter(d => d.type === "access_point");
  const others    = devices.filter(d => !["gateway","switch","poe_switch","access_point"].includes(d.type));

  const root = gateways[0] || switches[0] || devices[0];
  const result = [{ ...root, parent_id: null }];

  const swNoRoot = switches.filter(s => s.id !== root.id);
  swNoRoot.forEach(s => result.push({ ...s, parent_id: root.id }));
  gateways.slice(1).forEach(g => result.push({ ...g, parent_id: root.id }));

  // Distribute APs round-robin across available switches
  const swParents = swNoRoot.length ? swNoRoot : [root];
  aps.forEach((ap, i) => result.push({ ...ap, parent_id: swParents[i % swParents.length].id }));

  others.filter(o => o.id !== root.id)
        .forEach(o => result.push({ ...o, parent_id: root.id }));

  return result;
}

// ── Site topology card ───────────────────────────────────────────────────────
function SiteCard({ name, devices, siteId }) {
  const withParents          = inferParents(devices);
  const { nodes, svgW, svgH } = buildLayout(withParents);
  const downCount = devices.filter(d => d.status === "offline").length;
  const upCount   = devices.filter(d => d.status === "online").length;
  const hasIssue  = downCount > 0;
  const uid       = `unifi-${siteId}`;

  return (
    <div
      data-testid={`unifi-site-${siteId}`}
      style={{
        flex: "1 1 0", minWidth: 0,
        display: "flex", flexDirection: "column",
        background: "#070710",
        borderTop: `2px solid ${hasIssue ? "#FF2A2A" : "#1C3040"}`,
        border: `1px solid ${hasIssue ? "#1E0C0C" : "#10101C"}`,
        borderTopWidth: 2, borderTopColor: hasIssue ? "#FF2A2A" : "#1C3040",
        overflow: "hidden",
        boxShadow: hasIssue ? "0 0 18px rgba(255,42,42,0.06)" : "none",
      }}
    >
      <div style={{ padding: "9px 13px 8px", borderBottom: "1px solid #0E0E1A", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, fontWeight: 700,
            color: hasIssue ? "#FF8080" : "#C4C4D8", letterSpacing: "0.15em" }}>
            {name.toUpperCase()}
          </span>
          {hasIssue ? (
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5, color: "#FF4444",
              background: "#180808", border: "1px solid #FF2A2A33", padding: "2px 6px", letterSpacing: "0.1em" }}
              data-testid={`unifi-down-badge-${siteId}`}>
              {downCount} DOWN
            </span>
          ) : (
            <span style={{ width: 7, height: 7, background: "#00FF66",
              boxShadow: "0 0 5px #00FF66", display: "inline-block", flexShrink: 0 }} />
          )}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 6.5, color: "#28283C", letterSpacing: "0.08em" }}>
          {upCount}/{devices.length} DEVICES UP
        </div>
      </div>

      <div style={{ padding: "10px 8px 12px" }}>
        <svg
          width="100%"
          viewBox={`-6 0 ${svgW + 12} ${svgH}`}
          preserveAspectRatio="xMidYMin meet"
          style={{ display: "block" }}
        >
          <defs>
            <pattern id={`${uid}-grid`} width="22" height="22" patternUnits="userSpaceOnUse">
              <path d="M22 0L0 0 0 22" fill="none" stroke="#0A0A16" strokeWidth="0.4" />
            </pattern>
            <style>{`
              @keyframes ${uid}-down { 0%,100%{opacity:.3} 50%{opacity:.9} }
            `}</style>
          </defs>
          <rect x="-6" y="0" width={svgW + 12} height={svgH} fill={`url(#${uid}-grid)`} />

          {nodes.flatMap(n => (n.children || []).map(child => {
            const tc = TYPE[n.type] || TYPE.device;
            const d  = elbow(n, child);
            return (
              <g key={`e-${n.id}-${child.id}`}>
                <path d={d} fill="none" stroke="#0C1020" strokeWidth="2.5" strokeLinecap="square" />
                <path d={d} fill="none" stroke={tc.color} strokeWidth="1"
                  strokeLinecap="square" opacity="0.25" />
                <circle cx={n.x + NW / 2} cy={n.y + NH + 1} r="2"
                  fill={tc.color} opacity="0.45" />
              </g>
            );
          }))}

          {nodes.map(n => {
            const tc    = TYPE[n.type] || TYPE.device;
            const down  = n.status === "offline";
            const bc    = down ? "#FF2A2A" : tc.color;
            const textC = down ? "#FF7070" : "#C6C6DC";
            const subC  = down ? "#4A2020" : "#26263A";
            return (
              <g key={n.id} data-testid={`unifi-node-${n.id}`}>
                {down && (
                  <rect x={n.x - 3} y={n.y - 3} width={NW + 6} height={NH + 6} rx="3"
                    fill="none" stroke="#FF2A2A" strokeWidth="1" opacity="0.25"
                    style={{ animation: `${uid}-down 1.8s ease-in-out infinite` }} />
                )}
                <rect x={n.x} y={n.y} width={NW} height={NH} rx="2"
                  fill={down ? "#100808" : "#0B0B16"}
                  stroke={bc} strokeWidth={down ? 1.5 : 0.7} />
                <rect x={n.x} y={n.y} width="3" height={NH} rx="1"
                  fill={bc} opacity={down ? 0.65 : 0.90} />
                <rect x={n.x + NW - 22} y={n.y + 1} width={21} height={10} rx="1"
                  fill={down ? "#1A0A0A" : "#0E0E1C"} opacity="0.9" />
                <text x={n.x + NW - 11} y={n.y + 9}
                  fontSize="5.2" fontFamily="'JetBrains Mono',monospace"
                  fill={bc} textAnchor="middle" letterSpacing="0.06em" fontWeight={700} opacity="0.8">
                  {tc.abbr}
                </text>
                <text x={n.x + 11} y={n.y + 14}
                  fontSize="7.5" fontFamily="'JetBrains Mono',monospace"
                  fill={textC} letterSpacing="0.03em"
                  fontWeight={n.type === "gateway" ? 700 : 400}>
                  {n.name}
                </text>
                <text x={n.x + 11} y={n.y + 26}
                  fontSize="5.8" fontFamily="'JetBrains Mono',monospace"
                  fill={subC} letterSpacing="0.04em">
                  {n.ip || "—"}
                  {n.num_sta > 0 ? ` · ${n.num_sta} STA` : ""}
                </text>
                <circle cx={n.x + NW - 8} cy={n.y + NH / 2} r="3.5"
                  fill={bc} opacity={down ? 1 : 0.75}
                  style={down ? { animation: `${uid}-down 1.8s ease-in-out infinite` } : {}} />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ── Demo data shown when controller not connected ─────────────────────────────
const DEMO_SITES = [
  {
    siteId: "novi", name: "Novi HQ",
    devices: [
      { id: "n-gw",  name: "UDM-Pro",       type: "gateway",      ip: "10.202.1.1",  status: "online",  num_sta: 0  },
      { id: "n-sw1", name: "USW-48-Pro",     type: "switch",       ip: "10.202.1.2",  status: "online",  num_sta: 0  },
      { id: "n-sw2", name: "USW-24-POE",     type: "poe_switch",   ip: "10.202.1.3",  status: "online",  num_sta: 0  },
      { id: "n-ap1", name: "U6-Pro Lobby",   type: "access_point", ip: "10.202.1.50", status: "online",  num_sta: 12 },
      { id: "n-ap2", name: "U6-Pro Office",  type: "access_point", ip: "10.202.1.51", status: "online",  num_sta: 28 },
      { id: "n-ap3", name: "U6-LR Whs",      type: "access_point", ip: "10.202.1.52", status: "online",  num_sta: 5  },
    ],
  },
  {
    siteId: "remus", name: "Remus",
    devices: [
      { id: "r-gw",  name: "USG-Pro",       type: "gateway",      ip: "10.202.2.1",  status: "online",  num_sta: 0 },
      { id: "r-sw1", name: "USW-24",         type: "switch",       ip: "10.202.2.2",  status: "online",  num_sta: 0 },
      { id: "r-ap1", name: "U6-Lite A",      type: "access_point", ip: "10.202.2.50", status: "offline", num_sta: 0 },
      { id: "r-ap2", name: "U6-Lite B",      type: "access_point", ip: "10.202.2.51", status: "online",  num_sta: 8 },
    ],
  },
  {
    siteId: "mt-pleasant", name: "Mt. Pleasant",
    devices: [
      { id: "m-gw",  name: "USG",            type: "gateway",      ip: "10.202.3.1",  status: "online", num_sta: 0  },
      { id: "m-sw1", name: "USW-16",          type: "switch",       ip: "10.202.3.2",  status: "online", num_sta: 0  },
      { id: "m-ap1", name: "U6-Pro Flr 1",   type: "access_point", ip: "10.202.3.50", status: "online", num_sta: 14 },
      { id: "m-ap2", name: "U6-Pro Flr 2",   type: "access_point", ip: "10.202.3.51", status: "online", num_sta: 11 },
    ],
  },
  {
    siteId: "canton", name: "Canton",
    devices: [
      { id: "k-gw",  name: "USG-Pro",        type: "gateway",      ip: "10.202.5.1",  status: "online", num_sta: 0  },
      { id: "k-sw1", name: "USW-24-POE",      type: "poe_switch",   ip: "10.202.5.2",  status: "online", num_sta: 0  },
      { id: "k-ap1", name: "U6-Pro Office",   type: "access_point", ip: "10.202.5.50", status: "online", num_sta: 19 },
      { id: "k-ap2", name: "U6-Lite Flr 2",  type: "access_point", ip: "10.202.5.51", status: "online", num_sta: 7  },
    ],
  },
  {
    siteId: "constantine", name: "Constantine",
    devices: [
      { id: "c-gw",  name: "USG",             type: "gateway",      ip: "10.202.4.1",  status: "online", num_sta: 0 },
      { id: "c-sw1", name: "USW-8",            type: "switch",       ip: "10.202.4.2",  status: "online", num_sta: 0 },
      { id: "c-ap1", name: "U6-Lite",          type: "access_point", ip: "10.202.4.50", status: "online", num_sta: 6 },
    ],
  },
];

export default function UniFiDevices() {
  const [siteCards, setSiteCards] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [isMock,    setIsMock]    = useState(false);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await axios.get(`${API}/unifi/devices`);
      const devs = res.data?.devices ?? [];
      if (devs.length) {
        // Group by controller
        const byCtrl = {};
        devs.forEach(d => {
          const k = d.controller || "default";
          (byCtrl[k] = byCtrl[k] || []).push(d);
        });
        setSiteCards(Object.entries(byCtrl).map(([ctrl, list]) => ({
          siteId: ctrl.toLowerCase().replace(/[^a-z0-9]/g, "-"),
          name: ctrl, devices: list,
        })));
        setIsMock(false);
      } else {
        setSiteCards(DEMO_SITES);
        setIsMock(true);
      }
    } catch {
      setSiteCards(DEMO_SITES);
      setIsMock(true);
    } finally {
      setLoading(false); setRefreshing(false); setLastFetch(new Date());
    }
  }, []);

  useEffect(() => { load(); const iv = setInterval(load, 60000); return () => clearInterval(iv); }, [load]);

  const allDevices    = siteCards.flatMap(s => s.devices);
  const totalOnline   = allDevices.filter(d => d.status === "online").length;
  const totalOffline  = allDevices.filter(d => d.status === "offline").length;
  const anyIssue      = totalOffline > 0;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 10 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <h1 data-testid="unifi-header" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: "#E2E2E5", letterSpacing: "0.18em" }}>
            UNIFI NETWORK TOPOLOGY
          </h1>
          {isMock && (
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5, color: "#FFB014",
              background: "#1A1200", border: "1px solid #FFB01430", padding: "2px 7px", letterSpacing: "0.1em" }}>
              DEMO DATA — CONTROLLER NOT CONNECTED
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {[
            ["SITES",    siteCards.length, "#3A3A50"],
            ["DEVICES",  allDevices.length, "#C4C4D8"],
            ["ONLINE",   totalOnline,        "#00FF66"],
            ["OFFLINE",  totalOffline,        totalOffline > 0 ? "#FF4444" : "#3A3A50"],
            ["APs",      allDevices.filter(d => d.type === "access_point").length, "#00E5FF"],
            ["SWITCHES", allDevices.filter(d => d.type === "switch" || d.type === "poe_switch").length, "#00FF66"],
          ].map(([label, val, color]) => (
            <div key={label} data-testid={`unifi-kpi-${label.toLowerCase()}`} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: "#28283A", letterSpacing: "0.1em", marginTop: 2 }}>{label}</div>
            </div>
          ))}
          <button data-testid="unifi-refresh-btn" onClick={() => load(true)}
            style={{ background: "transparent", border: "1px solid #1C1C2A", color: "#3A3A50", cursor: "pointer",
              padding: "5px 10px", display: "flex", alignItems: "center", gap: 6,
              fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: "0.1em" }}>
            <RefreshCw size={10} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
            {refreshing ? "POLLING..." : "REFRESH"}
          </button>
        </div>
      </div>

      {/* Status banner */}
      {!loading && (
        anyIssue ? (
          <div data-testid="unifi-alert-banner" style={{ flexShrink: 0, padding: "7px 14px", background: "#140808",
            border: "1px solid #FF2A2A33", display: "flex", alignItems: "center", gap: 10 }}>
            <AlertTriangle size={12} color="#FF4444" />
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#FF6060", letterSpacing: "0.1em" }}>
              {totalOffline} DEVICE{totalOffline !== 1 ? "S" : ""} OFFLINE — CHECK AFFECTED LOCATIONS
            </span>
          </div>
        ) : (
          <div data-testid="unifi-status-ok" style={{ flexShrink: 0, padding: "7px 14px", background: "#080F08",
            border: "1px solid #00FF6622", display: "flex", alignItems: "center", gap: 10 }}>
            <CheckCircle2 size={12} color="#00FF66" />
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#00CC44", letterSpacing: "0.1em" }}>
              ALL UNIFI DEVICES OPERATIONAL — {allDevices.length} DEVICES ACROSS {siteCards.length} SITES
            </span>
          </div>
        )
      )}

      {/* Site topology grid */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <div style={{ display: "flex", gap: 10 }}>
            {[...Array(3)].map((_, i) => <div key={i} className="skeleton" style={{ flex: 1, height: 220 }} />)}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            {siteCards.map(s => <SiteCard key={s.siteId} {...s} />)}
          </div>
        )}
      </div>

    </div>
  );
}
