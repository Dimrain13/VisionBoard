/**
 * UniFiDevices — Per-site network topology tree.
 *
 * Vertical spine layout:
 *   [GW/FW]  (top)
 *      |
 *      |── [SW1] ──── ● ● ● ● (APs / Cameras)
 *      |── [SW2] ──── ● ● ● ●
 *      └── [SW3] ──── ● ●
 *
 * Hierarchy built from uplink_mac when available (real data),
 * or from device type grouping (demo data).
 * Pi-safe: static SVG only.
 */
import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { RefreshCw } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── Colours & constants ───────────────────────────────────────────────────────
const TYPE_COLOR = {
  gateway:      "#A78BFA",
  firewall:     "#FF6B35",
  switch:       "#00FF66",
  poe_switch:   "#00CC55",
  access_point: "#00E5FF",
  camera:       "#FFB014",
  device:       "#3A3A50",
};
const tc = t => TYPE_COLOR[t] || TYPE_COLOR.device;

// Abbreviation label for full nodes
const TYPE_LABEL = {
  gateway: "GW", firewall: "FW",
  switch: "SW", poe_switch: "SW",
  access_point: "AP", camera: "CAM", device: "DEV",
};

// Infrastructure types get full boxes; endpoints get mini dots
const isInfra = t => ["gateway","firewall","switch","poe_switch"].includes(t);

// ── Layout constants ──────────────────────────────────────────────────────────
const BW   = 84;   // full box width
const BH   = 28;   // full box height
const DOT  = 14;   // endpoint dot diameter
const DGAP = 5;    // gap between endpoint dots
const LGAP = 44;   // vertical gap between levels
const SGAP = 12;   // vertical gap between switch rows
const LPAD = 14;   // left padding (spine)
const TPAD = 12;   // top padding

// ── Build topology from device list ──────────────────────────────────────────
/**
 * Returns { root, switchRows }
 * root: the gateway/firewall device
 * switchRows: [{ node, endpoints: [...] }]  — one row per switch/infra device
 * If no uplink data, group by type: GW first, switches next, rest as endpoints.
 * If uplink_mac present, use it to build actual parent → child relationships.
 */
function buildTopology(devices) {
  if (!devices?.length) return { root: null, switchRows: [] };

  // Try to use uplink_mac relationships
  const byMac = {};
  devices.forEach(d => { if (d.mac) byMac[d.mac] = d; });
  const hasUplinks = devices.some(d => d.uplink_mac && byMac[d.uplink_mac]);

  if (hasUplinks) {
    // Build parent mapping from uplink_mac
    const childrenOf = {};
    devices.forEach(d => {
      const parent = d.uplink_mac && byMac[d.uplink_mac];
      if (parent) {
        (childrenOf[parent.id] = childrenOf[parent.id] || []).push(d);
      }
    });
    // Root = device with no uplink parent in the device list
    const root = devices.find(d => !d.uplink_mac || !byMac[d.uplink_mac]) || devices[0];
    const switchRows = (childrenOf[root.id] || []).map(sw => ({
      node:      sw,
      endpoints: childrenOf[sw.id] || [],
    }));
    return { root, switchRows };
  }

  // No uplink data — group by device type
  const gws      = devices.filter(d => ["gateway","firewall"].includes(d.type));
  const switches = devices.filter(d => ["switch","poe_switch"].includes(d.type));
  const endpoints = devices.filter(d => !isInfra(d.type));

  const root = gws[0] || switches[0] || devices[0];

  // Distribute endpoints across switches evenly (or put all under root if no switches)
  if (switches.length === 0) {
    return { root, switchRows: endpoints.map(e => ({ node: e, endpoints: [] })) };
  }

  // Round-robin distribute endpoints to switches
  const rows = switches.map(sw => ({ node: sw, endpoints: [] }));
  endpoints.forEach((ep, i) => rows[i % rows.length].endpoints.push(ep));
  return { root, switchRows: rows };
}

// ── Compute SVG dimensions ────────────────────────────────────────────────────
function computeDims(switchRows) {
  // Width: max of (BW) and max endpoint row width
  let maxEndpointRowW = 0;
  switchRows.forEach(({ endpoints }) => {
    const w = endpoints.length * (DOT + DGAP) - DGAP;
    if (w > maxEndpointRowW) maxEndpointRowW = w;
  });
  const contentW = LPAD + BW + 20 + maxEndpointRowW + 16; // spine + SW box + gap + endpoints + right pad
  const svgW = Math.max(contentW, BW + 32);

  // Height: top pad + root + lgap + (switchRows * (BH + SGAP)) + bottom pad
  const svgH = TPAD + BH + LGAP + switchRows.length * (BH + SGAP) + 20;
  return { svgW, svgH };
}

// ── SiteCard ──────────────────────────────────────────────────────────────────
function SiteCard({ siteId, name, devices }) {
  const { root, switchRows } = buildTopology(devices);
  const { svgW, svgH }       = computeDims(switchRows);

  const total   = devices.length;
  const offline = devices.filter(d => d.status === "offline").length;
  const hasIssue = offline > 0;

  // Root box position
  const rootX = LPAD;
  const rootY = TPAD;

  // Spine X = left edge of root box + BW/2 (but keep spine on left for cleaner look)
  const spineX = LPAD + BW / 2;

  // Switch rows start Y
  const rowsStartY = rootY + BH + LGAP;

  return (
    <div
      data-testid={`unifi-site-${siteId}`}
      style={{
        display: "flex", flexDirection: "column",
        background: "#06060F",
        border: `1px solid ${hasIssue ? "#FF2A2A22" : "#0C0C1A"}`,
        borderTop: `2px solid ${hasIssue ? "#FF2A2A" : "#1C3040"}`,
        overflow: "hidden",
        boxShadow: hasIssue ? "0 0 14px #FF2A2A12" : "none",
      }}
    >
      {/* ── Header ── */}
      <div style={{
        padding: "6px 10px",
        borderBottom: `1px solid ${hasIssue ? "#FF2A2A1A" : "#0C0C18"}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0, background: hasIssue ? "#0A0404" : "#070710",
      }}>
        <span style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, fontWeight: 700,
          color: hasIssue ? "#FF8080" : "#7080A0", letterSpacing: "0.14em",
        }}>
          {(name || siteId).toUpperCase()}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: "#2A2A3A" }}>
            {total} DEV
          </span>
          {offline > 0 && (
            <span style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
              color: "#FF4444", background: "#180808",
              border: "1px solid #FF2A2A44", padding: "0 5px",
            }}>
              {offline} DOWN
            </span>
          )}
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: hasIssue ? "#FF2A2A" : "#00FF66",
            boxShadow: `0 0 5px ${hasIssue ? "#FF2A2A88" : "#00FF6688"}`,
          }} />
        </div>
      </div>

      {/* ── Topology SVG ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: "4px 2px" }}>
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          style={{ width: "100%", height: "100%", display: "block" }}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* ── Root node (GW / FW) ── */}
          {root && (() => {
            const col = tc(root.type);
            const isOff = root.status === "offline";
            return (
              <g key="root">
                <rect x={rootX} y={rootY} width={BW} height={BH} rx={2}
                  fill="#0A0A16" stroke={isOff ? "#FF2A2A" : col} strokeWidth={1.2} />
                {/* Type pill */}
                <rect x={rootX + 4} y={rootY + 5} width={20} height={BH - 10} rx={1}
                  fill={isOff ? "#FF2A2A22" : `${col}22`} />
                <text x={rootX + 14} y={rootY + BH / 2 + 3.5}
                  fontSize="5.5" textAnchor="middle" fill={isOff ? "#FF4444" : col}
                  fontFamily="'JetBrains Mono',monospace" fontWeight={700}>
                  {TYPE_LABEL[root.type] || "??"}
                </text>
                {/* Name */}
                <text x={rootX + 28} y={rootY + BH / 2 - 2}
                  fontSize="6.5" fill={isOff ? "#FF4444" : "#B0B0C0"}
                  fontFamily="'JetBrains Mono',monospace">
                  {(root.name || "").slice(0, 11)}
                </text>
                {/* IP */}
                <text x={rootX + 28} y={rootY + BH / 2 + 7}
                  fontSize="5.5" fill="#2A2A3A"
                  fontFamily="'JetBrains Mono',monospace">
                  {(root.ip || "").slice(0, 14)}
                </text>
                {/* Status LED */}
                <circle cx={rootX + BW - 7} cy={rootY + BH / 2} r={3}
                  fill={isOff ? "#FF2A2A" : col}
                  opacity={0.9} />
              </g>
            );
          })()}

          {/* ── Vertical spine from root down to first switch row ── */}
          {switchRows.length > 0 && (
            <line
              x1={spineX} y1={rootY + BH}
              x2={spineX} y2={rowsStartY + (switchRows.length - 1) * (BH + SGAP) + BH / 2}
              stroke="#1A2840" strokeWidth={1}
            />
          )}

          {/* ── Switch rows ── */}
          {switchRows.map(({ node: sw, endpoints }, ri) => {
            const rowY = rowsStartY + ri * (BH + SGAP);
            const swX  = LPAD;
            const col  = tc(sw.type);
            const isOff = sw.status === "offline";

            // Endpoints start after the switch box + connector gap
            const epStartX = swX + BW + 18;
            const epY      = rowY + BH / 2 - DOT / 2;

            return (
              <g key={sw.id || ri}>
                {/* Horizontal branch from spine to switch */}
                <line
                  x1={spineX} y1={rowY + BH / 2}
                  x2={swX}    y2={rowY + BH / 2}
                  stroke="#1A2840" strokeWidth={1}
                />

                {/* Switch box */}
                <rect x={swX} y={rowY} width={BW} height={BH} rx={2}
                  fill="#080810" stroke={isOff ? "#FF2A2A" : col} strokeWidth={0.9} />
                <rect x={swX + 4} y={rowY + 5} width={20} height={BH - 10} rx={1}
                  fill={isOff ? "#FF2A2A22" : `${col}20`} />
                <text x={swX + 14} y={rowY + BH / 2 + 3.5}
                  fontSize="5.5" textAnchor="middle" fill={isOff ? "#FF4444" : col}
                  fontFamily="'JetBrains Mono',monospace" fontWeight={700}>
                  {TYPE_LABEL[sw.type] || "SW"}
                </text>
                <text x={swX + 28} y={rowY + BH / 2 - 2}
                  fontSize="6.5" fill={isOff ? "#FF4444" : "#909090"}
                  fontFamily="'JetBrains Mono',monospace">
                  {(sw.name || "").slice(0, 11)}
                </text>
                <text x={swX + 28} y={rowY + BH / 2 + 7}
                  fontSize="5.5" fill="#2A2A3A"
                  fontFamily="'JetBrains Mono',monospace">
                  {(sw.ip || "").slice(0, 14)}
                </text>
                <circle cx={swX + BW - 7} cy={rowY + BH / 2} r={3}
                  fill={isOff ? "#FF2A2A" : col} opacity={0.85} />

                {/* Horizontal connector from switch to first endpoint */}
                {endpoints.length > 0 && (
                  <line
                    x1={swX + BW} y1={rowY + BH / 2}
                    x2={epStartX}  y2={rowY + BH / 2}
                    stroke="#0E2030" strokeWidth={0.8}
                  />
                )}

                {/* Endpoint dots */}
                {endpoints.map((ep, ei) => {
                  const ex   = epStartX + ei * (DOT + DGAP);
                  const ecol = tc(ep.type);
                  const isEpOff = ep.status === "offline";
                  return (
                    <g key={ep.id || ei}>
                      {/* Connector line from main horizontal bar */}
                      <line
                        x1={ex + DOT / 2} y1={rowY + BH / 2}
                        x2={ex + DOT / 2} y2={epY}
                        stroke="#0E2030" strokeWidth={0.7}
                      />
                      {/* Dot */}
                      <circle
                        cx={ex + DOT / 2} cy={epY + DOT / 2} r={DOT / 2 - 1}
                        fill={isEpOff ? "#FF2A2A" : ecol}
                        opacity={isEpOff ? 0.9 : 0.75}
                      />
                      {/* Tiny type initial below dot */}
                      <text x={ex + DOT / 2} y={epY + DOT + 6}
                        fontSize="4.5" textAnchor="middle"
                        fill={isEpOff ? "#FF4444" : ecol}
                        opacity={0.55}
                        fontFamily="'JetBrains Mono',monospace">
                        {ep.type === "access_point" ? "AP" : ep.type === "camera" ? "C" : "D"}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ── Demo data ─────────────────────────────────────────────────────────────────
function mkGW(id, name, ip)    { return { id, name, type: "gateway",      status: "online",  ip, mac: id }; }
function mkFW(id, name, ip)    { return { id, name, type: "firewall",     status: "online",  ip, mac: id }; }
function mkSW(id, name, ip, up){ return { id, name, type: "switch",       status: "online",  ip, mac: id, uplink_mac: up }; }
function mkPOE(id,name,ip, up) { return { id, name, type: "poe_switch",   status: "online",  ip, mac: id, uplink_mac: up }; }
function mkAP(id, name, ip, up, off){ return { id, name, type: "access_point", status: off?"offline":"online", ip, mac:id, uplink_mac:up }; }
function mkCAM(id,name,ip, up) { return { id, name, type: "camera",       status: "online",  ip, mac: id, uplink_mac: up }; }

const DEMO_SITES = [
  {
    siteId: "novi", name: "Novi HQ",
    devices: [
      mkGW( "n-gw",  "UDM-Pro",      "10.202.1.1"),
      mkSW( "n-sw1", "USW-48-Pro",   "10.202.1.2",  "n-gw"),
      mkPOE("n-sw2", "USW-24-POE-1", "10.202.1.3",  "n-gw"),
      mkPOE("n-sw3", "USW-24-POE-2", "10.202.1.4",  "n-gw"),
      mkAP( "n-a1",  "U6-Pro-01",    "10.202.1.50", "n-sw2"),
      mkAP( "n-a2",  "U6-Pro-02",    "10.202.1.51", "n-sw2"),
      mkAP( "n-a3",  "U6-Pro-03",    "10.202.1.52", "n-sw2"),
      mkAP( "n-a4",  "U6-Pro-04",    "10.202.1.53", "n-sw2"),
      mkAP( "n-a5",  "U6-Pro-05",    "10.202.1.54", "n-sw2"),
      mkAP( "n-a6",  "U6-Pro-06",    "10.202.1.55", "n-sw3"),
      mkAP( "n-a7",  "U6-Pro-07",    "10.202.1.56", "n-sw3"),
      mkAP( "n-a8",  "U6-Pro-08",    "10.202.1.57", "n-sw3"),
      mkAP( "n-a9",  "U6-Pro-09",    "10.202.1.58", "n-sw3"),
      mkAP( "n-a10", "U6-Pro-10",    "10.202.1.59", "n-sw3"),
      mkAP( "n-a11", "U6-Pro-11",    "10.202.1.60", "n-sw3"),
      mkAP( "n-a12", "U6-Pro-12",    "10.202.1.61", "n-sw1"),
      mkAP( "n-a13", "U6-Pro-13",    "10.202.1.62", "n-sw1"),
      mkCAM("n-c1",  "Cam-01",       "10.202.1.70", "n-sw1"),
      mkCAM("n-c2",  "Cam-02",       "10.202.1.71", "n-sw1"),
      mkCAM("n-c3",  "Cam-03",       "10.202.1.72", "n-sw1"),
      mkCAM("n-c4",  "Cam-04",       "10.202.1.73", "n-sw1"),
    ],
  },
  {
    siteId: "canton", name: "Canton",
    devices: [
      mkGW( "k-gw",  "UDM-SE",       "10.202.5.1"),
      mkSW( "k-sw1", "USW-48-Pro",   "10.202.5.2",  "k-gw"),
      mkPOE("k-sw2", "USW-24-POE-1", "10.202.5.3",  "k-gw"),
      mkPOE("k-sw3", "USW-24-POE-2", "10.202.5.4",  "k-gw"),
      mkPOE("k-sw4", "USW-24-POE-3", "10.202.5.5",  "k-gw"),
      mkAP( "k-a1",  "U6-Pro-01",    "10.202.5.50", "k-sw2"),
      mkAP( "k-a2",  "U6-Pro-02",    "10.202.5.51", "k-sw2"),
      mkAP( "k-a3",  "U6-Pro-03",    "10.202.5.52", "k-sw2"),
      mkAP( "k-a4",  "U6-Pro-04",    "10.202.5.53", "k-sw2"),
      mkAP( "k-a5",  "U6-Pro-05",    "10.202.5.54", "k-sw2"),
      mkAP( "k-a6",  "U6-Pro-06",    "10.202.5.55", "k-sw2"),
      mkAP( "k-a7",  "U6-Pro-07",    "10.202.5.56", "k-sw3"),
      mkAP( "k-a8",  "U6-Pro-08",    "10.202.5.57", "k-sw3", true),
      mkAP( "k-a9",  "U6-Pro-09",    "10.202.5.58", "k-sw3"),
      mkAP( "k-a10", "U6-Pro-10",    "10.202.5.59", "k-sw3"),
      mkAP( "k-a11", "U6-Pro-11",    "10.202.5.60", "k-sw3"),
      mkAP( "k-a12", "U6-Pro-12",    "10.202.5.61", "k-sw4"),
      mkAP( "k-a13", "U6-Pro-13",    "10.202.5.62", "k-sw4"),
      mkAP( "k-a14", "U6-Pro-14",    "10.202.5.63", "k-sw4"),
      mkAP( "k-a15", "U6-Pro-15",    "10.202.5.64", "k-sw4"),
      mkAP( "k-a16", "U6-Pro-16",    "10.202.5.65", "k-sw4"),
      mkCAM("k-c1",  "Cam-01",       "10.202.5.70", "k-sw1"),
      mkCAM("k-c2",  "Cam-02",       "10.202.5.71", "k-sw1"),
      mkCAM("k-c3",  "Cam-03",       "10.202.5.72", "k-sw1"),
      mkCAM("k-c4",  "Cam-04",       "10.202.5.73", "k-sw1"),
      mkCAM("k-c5",  "Cam-05",       "10.202.5.74", "k-sw1"),
      mkCAM("k-c6",  "Cam-06",       "10.202.5.75", "k-sw1"),
    ],
  },
  {
    siteId: "remus", name: "Remus",
    devices: [
      mkGW( "r-gw",  "USG-Pro",      "10.202.2.1"),
      mkPOE("r-sw1", "USW-24-POE-1", "10.202.2.2",  "r-gw"),
      mkPOE("r-sw2", "USW-24-POE-2", "10.202.2.3",  "r-gw"),
      mkAP( "r-a1",  "U6-Lite-01",   "10.202.2.50", "r-sw1", true),
      mkAP( "r-a2",  "U6-Lite-02",   "10.202.2.51", "r-sw1"),
      mkAP( "r-a3",  "U6-Lite-03",   "10.202.2.52", "r-sw1"),
      mkAP( "r-a4",  "U6-Lite-04",   "10.202.2.53", "r-sw1"),
      mkAP( "r-a5",  "U6-Lite-05",   "10.202.2.54", "r-sw2"),
      mkAP( "r-a6",  "U6-Lite-06",   "10.202.2.55", "r-sw2"),
      mkAP( "r-a7",  "U6-Lite-07",   "10.202.2.56", "r-sw2"),
      mkCAM("r-c1",  "Cam-01",       "10.202.2.70", "r-sw1"),
      mkCAM("r-c2",  "Cam-02",       "10.202.2.71", "r-sw2"),
    ],
  },
  {
    siteId: "mt-pleasant", name: "Mt. Pleasant",
    devices: [
      mkGW( "m-gw",  "USG",          "10.202.3.1"),
      mkPOE("m-sw1", "USW-24-POE-1", "10.202.3.2",  "m-gw"),
      mkPOE("m-sw2", "USW-24-POE-2", "10.202.3.3",  "m-gw"),
      mkAP( "m-a1",  "U6-Pro-01",    "10.202.3.50", "m-sw1"),
      mkAP( "m-a2",  "U6-Pro-02",    "10.202.3.51", "m-sw1"),
      mkAP( "m-a3",  "U6-Pro-03",    "10.202.3.52", "m-sw1"),
      mkAP( "m-a4",  "U6-Pro-04",    "10.202.3.53", "m-sw1"),
      mkAP( "m-a5",  "U6-Pro-05",    "10.202.3.54", "m-sw1"),
      mkAP( "m-a6",  "U6-Pro-06",    "10.202.3.55", "m-sw2"),
      mkAP( "m-a7",  "U6-Pro-07",    "10.202.3.56", "m-sw2"),
      mkAP( "m-a8",  "U6-Pro-08",    "10.202.3.57", "m-sw2"),
      mkAP( "m-a9",  "U6-Pro-09",    "10.202.3.58", "m-sw2"),
      mkAP( "m-a10", "U6-Pro-10",    "10.202.3.59", "m-sw2"),
      mkCAM("m-c1",  "Cam-01",       "10.202.3.70", "m-sw1"),
      mkCAM("m-c2",  "Cam-02",       "10.202.3.71", "m-sw1"),
      mkCAM("m-c3",  "Cam-03",       "10.202.3.72", "m-sw2"),
    ],
  },
  {
    siteId: "canton-whs", name: "Canton WHS",
    devices: [
      mkGW( "cw-gw",  "USG",         "10.202.6.1"),
      mkPOE("cw-sw1", "USW-24-POE",  "10.202.6.2",  "cw-gw"),
      mkPOE("cw-sw2", "USW-16-POE",  "10.202.6.3",  "cw-gw"),
      mkAP( "cw-a1",  "U6-Lite-01",  "10.202.6.50", "cw-sw1"),
      mkAP( "cw-a2",  "U6-Lite-02",  "10.202.6.51", "cw-sw1"),
      mkAP( "cw-a3",  "U6-Lite-03",  "10.202.6.52", "cw-sw1"),
      mkAP( "cw-a4",  "U6-Lite-04",  "10.202.6.53", "cw-sw1"),
      mkAP( "cw-a5",  "U6-Lite-05",  "10.202.6.54", "cw-sw2"),
      mkAP( "cw-a6",  "U6-Lite-06",  "10.202.6.55", "cw-sw2"),
      mkAP( "cw-a7",  "U6-Lite-07",  "10.202.6.56", "cw-sw2"),
      mkCAM("cw-c1",  "Cam-01",      "10.202.6.70", "cw-sw1"),
      mkCAM("cw-c2",  "Cam-02",      "10.202.6.71", "cw-sw2"),
    ],
  },
  {
    siteId: "constantine", name: "Constantine",
    devices: [
      mkGW( "c-gw",  "USG",          "10.202.4.1"),
      mkPOE("c-sw1", "USW-24-POE",   "10.202.4.2",  "c-gw"),
      mkAP( "c-a1",  "U6-Lite-01",   "10.202.4.50", "c-sw1"),
      mkAP( "c-a2",  "U6-Lite-02",   "10.202.4.51", "c-sw1"),
      mkAP( "c-a3",  "U6-Lite-03",   "10.202.4.52", "c-sw1"),
      mkAP( "c-a4",  "U6-Lite-04",   "10.202.4.53", "c-sw1"),
      mkAP( "c-a5",  "U6-Lite-05",   "10.202.4.54", "c-sw1"),
      mkAP( "c-a6",  "U6-Lite-06",   "10.202.4.55", "c-sw1"),
      mkCAM("c-c1",  "Cam-01",       "10.202.4.70", "c-sw1"),
    ],
  },
  {
    siteId: "ovid", name: "Ovid",
    devices: [
      mkGW( "o-gw",  "USG",          "10.202.7.1"),
      mkPOE("o-sw1", "USW-16-POE",   "10.202.7.2",  "o-gw"),
      mkAP( "o-a1",  "U6-Lite-01",   "10.202.7.50", "o-sw1"),
      mkAP( "o-a2",  "U6-Lite-02",   "10.202.7.51", "o-sw1"),
      mkAP( "o-a3",  "U6-Lite-03",   "10.202.7.52", "o-sw1"),
      mkAP( "o-a4",  "U6-Lite-04",   "10.202.7.53", "o-sw1"),
      mkCAM("o-c1",  "Cam-01",       "10.202.7.70", "o-sw1"),
    ],
  },
  {
    siteId: "middlebury", name: "Middlebury",
    devices: [
      mkGW( "mb-gw",  "USG",         "10.202.8.1"),
      mkPOE("mb-sw1", "USW-24-POE",  "10.202.8.2",  "mb-gw"),
      mkPOE("mb-sw2", "USW-16-POE",  "10.202.8.3",  "mb-gw"),
      mkAP( "mb-a1",  "U6-Lite-01",  "10.202.8.50", "mb-sw1"),
      mkAP( "mb-a2",  "U6-Lite-02",  "10.202.8.51", "mb-sw1"),
      mkAP( "mb-a3",  "U6-Lite-03",  "10.202.8.52", "mb-sw1"),
      mkAP( "mb-a4",  "U6-Lite-04",  "10.202.8.53", "mb-sw2"),
      mkAP( "mb-a5",  "U6-Lite-05",  "10.202.8.54", "mb-sw2"),
      mkAP( "mb-a6",  "U6-Lite-06",  "10.202.8.55", "mb-sw2"),
      mkAP( "mb-a7",  "U6-Lite-07",  "10.202.8.56", "mb-sw2"),
      mkCAM("mb-c1",  "Cam-01",      "10.202.8.70", "mb-sw1"),
      mkCAM("mb-c2",  "Cam-02",      "10.202.8.71", "mb-sw2"),
    ],
  },
];

// ── Backend normalization adds uplink_mac — wire it through ──────────────────
// (server.py _norm_unifi_device already returns uplink_mac)

// ── Main page ─────────────────────────────────────────────────────────────────
export default function UniFiDevices() {
  const [siteCards,  setSiteCards]  = useState(DEMO_SITES);
  const [isMock,     setIsMock]     = useState(true);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetch,  setLastFetch]  = useState(null);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await axios.get(`${API}/unifi/devices`, { timeout: 12000 });
      const devs = res.data?.devices ?? [];
      if (devs.length) {
        const bySite = {};
        devs.forEach(d => {
          const key  = d.site_id || d.controller || "default";
          const name = d.site_name || d.controller || key;
          if (!bySite[key]) bySite[key] = { siteId: key, name, devices: [] };
          bySite[key].devices.push(d);
        });
        setSiteCards(Object.values(bySite));
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

  useEffect(() => {
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, [load]);

  const total   = siteCards.reduce((s, c) => s + c.devices.length, 0);
  const offline = siteCards.reduce((s, c) => s + c.devices.filter(d => d.status === "offline").length, 0);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <h1 style={{
            fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700,
            color: "#E2E2E5", letterSpacing: "0.18em",
          }}>
            UNIFI NETWORK
          </h1>
          {isMock && (
            <span style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5, color: "#FFB014",
              background: "#1A1200", border: "1px solid #FFB01430",
              padding: "2px 7px", letterSpacing: "0.1em",
            }}>
              DEMO DATA
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {[
            ["SITES",   siteCards.length, "#3A3A50"],
            ["DEVICES", total,            "#C4C4D8"],
            ["OFFLINE", offline,          offline > 0 ? "#FF4444" : "#3A3A50"],
          ].map(([label, val, color]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: "#28283A", letterSpacing: "0.1em", marginTop: 2 }}>{label}</div>
            </div>
          ))}

          {/* Legend */}
          <div style={{ display: "flex", gap: 8, borderLeft: "1px solid #1C1C2A", paddingLeft: 16 }}>
            {[["GW","gateway"],["SW","switch"],["AP","access_point"],["CAM","camera"]].map(([label, type]) => (
              <span key={type} style={{ display: "flex", alignItems: "center", gap: 4,
                fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5, color: TYPE_COLOR[type], letterSpacing: "0.06em" }}>
                <span style={{ width: 7, height: 7, borderRadius: type === "switch" ? 1 : "50%", background: TYPE_COLOR[type], display: "inline-block" }} />
                {label}
              </span>
            ))}
          </div>

          <button
            data-testid="unifi-refresh-btn"
            onClick={() => load(true)}
            style={{
              background: "transparent", border: "1px solid #1C1C2A", color: "#3A3A50",
              cursor: "pointer", padding: "5px 10px",
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
            }}
          >
            <RefreshCw size={10} style={{ animation: (loading || refreshing) ? "spin 1s linear infinite" : "none" }} />
            REFRESH
          </button>

          {lastFetch && (
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: "#28283A" }}>
              {lastFetch.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* ── Site grid — 4 columns ── */}
      <div style={{
        flex: 1, minHeight: 0,
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gridAutoRows: "1fr",
        gap: 8,
      }}>
        {siteCards.map(s => <SiteCard key={s.siteId} {...s} />)}
      </div>

    </div>
  );
}
