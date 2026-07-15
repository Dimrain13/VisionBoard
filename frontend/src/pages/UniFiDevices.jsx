/**
 * UniFiDevices — CSS-based hierarchical device view per site.
 *
 *  GW/FW  (large card, centered)
 *    |
 *  SW-1    SW-2    SW-3   (switch cards in a flex row)
 *  ├─AP    ├─AP    ├─AP
 *  ├─AP    └─CAM   └─AP
 *  └─CAM
 *
 * No SVG math. Pure CSS flex. Pi-safe.
 * Sub-tabs: [ALL SITES] + one per location. Auto-cycles every 8s (kiosk).
 * Holds main kiosk timer while cycling site tabs via window.__kioskHoldPage.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { RefreshCw } from "lucide-react";

const API      = `${process.env.REACT_APP_BACKEND_URL}/api`;
const CYCLE_MS = 8000; // ms per site tab in kiosk auto-cycle

// ─────────────────────────────────────────────────────────────────────────────
// Colours / labels
// ─────────────────────────────────────────────────────────────────────────────
const TYPE_COLOR = {
  gateway:      "#A78BFA",
  firewall:     "#FF6B35",
  switch:       "#00FF66",
  poe_switch:   "#00CC55",
  access_point: "#00E5FF",
  camera:       "#FFB014",
  device:       "#505068",
};
const tc = t => TYPE_COLOR[t] || TYPE_COLOR.device;
const TYPE_LABEL = {
  gateway:      "GW",
  firewall:     "FW",
  switch:       "SW",
  poe_switch:   "SW",
  access_point: "AP",
  camera:       "CAM",
  device:       "DEV",
};

// ─────────────────────────────────────────────────────────────────────────────
// Build 2-level hierarchy: root + switchGroups + orphans
// ─────────────────────────────────────────────────────────────────────────────
function buildHierarchy(devices) {
  if (!devices?.length) return { root: null, switchGroups: [], orphans: [] };

  const byMac     = {};
  const childrenOf = {};
  const hasParent = new Set();

  devices.forEach(d => { if (d.mac) byMac[d.mac] = d; });
  devices.forEach(d => {
    const p = d.uplink_mac && byMac[d.uplink_mac];
    if (p && p.id !== d.id) {
      if (!childrenOf[p.id]) childrenOf[p.id] = [];
      childrenOf[p.id].push(d);
      hasParent.add(d.id);
    }
  });

  const isInfra = d => ["gateway","firewall","switch","poe_switch"].includes(d.type);

  const roots = devices.filter(d => !hasParent.has(d.id));
  const root  = roots.find(r => ["gateway","firewall"].includes(r.type))
             || roots.find(r => isInfra(r))
             || roots[0] || devices[0];
  if (!root) return { root: null, switchGroups: [], orphans: [] };

  // Flatten all descendants under a node (recursively)
  function allDescendants(nodeId) {
    const kids = childrenOf[nodeId] || [];
    const out  = [];
    kids.forEach(k => { out.push(k); out.push(...allDescendants(k.id)); });
    return out;
  }

  // Fallback: no uplink data — group by type
  if (hasParent.size === 0) {
    const sws = devices.filter(d => isInfra(d) && d.id !== root.id);
    const eps = devices.filter(d => !isInfra(d));
    if (sws.length) {
      const groups = sws.map(sw => ({ sw, endpoints: [] }));
      eps.forEach((ep, i) => groups[i % groups.length].endpoints.push(ep));
      return { root, switchGroups: groups, orphans: [] };
    }
    return { root, switchGroups: [], orphans: eps };
  }

  const switchGroups = [];
  const orphans      = [];
  (childrenOf[root.id] || []).forEach(child => {
    if (isInfra(child)) {
      switchGroups.push({ sw: child, endpoints: allDescendants(child.id) });
    } else {
      orphans.push(child);
    }
  });
  return { root, switchGroups, orphans };
}

// ─────────────────────────────────────────────────────────────────────────────
// DeviceCard — GW/FW (size="large") or Switch (size="medium")
// ─────────────────────────────────────────────────────────────────────────────
function DeviceCard({ device, size = "medium" }) {
  const col     = tc(device.type);
  const isOff   = device.status === "offline";
  const label   = TYPE_LABEL[device.type] || "DEV";
  const isLarge = size === "large";

  return (
    <div style={{
      display:    "flex",
      alignItems: "center",
      gap:        isLarge ? 12 : 8,
      background: "#05050E",
      border:     `1px solid ${isOff ? "#FF2A2A44" : `${col}28`}`,
      borderLeft: `3px solid ${isOff ? "#FF2A2A" : col}`,
      padding:    isLarge ? "10px 20px" : "7px 12px",
      minWidth:   isLarge ? 280 : 150,
      maxWidth:   isLarge ? 560 : 260,
    }}>
      <div style={{
        background:    isOff ? "#FF2A2A20" : `${col}1A`,
        border:        `1px solid ${isOff ? "#FF2A2A44" : `${col}44`}`,
        color:         isOff ? "#FF6666" : col,
        fontFamily:    "'JetBrains Mono',monospace",
        fontSize:      isLarge ? 11 : 9,
        fontWeight:    700,
        padding:       isLarge ? "4px 10px" : "2px 6px",
        letterSpacing: "0.1em",
        flexShrink:    0,
      }}>
        {label}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontFamily:    "'JetBrains Mono',monospace",
          fontSize:      isLarge ? 13 : 11,
          fontWeight:    600,
          color:         isOff ? "#FF8080" : "#C8C8D8",
          overflow:      "hidden",
          textOverflow:  "ellipsis",
          whiteSpace:    "nowrap",
        }}>
          {device.name || device.id}
        </div>
        {device.ip && (
          <div style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontSize:   isLarge ? 9 : 7.5,
            color:      isOff ? "#FF4444" : "#28385A",
            marginTop:  1,
          }}>
            {device.ip}
          </div>
        )}
      </div>
      <div style={{
        width:       isLarge ? 8 : 6,
        height:      isLarge ? 8 : 6,
        borderRadius:"50%",
        background:  isOff ? "#FF2A2A" : col,
        flexShrink:  0,
        boxShadow:   isOff ? "0 0 6px #FF2A2A80" : `0 0 5px ${col}80`,
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EndpointChip — AP / CAM / sub-switch / DEV
// ─────────────────────────────────────────────────────────────────────────────
function EndpointChip({ device }) {
  const col    = tc(device.type);
  const isOff  = device.status === "offline";
  const label  = TYPE_LABEL[device.type] || "DEV";
  const isSubSw= ["switch","poe_switch"].includes(device.type);

  return (
    <div
      title={`${device.name || ""} | ${device.ip || ""} | ${device.status}`}
      style={{
        display:    "flex",
        alignItems: "center",
        gap:        5,
        background: isSubSw ? "#080814" : "#040408",
        border:     `1px solid ${isOff ? "#FF2A2A33" : `${col}22`}`,
        padding:    "3px 8px",
        maxWidth:   150,
      }}
    >
      <div style={{
        width:        5,
        height:       5,
        borderRadius: isSubSw ? 1 : "50%",
        background:   isOff ? "#FF2A2A" : col,
        flexShrink:   0,
        opacity:      isOff ? 1 : 0.85,
      }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontFamily:   "'JetBrains Mono',monospace",
          fontSize:     8.5,
          color:        isOff ? "#FF6666" : "#8090A8",
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap",
        }}>
          {device.name ? device.name.slice(0, 14) : label}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: "#1C2A3A" }}>
          {label}{device.ip ? ` · ${device.ip.split(".").slice(-2).join(".")}` : ""}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-site CSS hierarchy view (replaces SVG tree)
// ─────────────────────────────────────────────────────────────────────────────
function SiteTopologyView({ siteId, name, devices }) {
  const { root, switchGroups, orphans } = buildHierarchy(devices);
  const total    = devices.length;
  const offline  = devices.filter(d => d.status === "offline").length;
  const hasIssue = offline > 0;

  return (
    <div
      data-testid={`unifi-site-${siteId}`}
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      {/* Site sub-header */}
      <div style={{
        padding:      "5px 14px",
        flexShrink:   0,
        background:   hasIssue ? "#080404" : "#040410",
        borderBottom: `1px solid ${hasIssue ? "#FF2A2A22" : "#0C0C1E"}`,
        display:      "flex",
        alignItems:   "center",
        justifyContent: "space-between",
      }}>
        <span style={{
          fontFamily:    "'JetBrains Mono',monospace",
          fontSize:      12,
          fontWeight:    700,
          color:         hasIssue ? "#FF8080" : "#7080A0",
          letterSpacing: "0.2em",
        }}>
          {(name || siteId).toUpperCase()}
        </span>
        <div style={{ display: "flex", gap: 24 }}>
          {[
            ["DEVICES", total,           "#4060A0"],
            ["ONLINE",  total - offline, "#00CC44"],
            ["OFFLINE", offline,         offline > 0 ? "#FF4444" : "#252535"],
          ].map(([l, v, c]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: c, lineHeight: 1 }}>{v}</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: "#252535", letterSpacing: "0.1em", marginTop: 1 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Hierarchy */}
      <div style={{
        flex:           1,
        minHeight:      0,
        overflowY:      "auto",
        padding:        "16px 16px 12px",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        gap:            0,
      }}>
        {/* Root GW/FW */}
        {root ? (
          <DeviceCard device={root} size="large" />
        ) : (
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#3A3A50" }}>
            NO ROOT DEVICE
          </div>
        )}

        {/* Connector root → switches */}
        {(switchGroups.length > 0 || orphans.length > 0) && (
          <div style={{ width: 1, height: 22, background: "#1A3050", flexShrink: 0 }} />
        )}

        {/* Horizontal line across switch tops */}
        {switchGroups.length > 1 && (
          <div style={{ width: "80%", maxWidth: 900, height: 1, background: "#1A3050", flexShrink: 0, marginBottom: 0 }} />
        )}

        {/* Switch columns */}
        {switchGroups.length > 0 && (
          <div style={{
            display:        "flex",
            flexWrap:       "wrap",
            justifyContent: "center",
            gap:            16,
            width:          "100%",
            paddingTop:     switchGroups.length > 1 ? 0 : 0,
          }}>
            {switchGroups.map(({ sw, endpoints }) => (
              <div key={sw.id} style={{
                display:       "flex",
                flexDirection: "column",
                alignItems:    "center",
                gap:           0,
              }}>
                {/* Connector tick from horizontal line */}
                {switchGroups.length > 1 && (
                  <div style={{ width: 1, height: 14, background: "#1A3050", flexShrink: 0 }} />
                )}

                <DeviceCard device={sw} size="medium" />

                {endpoints.length > 0 && (
                  <div style={{ width: 1, height: 12, background: "#1A3050", flexShrink: 0 }} />
                )}

                {endpoints.length > 0 && (
                  <div style={{
                    display:        "flex",
                    flexWrap:       "wrap",
                    justifyContent: "center",
                    gap:            4,
                    maxWidth:       360,
                    padding:        "6px 8px",
                    background:     "#030308",
                    border:         "1px solid #0C0C18",
                  }}>
                    {endpoints.map((ep, ei) => (
                      <EndpointChip key={ep.id || ei} device={ep} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Orphan endpoints — directly on GW, no switch parent */}
        {orphans.length > 0 && (
          <div style={{
            display:        "flex",
            flexWrap:       "wrap",
            justifyContent: "center",
            gap:            4,
            marginTop:      switchGroups.length > 0 ? 12 : 0,
            padding:        "6px 8px",
            background:     "#030308",
            border:         "1px solid #0C0C18",
          }}>
            {orphans.map((ep, ei) => (
              <EndpointChip key={ep.id || ei} device={ep} />
            ))}
          </div>
        )}

        {!root && (
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#252535", marginTop: 40 }}>
            NO DEVICES IN THIS SITE
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compact overview card — used by ALL SITES grid tab
// ─────────────────────────────────────────────────────────────────────────────
const OV_BW = 84, OV_BH = 28, OV_DOT = 12, OV_DGAP = 4;
const OV_LGAP = 44, OV_SGAP = 12, OV_LPAD = 14, OV_TPAD = 12;

function buildOverviewTopology(devices) {
  if (!devices?.length) return { root: null, switchRows: [] };
  const byMac = {};
  devices.forEach(d => { if (d.mac) byMac[d.mac] = d; });
  const childOf = {};
  const hasPar  = new Set();
  devices.forEach(d => {
    const p = d.uplink_mac && byMac[d.uplink_mac];
    if (p && p.id !== d.id) {
      if (!childOf[p.id]) childOf[p.id] = [];
      childOf[p.id].push(d);
      hasPar.add(d.id);
    }
  });

  const isInfra = d => ["gateway","firewall","switch","poe_switch"].includes(d.type);
  const roots   = devices.filter(d => !hasPar.has(d.id));
  const root    = roots.find(r => ["gateway","firewall"].includes(r.type)) || roots[0] || devices[0];

  if (hasPar.size > 0) {
    const directSws = (childOf[root.id] || []).filter(d => isInfra(d));
    return {
      root,
      switchRows: directSws.map(sw => ({ node: sw, endpoints: childOf[sw.id] || [] })),
    };
  }

  const sws = devices.filter(d => isInfra(d) && d.id !== root.id);
  const eps = devices.filter(d => !isInfra(d));
  if (!sws.length) return { root, switchRows: [] };
  const rows = sws.map(sw => ({ node: sw, endpoints: [] }));
  eps.forEach((ep, i) => rows[i % rows.length].endpoints.push(ep));
  return { root, switchRows: rows };
}

function SiteOverviewCard({ siteId, name, devices }) {
  const { root, switchRows } = buildOverviewTopology(devices);
  const total    = devices.length;
  const offline  = devices.filter(d => d.status === "offline").length;
  const hasIssue = offline > 0;

  const maxEpW = switchRows.reduce(
    (m, { endpoints }) => Math.max(m, endpoints.length * (OV_DOT + OV_DGAP) - OV_DGAP), 0
  );
  const svgW = Math.max(OV_LPAD + OV_BW + 32, OV_LPAD + OV_BW + 20 + maxEpW + 16);
  const svgH = OV_TPAD + OV_BH + OV_LGAP + switchRows.length * (OV_BH + OV_SGAP) + 20;
  const spineX    = OV_LPAD + OV_BW / 2;
  const rootY     = OV_TPAD;
  const rowsStartY = rootY + OV_BH + OV_LGAP;

  return (
    <div
      data-testid={`unifi-overview-${siteId}`}
      style={{
        display:       "flex",
        flexDirection: "column",
        background:    "#06060F",
        border:        `1px solid ${hasIssue ? "#FF2A2A22" : "#0C0C1A"}`,
        borderTop:     `2px solid ${hasIssue ? "#FF2A2A" : "#1C3040"}`,
        overflow:      "hidden",
        boxShadow:     hasIssue ? "0 0 14px #FF2A2A12" : "none",
      }}
    >
      <div style={{
        padding:      "6px 10px",
        flexShrink:   0,
        background:   hasIssue ? "#0A0404" : "#070710",
        borderBottom: `1px solid ${hasIssue ? "#FF2A2A1A" : "#0C0C18"}`,
        display:      "flex",
        alignItems:   "center",
        justifyContent: "space-between",
      }}>
        <span style={{
          fontFamily:    "'JetBrains Mono',monospace",
          fontSize:      9.5,
          fontWeight:    700,
          color:         hasIssue ? "#FF8080" : "#7080A0",
          letterSpacing: "0.14em",
        }}>
          {(name || siteId).toUpperCase()}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: "#2A2A3A" }}>
            {total} DEV
          </span>
          {offline > 0 && (
            <span style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize:   8,
              color:      "#FF4444",
              background: "#180808",
              border:     "1px solid #FF2A2A44",
              padding:    "0 5px",
            }}>
              {offline} DOWN
            </span>
          )}
          <div style={{
            width:       7,
            height:      7,
            borderRadius:"50%",
            background:  hasIssue ? "#FF2A2A" : "#00FF66",
            boxShadow:   `0 0 5px ${hasIssue ? "#FF2A2A88" : "#00FF6688"}`,
          }} />
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: "4px 2px" }}>
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: "100%", height: "100%", display: "block" }}
        >
          {root && (() => {
            const col = tc(root.type); const isOff = root.status === "offline";
            return (
              <g key="root">
                <rect x={OV_LPAD} y={rootY} width={OV_BW} height={OV_BH} rx={2}
                  fill="#0A0A16" stroke={isOff ? "#FF2A2A" : col} strokeWidth={1.2} />
                <rect x={OV_LPAD+4} y={rootY+5} width={20} height={OV_BH-10} rx={1}
                  fill={isOff ? "#FF2A2A22" : `${col}22`} />
                <text x={OV_LPAD+14} y={rootY+OV_BH/2+3.5} fontSize={5.5} textAnchor="middle"
                  fill={isOff ? "#FF4444" : col} fontFamily="'JetBrains Mono',monospace" fontWeight={700}>
                  {TYPE_LABEL[root.type] || "??"}
                </text>
                <text x={OV_LPAD+28} y={rootY+OV_BH/2-2} fontSize={6.5}
                  fill={isOff ? "#FF4444" : "#B0B0C0"} fontFamily="'JetBrains Mono',monospace">
                  {(root.name || "").slice(0, 11)}
                </text>
                <text x={OV_LPAD+28} y={rootY+OV_BH/2+7} fontSize={5.5}
                  fill="#2A2A3A" fontFamily="'JetBrains Mono',monospace">
                  {(root.ip || "").slice(0, 14)}
                </text>
                <circle cx={OV_LPAD+OV_BW-7} cy={rootY+OV_BH/2} r={3}
                  fill={isOff ? "#FF2A2A" : col} opacity={0.9} />
              </g>
            );
          })()}

          {switchRows.length > 0 && (
            <line
              x1={spineX} y1={rootY + OV_BH}
              x2={spineX} y2={rowsStartY + (switchRows.length - 1) * (OV_BH + OV_SGAP) + OV_BH / 2}
              stroke="#1A2840" strokeWidth={1}
            />
          )}

          {switchRows.map(({ node: sw, endpoints }, ri) => {
            const rowY  = rowsStartY + ri * (OV_BH + OV_SGAP);
            const col   = tc(sw.type);
            const isOff = sw.status === "offline";
            const epSX  = OV_LPAD + OV_BW + 16;
            const epY   = rowY + OV_BH / 2 - OV_DOT / 2;
            return (
              <g key={sw.id || ri}>
                <line x1={spineX} y1={rowY+OV_BH/2} x2={OV_LPAD} y2={rowY+OV_BH/2}
                  stroke="#1A2840" strokeWidth={1} />
                <rect x={OV_LPAD} y={rowY} width={OV_BW} height={OV_BH} rx={2}
                  fill="#080810" stroke={isOff ? "#FF2A2A" : col} strokeWidth={0.9} />
                <rect x={OV_LPAD+4} y={rowY+5} width={20} height={OV_BH-10} rx={1}
                  fill={isOff ? "#FF2A2A22" : `${col}20`} />
                <text x={OV_LPAD+14} y={rowY+OV_BH/2+3.5} fontSize={5.5} textAnchor="middle"
                  fill={isOff ? "#FF4444" : col} fontFamily="'JetBrains Mono',monospace" fontWeight={700}>
                  {TYPE_LABEL[sw.type] || "SW"}
                </text>
                <text x={OV_LPAD+28} y={rowY+OV_BH/2-2} fontSize={6.5}
                  fill={isOff ? "#FF4444" : "#909090"} fontFamily="'JetBrains Mono',monospace">
                  {(sw.name || "").slice(0, 11)}
                </text>
                <text x={OV_LPAD+28} y={rowY+OV_BH/2+7} fontSize={5.5}
                  fill="#2A2A3A" fontFamily="'JetBrains Mono',monospace">
                  {(sw.ip || "").slice(0, 14)}
                </text>
                <circle cx={OV_LPAD+OV_BW-7} cy={rowY+OV_BH/2} r={3}
                  fill={isOff ? "#FF2A2A" : col} opacity={0.85} />

                {endpoints.length > 0 && (
                  <line x1={OV_LPAD+OV_BW} y1={rowY+OV_BH/2} x2={epSX} y2={rowY+OV_BH/2}
                    stroke="#0E2030" strokeWidth={0.8} />
                )}
                {endpoints.map((ep, ei) => {
                  const ex     = epSX + ei * (OV_DOT + OV_DGAP);
                  const ecol   = tc(ep.type);
                  const isEpOff = ep.status === "offline";
                  return (
                    <g key={ep.id || ei}>
                      <line x1={ex+OV_DOT/2} y1={rowY+OV_BH/2} x2={ex+OV_DOT/2} y2={epY}
                        stroke="#0E2030" strokeWidth={0.7} />
                      <circle cx={ex+OV_DOT/2} cy={epY+OV_DOT/2} r={OV_DOT/2-1}
                        fill={isEpOff ? "#FF2A2A" : ecol} opacity={isEpOff ? 0.9 : 0.75} />
                      <text x={ex+OV_DOT/2} y={epY+OV_DOT+6} fontSize={4.5} textAnchor="middle"
                        fill={isEpOff ? "#FF4444" : ecol} opacity={0.55}
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

// ─────────────────────────────────────────────────────────────────────────────
// Demo sites
// ─────────────────────────────────────────────────────────────────────────────
const mk    = (id, name, type, ip, uplink_mac, offline) => ({
  id, name, type, status: offline ? "offline" : "online", ip, mac: id, uplink_mac,
});
const mkGW  = (id,n,ip)        => mk(id,n,"gateway",     ip,null,false);
const mkSW  = (id,n,ip,up)     => mk(id,n,"switch",      ip,up, false);
const mkPOE = (id,n,ip,up)     => mk(id,n,"poe_switch",  ip,up, false);
const mkAP  = (id,n,ip,up,off) => mk(id,n,"access_point",ip,up, !!off);
const mkCAM = (id,n,ip,up)     => mk(id,n,"camera",      ip,up, false);

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

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function UniFiDevices() {
  const [sites,      setSites]      = useState(DEMO_SITES);
  const [isMock,     setIsMock]     = useState(true);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetch,  setLastFetch]  = useState(null);
  const [activeTab,  setActiveTab]  = useState(null); // null = ALL SITES

  const sitesRef = useRef(sites);
  useEffect(() => { sitesRef.current = sites; }, [sites]);

  // Data fetch
  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res  = await axios.get(`${API}/unifi/devices`, { timeout: 12000 });
      const devs = res.data?.devices ?? [];
      if (devs.length) {
        const bySite = {};
        devs.forEach(d => {
          const key  = d.site_id || d.controller || "default";
          const name = d.site_name || d.controller || key;
          if (!bySite[key]) bySite[key] = { siteId: key, name, devices: [] };
          bySite[key].devices.push(d);
        });
        setSites(Object.values(bySite));
        setIsMock(false);
      } else {
        setSites(DEMO_SITES);
        setIsMock(true);
      }
    } catch {
      setSites(DEMO_SITES);
      setIsMock(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLastFetch(new Date());
    }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, [load]);

  // Kiosk auto-cycle: ALL → site[0] → ... → site[n] → ALL → ...
  // Holds the main kiosk timer while cycling so the rotation doesn't advance mid-cycle.
  useEffect(() => {
    const iv = setInterval(() => {
      setActiveTab(prev => {
        const order = [null, ...sitesRef.current.map(s => s.siteId)];
        const idx   = order.indexOf(prev);
        const next  = order[(idx + 1) % order.length];

        if (next === null) {
          // Back to ALL — release main kiosk
          if (window.__kioskHoldPage) window.__kioskHoldPage(false);
        } else if (prev === null) {
          // Starting site cycle — hold the main kiosk
          if (window.__kioskHoldPage) window.__kioskHoldPage(true);
        }

        return next;
      });
    }, CYCLE_MS);
    return () => {
      clearInterval(iv);
      if (window.__kioskHoldPage) window.__kioskHoldPage(false);
    };
  }, []);

  const totalDevices = sites.reduce((s, c) => s + c.devices.length, 0);
  const totalOffline = sites.reduce((s, c) => s + c.devices.filter(d => d.status === "offline").length, 0);
  const activeSite   = activeTab ? sites.find(s => s.siteId === activeTab) : null;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>

      {/* ── Page header ── */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        flexShrink:     0,
        paddingBottom:  8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <h1 style={{
            fontFamily:    "'JetBrains Mono',monospace",
            fontSize:      13,
            fontWeight:    700,
            color:         "#E2E2E5",
            letterSpacing: "0.18em",
            margin:        0,
          }}>
            UNIFI NETWORK
          </h1>
          {isMock && (
            <span style={{
              fontFamily:    "'JetBrains Mono',monospace",
              fontSize:      7.5,
              color:         "#FFB014",
              background:    "#1A1200",
              border:        "1px solid #FFB01430",
              padding:       "2px 7px",
              letterSpacing: "0.1em",
            }}>
              DEMO DATA
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {[
            ["SITES",   sites.length,  "#3A3A50"],
            ["DEVICES", totalDevices,  "#C4C4D8"],
            ["OFFLINE", totalOffline,  totalOffline > 0 ? "#FF4444" : "#3A3A50"],
          ].map(([label, val, color]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 700, color, lineHeight: 1 }}>{val}</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: "#28283A", letterSpacing: "0.1em", marginTop: 2 }}>{label}</div>
            </div>
          ))}

          {/* Colour legend */}
          <div style={{ display: "flex", gap: 8, borderLeft: "1px solid #1C1C2A", paddingLeft: 16 }}>
            {[["GW","gateway"],["SW","switch"],["AP","access_point"],["CAM","camera"]].map(([label, type]) => (
              <span key={type} style={{
                display:       "flex",
                alignItems:    "center",
                gap:           4,
                fontFamily:    "'JetBrains Mono',monospace",
                fontSize:      7.5,
                color:         TYPE_COLOR[type],
                letterSpacing: "0.06em",
              }}>
                <span style={{
                  width:        7,
                  height:       7,
                  display:      "inline-block",
                  borderRadius: type === "switch" ? 1 : "50%",
                  background:   TYPE_COLOR[type],
                }} />
                {label}
              </span>
            ))}
          </div>

          <button
            data-testid="unifi-refresh-btn"
            onClick={() => load(true)}
            style={{
              background:  "transparent",
              border:      "1px solid #1C1C2A",
              color:       "#3A3A50",
              cursor:      "pointer",
              padding:     "5px 10px",
              display:     "flex",
              alignItems:  "center",
              gap:         6,
              fontFamily:  "'JetBrains Mono',monospace",
              fontSize:    8,
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

      {/* ── Location sub-tab strip ── */}
      <div style={{
        display:      "flex",
        flexShrink:   0,
        borderBottom: "1px solid #0C0C1C",
        background:   "#040408",
        overflowX:    "auto",
      }}>
        {[{ siteId: null, name: "ALL SITES" }, ...sites].map(({ siteId, name }) => {
          const isActive    = activeTab === siteId;
          const siteData    = siteId ? sites.find(s => s.siteId === siteId) : null;
          const siteOffline = siteData
            ? siteData.devices.filter(d => d.status === "offline").length
            : totalOffline;
          const hasIssue = siteOffline > 0;

          return (
            <button
              key={siteId || "all"}
              data-testid={`unifi-tab-${siteId || "all"}`}
              onClick={() => setActiveTab(siteId)}
              style={{
                background:  isActive ? "#08081C" : "transparent",
                border:      "none",
                borderBottom:`2px solid ${isActive ? (hasIssue ? "#FF4444" : "#0080CC") : "transparent"}`,
                color:       isActive ? (hasIssue ? "#FF8080" : "#A0B8D0") : "#3A3A52",
                padding:     "8px 18px",
                cursor:      "pointer",
                flexShrink:  0,
                fontFamily:  "'JetBrains Mono',monospace",
                fontSize:    9.5,
                fontWeight:  isActive ? 700 : 400,
                letterSpacing:"0.12em",
                whiteSpace:  "nowrap",
                display:     "flex",
                alignItems:  "center",
                gap:         8,
              }}
            >
              {(name || siteId).toUpperCase()}
              {siteId && hasIssue && (
                <span style={{
                  background:   "#FF2A2A",
                  color:        "#FFE0E0",
                  borderRadius: 10,
                  padding:      "1px 6px",
                  fontSize:     7.5,
                  fontWeight:   700,
                }}>
                  {siteOffline}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Content area ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {activeTab === null ? (
          <div style={{
            flex:                1,
            minHeight:           0,
            display:             "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gridAutoRows:        "1fr",
            gap:                 8,
            paddingTop:          8,
            overflow:            "hidden",
          }}>
            {sites.map(s => <SiteOverviewCard key={s.siteId} {...s} />)}
          </div>
        ) : activeSite ? (
          <SiteTopologyView key={activeSite.siteId} {...activeSite} />
        ) : null}
      </div>
    </div>
  );
}
