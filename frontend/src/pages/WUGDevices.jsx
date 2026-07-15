/**
 * WUGDevices — Radial hub-and-spoke NOC topology with per-site device trees.
 *
 * Layout: Central WUG POLLER → radial spokes → site nodes → device circles
 * Each site has individual device nodes branching radially outward:
 *   gateway → switches → APs/cameras (PCB-style sub-tree per site)
 *
 * Pi-safe animations:
 *   - Sonar rings on WUG Poller: CSS opacity keyframe
 *   - Traveling spoke dots: Canvas 2D at 15fps
 *   - Offline pulse rings: CSS opacity keyframe
 */
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── SVG coordinate space ──────────────────────────────────────────────────────
const VW = 1700, VH = 760;
const CX = 850, CY = 390;   // WUG Poller center — slightly below-center for balance
const R_SITE = 195;           // Poller → site node center
const NW = 118, NH = 40;     // site node rect dimensions
const DEV_R = 14;             // device circle radius
const DEV_STEP = 54;          // radial distance per tree depth
const LEAF_SEP = 44;          // cross-spoke spacing per leaf slot

const TYPE_COLOR = {
  firewall:     "#FF6B35",
  gateway:      "#A78BFA",
  switch:       "#00FF66",
  poe_switch:   "#00FF66",
  access_point: "#00E5FF",
  camera:       "#FFB014",
  device:       "#505068",
};

const TYPE_ABBR = {
  firewall:     "FW",
  gateway:      "GW",
  switch:       "SW",
  poe_switch:   "SW",
  access_point: "AP",
  camera:       "CAM",
  device:       "?",
};

// ── Demo data ─────────────────────────────────────────────────────────────────
const MOCK = {
  locations: [
    {
      id: "novi", name: "Novi HQ",
      devices: [
        { id: "n-gw",  name: "UDM-Pro",     type: "gateway",      status: "up" },
        { id: "n-s1",  name: "USW-48-Pro",  type: "switch",       status: "up" },
        { id: "n-s2",  name: "USW-24-POE",  type: "poe_switch",   status: "up" },
        { id: "n-a1",  name: "U6-Pro Lby",  type: "access_point", status: "up" },
        { id: "n-a2",  name: "U6-Pro Off",  type: "access_point", status: "up" },
        { id: "n-a3",  name: "U6-LR Whs",   type: "access_point", status: "up" },
      ],
    },
    {
      id: "remus", name: "Remus",
      devices: [
        { id: "r-gw",  name: "USG-Pro",     type: "gateway",      status: "up"   },
        { id: "r-s1",  name: "USW-24",      type: "switch",       status: "up"   },
        { id: "r-a1",  name: "U6-Lite A",   type: "access_point", status: "down" },
        { id: "r-a2",  name: "U6-Lite B",   type: "access_point", status: "up"   },
      ],
    },
    {
      id: "mt-pleasant", name: "Mt. Pleasant",
      devices: [
        { id: "m-gw",  name: "USG",         type: "gateway",      status: "up" },
        { id: "m-s1",  name: "USW-16",      type: "switch",       status: "up" },
        { id: "m-a1",  name: "U6-Pro F1",   type: "access_point", status: "up" },
        { id: "m-a2",  name: "U6-Pro F2",   type: "access_point", status: "up" },
      ],
    },
    {
      id: "ovid", name: "Ovid",
      devices: [
        { id: "o-gw",  name: "USG",         type: "gateway",      status: "up" },
        { id: "o-s1",  name: "USW-8",       type: "switch",       status: "up" },
        { id: "o-a1",  name: "U6-Lite",     type: "access_point", status: "up" },
      ],
    },
    {
      id: "middlebury", name: "Middlebury",
      devices: [
        { id: "mb-gw", name: "USG-Pro",     type: "gateway",      status: "up" },
        { id: "mb-s1", name: "USW-16-POE",  type: "poe_switch",   status: "up" },
        { id: "mb-a1", name: "U6-LR",       type: "access_point", status: "up" },
      ],
    },
    {
      id: "canton", name: "Canton",
      devices: [
        { id: "k-gw",  name: "USG-Pro",     type: "gateway",      status: "up" },
        { id: "k-s1",  name: "USW-24-POE",  type: "poe_switch",   status: "up" },
        { id: "k-a1",  name: "U6-Pro Off",  type: "access_point", status: "up" },
        { id: "k-a2",  name: "U6-Lite F2",  type: "access_point", status: "up" },
      ],
    },
    {
      id: "constantine", name: "Constantine",
      devices: [
        { id: "c-gw",  name: "USG",         type: "gateway",      status: "up" },
        { id: "c-s1",  name: "USW-8",       type: "switch",       status: "up" },
        { id: "c-a1",  name: "U6-Lite",     type: "access_point", status: "up" },
      ],
    },
    {
      id: "canton-whs", name: "Canton Whs",
      devices: [
        { id: "cw-gw", name: "USG",         type: "gateway",      status: "up" },
        { id: "cw-s1", name: "USW-8",       type: "switch",       status: "up" },
        { id: "cw-a1", name: "U6-Nano",     type: "access_point", status: "up" },
      ],
    },
  ],
};

// ── Tree layout helpers ───────────────────────────────────────────────────────

/** Infer parent_id relationships from device types (used for demo data). */
function inferParents(devices) {
  if (!devices?.length) return [];
  const firewalls  = devices.filter(d => d.type === "firewall");
  const gateways   = devices.filter(d => d.type === "gateway");
  const switches   = devices.filter(d => d.type === "switch" || d.type === "poe_switch");
  const aps        = devices.filter(d => d.type === "access_point");
  const cameras    = devices.filter(d => d.type === "camera");
  const others     = devices.filter(d =>
    !["firewall","gateway","switch","poe_switch","access_point","camera"].includes(d.type));

  const root = firewalls[0] || gateways[0] || switches[0] || devices[0];
  const result = [{ ...root, parent_id: null }];
  const notRoot = d => d.id !== root.id;

  [...firewalls.filter(notRoot), ...gateways.filter(notRoot)]
    .forEach(d => result.push({ ...d, parent_id: root.id }));

  const swNoRoot = switches.filter(notRoot);
  swNoRoot.forEach(s => result.push({ ...s, parent_id: root.id }));

  const swParents = swNoRoot.length ? swNoRoot : [root];
  aps.forEach((ap, i) => result.push({ ...ap, parent_id: swParents[i % swParents.length].id }));
  cameras.forEach((cam, i) => result.push({ ...cam, parent_id: swParents[i % swParents.length].id }));
  others.filter(notRoot).forEach(o => result.push({ ...o, parent_id: root.id }));

  return result;
}

/** Build a tree structure from a flat list with parent_id fields. */
function buildTree(flat) {
  const byId = {};
  flat.forEach(d => (byId[d.id] = { device: d, children: [] }));
  let root = null;
  flat.forEach(d => {
    if (!d.parent_id) root = byId[d.id];
    else if (byId[d.parent_id]) byId[d.parent_id].children.push(byId[d.id]);
  });
  return root;
}

/**
 * Layout device nodes radially outward from a site node.
 * Handles both provided parent_id (real WUG data) and type-inferred hierarchy (demo).
 * Returns array: [{...device, x, y, parentX, parentY}]
 */
function layoutDevicesForSite(site, devices) {
  if (!devices?.length) return [];

  // Use provided parent_ids if any device has one; otherwise infer from types
  const hasProvidedParents = devices.some(d => d.parent_id != null);
  const flat = hasProvidedParents ? devices : inferParents(devices);
  const tree = buildTree(flat);
  if (!tree) return [];

  const cosA = Math.cos(site.angle);
  const sinA = Math.sin(site.angle);

  // Pass 1: assign leaf slot indices via DFS
  let leafIdx = 0;
  function assignSlots(node) {
    if (!node.children.length) {
      node.centerSlot = leafIdx++;
      return;
    }
    node.children.forEach(assignSlots);
    node.centerSlot =
      (node.children[0].centerSlot + node.children[node.children.length - 1].centerSlot) / 2;
  }
  assignSlots(tree);

  const totalLeaves  = leafIdx;
  const centerOffset = (totalLeaves - 1) / 2;

  // Pass 2: collect absolute SVG positions using radial + cross-spoke transform
  const result = [];
  function collect(node, depth, parentX, parentY) {
    const cross  = (node.centerSlot - centerOffset) * LEAF_SEP;
    const radial = depth * DEV_STEP;
    // (radial, cross) → SVG: radial along spoke direction, cross perpendicular
    const x = site.x + radial * cosA - cross * sinA;
    const y = site.y + radial * sinA + cross * cosA;
    result.push({ ...node.device, x, y, parentX, parentY });
    node.children.forEach(child => collect(child, depth + 1, x, y));
  }
  collect(tree, 1, site.x, site.y);
  return result;
}

// ── Site and device position computation ──────────────────────────────────────
function computeLayout(locations) {
  const N = locations.length;
  return locations.map((loc, i) => {
    const angle = (2 * Math.PI * i / N) - Math.PI / 2;
    const x  = CX + R_SITE * Math.cos(angle);
    const y  = CY + R_SITE * Math.sin(angle);
    return {
      ...loc,
      angle, x, y,
      nx: x - NW / 2,
      ny: y - NH / 2,
      deviceNodes: layoutDevicesForSite({ x, y, angle }, loc.devices),
    };
  });
}

/** Canvas dot definitions: traveling dots along center→site spokes. */
function buildSpokeDots(locs) {
  return locs.flatMap((loc, i) => {
    const hasIssue = loc.devices.some(d => d.status === "down");
    return Array.from({ length: 3 }, (_, j) => ({
      x1: CX, y1: CY, x2: loc.x, y2: loc.y,
      speed: 0.22, hasIssue,
      progress: (j / 3 + i * 0.13) % 1,
    }));
  });
}

// ── Radial topology: SVG + Canvas overlay ────────────────────────────────────
function RadialTopology({ locs }) {
  const canvasRef = useRef(null);
  const dotDefs   = useRef([]);

  // Rebuild dot paths whenever layout changes
  useEffect(() => {
    dotDefs.current = buildSpokeDots(locs).map(d => ({ ...d }));
  }, [locs]);

  // Canvas 15fps animation loop (Pi-safe: no CSS transform/motion-path)
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

      // Match SVG preserveAspectRatio="xMidYMid meet" transform
      const scale   = Math.min(cW / VW, cH / VH);
      const offsetX = (cW - VW * scale) / 2;
      const offsetY = (cH - VH * scale) / 2;

      ctx.clearRect(0, 0, cW, cH);

      for (const d of dotDefs.current) {
        d.progress += d.speed * dt;
        if (d.progress >= 1) d.progress -= 1;
        const t    = d.progress;
        const svgX = d.x1 + (d.x2 - d.x1) * t;
        const svgY = d.y1 + (d.y2 - d.y1) * t;
        const cx   = svgX * scale + offsetX;
        const cy   = svgY * scale + offsetY;
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
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", syncSize);
    };
  }, []);

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
              100% { opacity: 0; }
            }
            @keyframes wug-offline-pulse {
              0%, 100% { opacity: 0.2; }
              50%       { opacity: 0.85; }
            }
            @keyframes wug-center-breathe {
              0%, 100% { opacity: 0.85; }
              50%       { opacity: 1; }
            }
          `}</style>
          <pattern id="wug-dotgrid" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.7" fill="#0C0C1A" />
          </pattern>
        </defs>

        {/* Background */}
        <rect x="0" y="0" width={VW} height={VH} fill="#050510" />
        <rect x="0" y="0" width={VW} height={VH} fill="url(#wug-dotgrid)" opacity="0.55" />

        {/* ── Center → site spoke lines (dim, static) ── */}
        {locs.map(loc => {
          const hasIssue = loc.devices.some(d => d.status === "down");
          return (
            <line key={`spoke-${loc.id}`}
              x1={CX} y1={CY} x2={loc.x} y2={loc.y}
              stroke={hasIssue ? "#FF2A2A" : "#00FF66"}
              strokeWidth={hasIssue ? 0.9 : 0.65}
              opacity={hasIssue ? 0.35 : 0.14}
            />
          );
        })}

        {/* ── Device connection lines: site→device and device→device ── */}
        {locs.flatMap(loc =>
          loc.deviceNodes.map(dev => {
            const tc     = TYPE_COLOR[dev.type] || TYPE_COLOR.device;
            const isDown = dev.status === "down";
            return (
              <line key={`devline-${dev.id}`}
                x1={dev.parentX} y1={dev.parentY}
                x2={dev.x} y2={dev.y}
                stroke={isDown ? "#FF2A2A" : tc}
                strokeWidth="1.2"
                opacity={isDown ? 0.55 : 0.32}
              />
            );
          })
        )}
        {/* Junction dots at device connection midpoints */}
        {locs.flatMap(loc =>
          loc.deviceNodes.map(dev => {
            const tc     = TYPE_COLOR[dev.type] || TYPE_COLOR.device;
            const isDown = dev.status === "down";
            const mx = (dev.x + dev.parentX) / 2;
            const my = (dev.y + dev.parentY) / 2;
            return (
              <circle key={`junct-${dev.id}`}
                cx={mx} cy={my} r="1.8"
                fill={isDown ? "#FF2A2A" : tc}
                opacity={isDown ? 0.6 : 0.35}
              />
            );
          })
        )}

        {/* ── WUG Poller: sonar rings ── */}
        {[1.6, 2.3, 3.1].map((factor, i) => (
          <circle key={`ring-${i}`}
            cx={CX} cy={CY} r={32 * factor}
            fill="none" stroke="#00E5FF" strokeWidth="0.75"
            style={{
              animation: "wug-sonar 2.6s ease-out infinite",
              animationDelay: `${i * 0.85}s`,
              opacity: 0,
            }}
          />
        ))}
        {/* Guide ring */}
        <circle cx={CX} cy={CY} r={38} fill="none" stroke="#00E5FF" strokeWidth="0.7" opacity="0.1" />

        {/* WUG Poller node */}
        <rect x={CX - 28} y={CY - 28} width={56} height={56} rx="6"
          fill="#060614" stroke="#00E5FF" strokeWidth="1.4"
          style={{ animation: "wug-center-breathe 3s ease-in-out infinite" }} />
        <rect x={CX - 20} y={CY - 20} width={40} height={40} rx="4"
          fill="none" stroke="#00E5FF" strokeWidth="0.5" opacity="0.28" />
        <text x={CX} y={CY - 3} fontSize="9" fontFamily="'JetBrains Mono',monospace"
          fill="#00E5FF" textAnchor="middle" fontWeight={700} letterSpacing="0.15em">WUG</text>
        <text x={CX} y={CY + 9} fontSize="5.5" fontFamily="'JetBrains Mono',monospace"
          fill="#00E5FF" textAnchor="middle" letterSpacing="0.12em" opacity="0.6">POLLER</text>
        <circle cx={CX} cy={CY} r="3" fill="#00E5FF" opacity="0.9" data-testid="node-wug-poller" />

        {/* ── Site nodes ── */}
        {locs.map(loc => {
          const hasIssue  = loc.devices.some(d => d.status === "down");
          const downCount = loc.devices.filter(d => d.status === "down").length;
          const upCount   = loc.devices.filter(d => d.status !== "down").length;
          const bc        = hasIssue ? "#FF2A2A" : "#00FF66";
          const textC     = hasIssue ? "#FF8080" : "#C4C4D8";

          return (
            <g key={`site-${loc.id}`} data-testid={`wug-node-${loc.id}`}>
              {hasIssue && (
                <rect x={loc.nx - 5} y={loc.ny - 5} width={NW + 10} height={NH + 10} rx="5"
                  fill="none" stroke="#FF2A2A" strokeWidth="1.5"
                  style={{ animation: "wug-offline-pulse 1.6s ease-in-out infinite" }}
                />
              )}
              <rect x={loc.nx} y={loc.ny} width={NW} height={NH} rx="3"
                fill="#07070F" stroke={bc} strokeWidth={hasIssue ? 1.2 : 0.7} />
              {/* Left accent bar */}
              <rect x={loc.nx} y={loc.ny} width="3" height={NH} rx="1"
                fill={bc} opacity={hasIssue ? 0.75 : 0.85} />
              <text x={loc.nx + 10} y={loc.ny + 16}
                fontSize="9.5" fontFamily="'JetBrains Mono',monospace"
                fill={textC} fontWeight={700} letterSpacing="0.1em">
                {loc.name.toUpperCase().slice(0, 12)}
              </text>
              <text x={loc.nx + 10} y={loc.ny + 30}
                fontSize="7.5" fontFamily="'JetBrains Mono',monospace"
                fill={hasIssue ? "#FF4444" : "#264A38"} letterSpacing="0.04em">
                {upCount}/{loc.devices.length} UP{downCount > 0 ? ` · ${downCount} DN` : ""}
              </text>
              {/* Status corner dot */}
              <circle cx={loc.nx + NW - 9} cy={loc.ny + NH - 9} r="5"
                fill={bc} opacity={hasIssue ? 1 : 0.65}
                style={hasIssue ? { animation: "wug-offline-pulse 1.6s ease-in-out infinite" } : {}} />
            </g>
          );
        })}

        {/* ── Device nodes: colored circles per site, branching radially outward ── */}
        {locs.flatMap(loc => {
          const cosA = Math.cos(loc.angle);
          const sinA = Math.sin(loc.angle);
          return loc.deviceNodes.map(dev => {
            const tc     = TYPE_COLOR[dev.type] || TYPE_COLOR.device;
            const isDown = dev.status === "down";
            const bc     = isDown ? "#FF2A2A" : tc;
            const abbr   = TYPE_ABBR[dev.type] || "?";
            const label  = dev.name.slice(0, 9);

            // Label placed in the outward radial direction from WUG Poller
            const LABEL_OFF = DEV_R + 11;
            const lblX      = dev.x + LABEL_OFF * cosA;
            const lblY      = dev.y + LABEL_OFF * sinA + 2.5;
            const anchor    = Math.abs(sinA) > 0.65 ? "middle" : (cosA >= 0 ? "start" : "end");

            return (
              <g key={`devnode-${dev.id}`} data-testid={`wug-dev-${dev.id}`}>
                {/* Outer ambient glow ring */}
                <circle cx={dev.x} cy={dev.y} r={DEV_R + 6}
                  fill="none" stroke={bc} strokeWidth="0.5"
                  opacity={isDown ? 0.35 : 0.12}
                />
                {/* Offline pulse ring */}
                {isDown && (
                  <circle cx={dev.x} cy={dev.y} r={DEV_R + 4}
                    fill="none" stroke="#FF2A2A" strokeWidth="1.2"
                    style={{ animation: "wug-offline-pulse 1.6s ease-in-out infinite" }}
                  />
                )}
                {/* Mid accent ring (online only) */}
                {!isDown && (
                  <circle cx={dev.x} cy={dev.y} r={DEV_R + 2}
                    fill="none" stroke={tc} strokeWidth="0.4" opacity="0.2"
                  />
                )}
                {/* Device circle body */}
                <circle cx={dev.x} cy={dev.y} r={DEV_R}
                  fill={isDown ? "#180808" : "#06061A"}
                  stroke={bc} strokeWidth={isDown ? 1.6 : 1.0}
                />
                {/* Type abbreviation inside */}
                <text x={dev.x} y={dev.y + 4}
                  fontSize="7" fontFamily="'JetBrains Mono',monospace"
                  fill={bc} textAnchor="middle" fontWeight={700} letterSpacing="0.04em">
                  {abbr}
                </text>
                {/* Device name label in spoke-outward direction */}
                <text x={lblX} y={lblY}
                  fontSize="8" fontFamily="'JetBrains Mono',monospace"
                  fill={isDown ? "#FF7070" : "#5A5A78"}
                  textAnchor={anchor} letterSpacing="0.04em">
                  {label}
                </text>
              </g>
            );
          });
        })}
      </svg>

      {/* Canvas overlay: animated traveling dots on spokes */}
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
            ["SITES",   data.locations.length,   "#3A3A50"],
            ["DEVICES", totalDevices,              "#C4C4D8"],
            ["DOWN",    totalDown, totalDown > 0 ? "#FF4444" : "#3A3A50"],
          ].map(([label, val, color]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 700,
                color, lineHeight: 1 }}>{val}</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: "#28283A",
                letterSpacing: "0.1em", marginTop: 2 }}>{label}</div>
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
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: "#28283A",
              letterSpacing: "0.06em" }}>
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
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#FF6060",
            letterSpacing: "0.1em" }}>
            {totalDown} DEVICE{totalDown !== 1 ? "S" : ""} DOWN — CHECK AFFECTED LOCATIONS
          </span>
        </div>
      ) : (
        <div data-testid="wug-status-ok" style={{ flexShrink: 0, padding: "6px 14px",
          background: "#080F08", border: "1px solid #00FF6622",
          display: "flex", alignItems: "center", gap: 10 }}>
          <CheckCircle2 size={12} color="#00FF66" />
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#00CC44",
            letterSpacing: "0.1em" }}>
            ALL {totalDevices} DEVICES OPERATIONAL ACROSS {data.locations.length} SITES
          </span>
        </div>
      )}

      {/* ── Radial topology (flex:1 — fills remaining height) ── */}
      <RadialTopology locs={locs} />

    </div>
  );
}
