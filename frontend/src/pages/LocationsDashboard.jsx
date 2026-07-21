/**
 * LocationsDashboard — Per-location status dashboard
 *
 * MAP tab:  Michigan SVG with colored status dots for each site
 * Site tabs: Non-IT-friendly dashboard per location
 *   - Overall RAG status badge
 *   - Internet circuits (is the internet up?)
 *   - Network health (devices online/offline)
 *   - Open tickets / requests
 *   - Active alerts
 *
 * Kiosk: cycles MAP → site[0] → ... → site[n] → MAP
 *        holds main kiosk timer while cycling sub-tabs
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { RefreshCw, Wifi, WifiOff, Monitor, AlertTriangle, CheckCircle, Ticket } from "lucide-react";

const API      = `${process.env.REACT_APP_BACKEND_URL}/api`;
const CYCLE_MS = 9000;

// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS_COLOR  = { ok: "#00FF66", warning: "#FFB014", critical: "#FF2A2A", unknown: "#3A3A52" };
const STATUS_BG     = { ok: "#001A06", warning: "#1A0E00", critical: "#1A0000", unknown: "#0A0A10" };
const STATUS_LABEL  = {
  ok:       "All Systems Operational",
  warning:  "Minor Issues Detected",
  critical: "Critical Issue — IT Responding",
  unknown:  "Status Unknown",
};

// ── Michigan Lower-Peninsula SVG path (480×520 canvas, ~32 control points) ───
const MICHIGAN_LP = `
  M 96,499 L 72,478 L 48,452 L 32,420 L 26,382 L 24,342 L 28,302 L 40,262
  L 56,228 L 76,198 L 98,170 L 120,148 L 148,124 L 176,100 L 206,78
  L 236,62 L 258,52 L 278,58 L 308,72 L 332,96 L 352,132 L 368,174
  L 382,222 L 372,268 L 344,302 L 322,320 L 336,334 L 358,322
  L 400,258 L 438,298 L 448,352 L 440,404 L 418,442 L 410,476 L 392,499 Z
`;

// ── Approximate city coordinates on the 480×520 Michigan SVG canvas ───────────
// Formula: x = (lon+88)/6*480,  y = (46.5−lat)/5*520
const LOCATION_COORDS = {
  "Novi":              { x: 362, y: 419 },
  "Canton Plant":      { x: 362, y: 438 },
  "Canton Warehouse":  { x: 352, y: 452 },
  "Remus":             { x: 228, y: 304 },
  "Mt. Pleasant":      { x: 256, y: 302 },
  "Constantine":       { x: 184, y: 486 },
  "Ovid":              { x: 290, y: 366 },
  "Middlebury":        { x: 196, y: 472 },
};

function getCoords(name) {
  if (LOCATION_COORDS[name]) return LOCATION_COORDS[name];
  // Fuzzy: first key that starts with the same first word
  const firstWord = name.split(" ")[0].toLowerCase();
  const match = Object.keys(LOCATION_COORDS).find(k => k.toLowerCase().startsWith(firstWord));
  return match ? LOCATION_COORDS[match] : { x: 240, y: 300 };
}

// ── Michigan Map overview ─────────────────────────────────────────────────────
function MichiganMap({ locations, onSelectLocation }) {
  const critical = locations.filter(l => l.status === "critical").length;
  const warning  = locations.filter(l => l.status === "warning").length;
  const ok       = locations.filter(l => l.status === "ok").length;

  return (
    <div style={{ display: "flex", gap: 20, height: "100%", overflow: "hidden" }}>
      {/* SVG map */}
      <div style={{
        flex: "0 0 auto",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#030308",
        border: "1px solid #0C0C1C",
        padding: "12px",
      }}>
        <svg
          viewBox="0 0 480 520"
          width={420}
          height={455}
          style={{ display: "block", overflow: "visible" }}
        >
          {/* State fill */}
          <path d={MICHIGAN_LP} fill="#07070F" stroke="#1A3050" strokeWidth={1.5} />

          {/* Location dots */}
          {locations.map(loc => {
            const { x, y } = getCoords(loc.name);
            const col       = STATUS_COLOR[loc.status] || STATUS_COLOR.unknown;
            const isDown    = loc.status === "critical";

            return (
              <g
                key={loc.id}
                style={{ cursor: "pointer" }}
                onClick={() => onSelectLocation(loc.id)}
              >
                {/* Pulse ring for critical */}
                {isDown && (
                  <circle cx={x} cy={y} r={14} fill="none" stroke="#FF2A2A" strokeWidth={1}
                    opacity={0.4} />
                )}
                {/* Main dot */}
                <circle cx={x} cy={y} r={7} fill={col} opacity={0.9}
                  style={{ filter: `drop-shadow(0 0 5px ${col})` }} />
                {/* Label */}
                <text
                  x={x + 11} y={y + 4}
                  fontSize={9} fill={col} opacity={0.85}
                  fontFamily="'JetBrains Mono',monospace"
                  style={{ userSelect: "none" }}
                >
                  {loc.name}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Map title */}
        <div style={{
          position: "absolute",
          bottom: 14,
          left: 16,
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 8,
          color: "#1C2A3A",
          letterSpacing: "0.18em",
        }}>
          MICHIGAN OPERATIONS
        </div>
      </div>

      {/* Right: status summary + location list */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minWidth: 0, overflowY: "auto" }}>
        {/* Summary pills */}
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          {[
            ["SITES",    locations.length, "#3A3A52"],
            ["OK",       ok,               "#00FF66"],
            ["WARNING",  warning,          "#FFB014"],
            ["CRITICAL", critical,         critical > 0 ? "#FF2A2A" : "#3A3A52"],
          ].map(([label, val, col]) => (
            <div key={label} style={{
              background: "#06060F",
              border:     `1px solid ${col}28`,
              padding:    "8px 16px",
              flex:       1,
              textAlign:  "center",
            }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 700, color: col, lineHeight: 1 }}>
                {val}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5, color: "#252535", letterSpacing: "0.12em", marginTop: 3 }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Location cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
          {locations.map(loc => {
            const col        = STATUS_COLOR[loc.status] || STATUS_COLOR.unknown;
            const circuitUp  = loc.circuits.filter(c => c.status === "up").length;
            const circuitTot = loc.circuits.length;
            const netOffline = loc.network.offline;

            return (
              <button
                key={loc.id}
                data-testid={`loc-overview-${loc.id}`}
                onClick={() => onSelectLocation(loc.id)}
                style={{
                  display:     "flex",
                  alignItems:  "center",
                  gap:         14,
                  background:  STATUS_BG[loc.status] || "#06060F",
                  border:      `1px solid ${col}28`,
                  borderLeft:  `3px solid ${col}`,
                  padding:     "10px 14px",
                  cursor:      "pointer",
                  textAlign:   "left",
                  width:       "100%",
                }}
              >
                {/* Status dot */}
                <div style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: col, flexShrink: 0,
                  boxShadow: `0 0 6px ${col}80`,
                }} />

                {/* Location name */}
                <div style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize:   11,
                  fontWeight: 700,
                  color:      "#D0D0D8",
                  minWidth:   130,
                  flexShrink: 0,
                }}>
                  {loc.name.toUpperCase()}
                </div>

                {/* Internet */}
                <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1 }}>
                  {circuitTot === 0 ? (
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8.5, color: "#3A3A52" }}>No circuits configured</span>
                  ) : circuitUp === circuitTot ? (
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8.5, color: "#00CC44" }}>
                      INTERNET: {circuitUp}/{circuitTot} UP
                    </span>
                  ) : (
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8.5, color: "#FF4444" }}>
                      INTERNET: {circuitUp}/{circuitTot} UP
                    </span>
                  )}
                </div>

                {/* Network */}
                {loc.network.total > 0 && (
                  <div style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize:   8.5,
                    color:      netOffline > 0 ? "#FF8844" : "#3A3A52",
                    minWidth:   100,
                    textAlign:  "right",
                  }}>
                    {netOffline > 0 ? `${netOffline} DEVICE${netOffline !== 1 ? "S" : ""} DOWN` : `${loc.network.total} DEVICES OK`}
                  </div>
                )}

                {/* Tickets */}
                {loc.tickets.open > 0 && (
                  <div style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize:   8,
                    color:      loc.tickets.critical > 0 ? "#FF4444" : "#FFB014",
                    background: loc.tickets.critical > 0 ? "#1A0000" : "#140C00",
                    border:     `1px solid ${loc.tickets.critical > 0 ? "#FF2A2A44" : "#FFB01444"}`,
                    padding:    "2px 8px",
                    flexShrink: 0,
                  }}>
                    {loc.tickets.open} TICKET{loc.tickets.open !== 1 ? "S" : ""}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Circuit card ───────────────────────────────────────────────────────────────
function CircuitCard({ circuit }) {
  const isUp      = circuit.status === "up";
  const isDown    = circuit.status === "down";
  const col       = isDown ? "#FF2A2A" : isUp ? "#00FF66" : "#FFB014";
  const bw        = circuit.bandwidth_mbps >= 1000
    ? `${circuit.bandwidth_mbps / 1000} Gbps`
    : `${circuit.bandwidth_mbps || "??"} Mbps`;

  return (
    <div style={{
      display:     "flex",
      alignItems:  "center",
      gap:         10,
      background:  isDown ? "#0A0202" : "#050510",
      border:      `1px solid ${col}28`,
      borderLeft:  `3px solid ${col}`,
      padding:     "10px 14px",
      marginBottom: 6,
    }}>
      {isDown
        ? <WifiOff size={16} style={{ color: col, flexShrink: 0 }} />
        : <Wifi    size={16} style={{ color: col, flexShrink: 0 }} />
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontSize:   11,
          fontWeight: 600,
          color:      isDown ? "#FF8080" : "#C8C8D8",
        }}>
          {circuit.provider || "Unknown Provider"}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: "#28385A", marginTop: 2 }}>
          {circuit.circuit_id && `${circuit.circuit_id} · `}{bw}
          {circuit.ip && ` · ${circuit.ip}`}
        </div>
      </div>
      <div style={{
        fontFamily:    "'JetBrains Mono',monospace",
        fontSize:      10,
        fontWeight:    700,
        color:         col,
        letterSpacing: "0.1em",
        background:    `${col}18`,
        border:        `1px solid ${col}44`,
        padding:       "3px 10px",
      }}>
        {(circuit.status || "UNKNOWN").toUpperCase()}
      </div>
    </div>
  );
}

// ── Ticket row ────────────────────────────────────────────────────────────────
function TicketRow({ ticket }) {
  const isCrit = (ticket.priority || "").toLowerCase() === "critical";
  const col    = isCrit ? "#FF4444" : "#FFB014";

  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          10,
      padding:      "7px 10px",
      background:   isCrit ? "#0A0202" : "#060608",
      borderBottom: "1px solid #0C0C18",
    }}>
      <div style={{
        fontFamily:    "'JetBrains Mono',monospace",
        fontSize:      7.5,
        color:         col,
        background:    `${col}18`,
        border:        `1px solid ${col}44`,
        padding:       "1px 6px",
        flexShrink:    0,
        letterSpacing: "0.08em",
      }}>
        {(ticket.priority || "OPEN").toUpperCase()}
      </div>
      <div style={{
        fontFamily:   "'JetBrains Mono',monospace",
        fontSize:     9.5,
        color:        "#A0A0B8",
        flex:         1,
        overflow:     "hidden",
        textOverflow: "ellipsis",
        whiteSpace:   "nowrap",
      }}>
        {ticket.title || "No title"}
      </div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5, color: "#28384A", flexShrink: 0 }}>
        {ticket.status?.toUpperCase()}
      </div>
    </div>
  );
}

// ── Per-location dashboard ────────────────────────────────────────────────────
function LocationView({ loc }) {
  const col       = STATUS_COLOR[loc.status] || STATUS_COLOR.unknown;
  const circuitUp = loc.circuits.filter(c => c.status === "up").length;
  const circuitTot= loc.circuits.length;
  const allUp     = circuitUp === circuitTot && circuitTot > 0;
  const anyDown   = loc.circuits.some(c => c.status === "down");

  return (
    <div
      data-testid={`loc-dashboard-${loc.id}`}
      style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12, overflow: "hidden" }}
    >
      {/* Status banner */}
      <div style={{
        flexShrink:   0,
        background:   STATUS_BG[loc.status],
        border:       `1px solid ${col}28`,
        borderLeft:   `4px solid ${col}`,
        padding:      "12px 20px",
        display:      "flex",
        alignItems:   "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {loc.status === "ok"
            ? <CheckCircle   size={24} style={{ color: col }} />
            : <AlertTriangle size={24} style={{ color: col }} />
          }
          <div>
            <div style={{
              fontFamily:    "'JetBrains Mono',monospace",
              fontSize:      18,
              fontWeight:    700,
              color:         col,
              letterSpacing: "0.12em",
              lineHeight:    1,
            }}>
              {loc.name.toUpperCase()}
            </div>
            <div style={{
              fontFamily:    "'JetBrains Mono',monospace",
              fontSize:      10,
              color:         `${col}AA`,
              letterSpacing: "0.08em",
              marginTop:     4,
            }}>
              {STATUS_LABEL[loc.status] || STATUS_LABEL.unknown}
            </div>
          </div>
        </div>
        {/* Quick stats */}
        <div style={{ display: "flex", gap: 28 }}>
          {[
            ["CIRCUITS", circuitTot,         "#4060A0"],
            ["ONLINE",   circuitUp,           "#00CC44"],
            ["DEVICES",  loc.network.total,   "#4060A0"],
            ["TICKETS",  loc.tickets.open,    loc.tickets.critical > 0 ? "#FF4444" : loc.tickets.open > 0 ? "#FFB014" : "#3A3A52"],
          ].map(([label, val, c]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 700, color: c, lineHeight: 1 }}>{val}</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: "#252535", letterSpacing: "0.12em", marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 3-column grid */}
      <div style={{
        flex:                1,
        minHeight:           0,
        display:             "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap:                 12,
        overflow:            "hidden",
      }}>
        {/* Internet */}
        <div style={{ display: "flex", flexDirection: "column", background: "#04040C", border: "1px solid #0C0C1C", overflow: "hidden" }}>
          <div style={{
            padding:      "8px 14px",
            flexShrink:   0,
            borderBottom: "1px solid #0C0C1C",
            display:      "flex",
            alignItems:   "center",
            gap:          8,
            background:   anyDown ? "#080404" : "#040410",
          }}>
            {anyDown
              ? <WifiOff size={12} style={{ color: "#FF2A2A" }} />
              : <Wifi    size={12} style={{ color: "#00CC44" }} />
            }
            <span style={{
              fontFamily:    "'JetBrains Mono',monospace",
              fontSize:      9,
              fontWeight:    700,
              color:         anyDown ? "#FF8080" : "#608090",
              letterSpacing: "0.18em",
            }}>
              INTERNET CIRCUITS
            </span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
            {loc.circuits.length === 0 ? (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#252535", padding: 8 }}>
                No circuits configured for this location
              </div>
            ) : (
              loc.circuits.map((c, i) => <CircuitCard key={i} circuit={c} />)
            )}
          </div>
          {/* Summary footer */}
          {loc.circuits.length > 0 && (
            <div style={{
              padding:   "6px 14px",
              flexShrink: 0,
              borderTop: "1px solid #0C0C1C",
              fontFamily: "'JetBrains Mono',monospace",
              fontSize:  8,
              color:     allUp ? "#00CC44" : "#FF4444",
            }}>
              {allUp ? `All ${circuitTot} circuit${circuitTot !== 1 ? "s" : ""} operational`
                     : `${circuitTot - circuitUp} of ${circuitTot} circuits down`}
            </div>
          )}
        </div>

        {/* Network */}
        <div style={{ display: "flex", flexDirection: "column", background: "#04040C", border: "1px solid #0C0C1C", overflow: "hidden" }}>
          <div style={{
            padding:      "8px 14px",
            flexShrink:   0,
            borderBottom: "1px solid #0C0C1C",
            display:      "flex",
            alignItems:   "center",
            gap:          8,
            background:   loc.network.offline > 0 ? "#060410" : "#040410",
          }}>
            <Monitor size={12} style={{ color: loc.network.offline > 0 ? "#FF8844" : "#608090" }} />
            <span style={{
              fontFamily:    "'JetBrains Mono',monospace",
              fontSize:      9,
              fontWeight:    700,
              color:         loc.network.offline > 0 ? "#FF8080" : "#608090",
              letterSpacing: "0.18em",
            }}>
              NETWORK DEVICES
            </span>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 16, padding: 20 }}>
            {loc.network.total === 0 ? (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#252535", textAlign: "center" }}>
                No device data available
              </div>
            ) : (
              <>
                {/* Big online indicator */}
                <div style={{ textAlign: "center" }}>
                  <div style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize:   48,
                    fontWeight: 700,
                    lineHeight: 1,
                    color:      loc.network.offline > 0 ? "#FF8844" : "#00FF66",
                  }}>
                    {loc.network.online}
                  </div>
                  <div style={{
                    fontFamily:    "'JetBrains Mono',monospace",
                    fontSize:      8,
                    color:         "#252535",
                    letterSpacing: "0.14em",
                    marginTop:     4,
                  }}>
                    DEVICES ONLINE
                  </div>
                </div>
                {/* Divider */}
                <div style={{ width: 40, height: 1, background: "#1A1A28" }} />
                {/* Offline */}
                <div style={{ textAlign: "center" }}>
                  <div style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize:   28,
                    fontWeight: 700,
                    lineHeight: 1,
                    color:      loc.network.offline > 0 ? "#FF4444" : "#1A1A28",
                  }}>
                    {loc.network.offline}
                  </div>
                  <div style={{
                    fontFamily:    "'JetBrains Mono',monospace",
                    fontSize:      8,
                    color:         "#1A1A28",
                    letterSpacing: "0.14em",
                    marginTop:     2,
                  }}>
                    OFFLINE
                  </div>
                </div>
                {/* Total bar */}
                <div style={{ width: "80%", background: "#0A0A16", height: 6, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    height:     "100%",
                    width:      `${loc.network.total > 0 ? (loc.network.online / loc.network.total) * 100 : 0}%`,
                    background: loc.network.offline > 0 ? "#FF8844" : "#00FF66",
                    borderRadius: 3,
                  }} />
                </div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: "#28384A" }}>
                  {loc.network.total} TOTAL DEVICES
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tickets */}
        <div style={{ display: "flex", flexDirection: "column", background: "#04040C", border: "1px solid #0C0C1C", overflow: "hidden" }}>
          <div style={{
            padding:      "8px 14px",
            flexShrink:   0,
            borderBottom: "1px solid #0C0C1C",
            display:      "flex",
            alignItems:   "center",
            justifyContent: "space-between",
            background:   loc.tickets.critical > 0 ? "#080404" : "#040410",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Ticket size={12} style={{ color: loc.tickets.critical > 0 ? "#FF4444" : "#608090" }} />
              <span style={{
                fontFamily:    "'JetBrains Mono',monospace",
                fontSize:      9,
                fontWeight:    700,
                color:         loc.tickets.critical > 0 ? "#FF8080" : "#608090",
                letterSpacing: "0.18em",
              }}>
                OPEN REQUESTS
              </span>
            </div>
            {loc.tickets.open > 0 && (
              <span style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize:   9,
                fontWeight: 700,
                color:      loc.tickets.critical > 0 ? "#FF4444" : "#FFB014",
                background: loc.tickets.critical > 0 ? "#180404" : "#140C00",
                border:     `1px solid ${loc.tickets.critical > 0 ? "#FF2A2A44" : "#FFB01444"}`,
                padding:    "2px 8px",
              }}>
                {loc.tickets.open}
              </span>
            )}
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loc.tickets.items.length === 0 ? (
              <div style={{
                display:    "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height:     "100%",
                gap:        8,
                padding:    20,
              }}>
                <CheckCircle size={28} style={{ color: "#00FF6640" }} />
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#252535", textAlign: "center" }}>
                  No open requests
                </div>
              </div>
            ) : (
              loc.tickets.items.map((t, i) => <TicketRow key={i} ticket={t} />)
            )}
          </div>
          {loc.tickets.items.length > 0 && (
            <div style={{
              padding:    "6px 14px",
              flexShrink: 0,
              borderTop:  "1px solid #0C0C1C",
              fontFamily: "'JetBrains Mono',monospace",
              fontSize:   8,
              color:      loc.tickets.critical > 0 ? "#FF4444" : "#252535",
            }}>
              {loc.tickets.critical > 0
                ? `${loc.tickets.critical} critical — IT notified`
                : `${loc.tickets.open} open request${loc.tickets.open !== 1 ? "s" : ""}`
              }
            </div>
          )}
        </div>
      </div>

      {/* Active alerts row */}
      {loc.alerts.length > 0 && (
        <div style={{
          flexShrink:   0,
          background:   "#0A0202",
          border:       "1px solid #FF2A2A28",
          borderLeft:   "3px solid #FF2A2A",
          padding:      "8px 14px",
          display:      "flex",
          alignItems:   "center",
          gap:          14,
          overflowX:    "auto",
        }}>
          <AlertTriangle size={14} style={{ color: "#FF4444", flexShrink: 0 }} />
          <span style={{
            fontFamily:    "'JetBrains Mono',monospace",
            fontSize:      8.5,
            color:         "#FF6666",
            letterSpacing: "0.12em",
            flexShrink:    0,
          }}>
            ACTIVE ALERTS:
          </span>
          {loc.alerts.slice(0, 5).map((a, i) => (
            <span key={i} style={{
              fontFamily:    "'JetBrains Mono',monospace",
              fontSize:      8.5,
              color:         "#FF8888",
              background:    "#180404",
              border:        "1px solid #FF2A2A33",
              padding:       "2px 10px",
              flexShrink:    0,
              whiteSpace:    "nowrap",
            }}>
              {a.device || a.ip || "Unknown"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LocationsDashboard() {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetch,  setLastFetch]  = useState(null);
  const [activeTab,  setActiveTab]  = useState(null); // null = MAP

  const locationsRef = useRef([]);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await axios.get(`${API}/locations/overview`, { timeout: 12000 });
      setData(res.data);
      locationsRef.current = res.data.locations || [];
    } catch (e) {
      console.warn("Locations overview fetch failed:", e);
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

  // Kiosk auto-cycle: MAP → loc[0] → ... → loc[n] → MAP
  useEffect(() => {
    const iv = setInterval(() => {
      setActiveTab(prev => {
        const locs  = locationsRef.current;
        const order = [null, ...locs.map(l => l.id)];
        const idx   = order.indexOf(prev);
        const next  = order[(idx + 1) % order.length];

        if (next === null) {
          if (window.__kioskHoldPage) window.__kioskHoldPage(false);
        } else if (prev === null) {
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

  const locations   = data?.locations || [];
  const activeLocObj = activeTab ? locations.find(l => l.id === activeTab) : null;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>

      {/* Page header */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        flexShrink:     0,
        paddingBottom:  8,
      }}>
        <h1 style={{
          fontFamily:    "'JetBrains Mono',monospace",
          fontSize:      13,
          fontWeight:    700,
          color:         "#E2E2E5",
          letterSpacing: "0.18em",
          margin:        0,
        }}>
          LOCATION STATUS
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {lastFetch && (
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5, color: "#28283A" }}>
              {lastFetch.toLocaleTimeString()}
            </span>
          )}
          <button
            data-testid="locations-refresh-btn"
            onClick={() => load(true)}
            style={{
              background: "transparent",
              border:     "1px solid #1C1C2A",
              color:      "#3A3A50",
              cursor:     "pointer",
              padding:    "5px 10px",
              display:    "flex",
              alignItems: "center",
              gap:        6,
              fontFamily: "'JetBrains Mono',monospace",
              fontSize:   8,
            }}
          >
            <RefreshCw size={10} style={{ animation: (loading || refreshing) ? "spin 1s linear infinite" : "none" }} />
            REFRESH
          </button>
        </div>
      </div>

      {/* Sub-tab strip */}
      <div style={{
        display:      "flex",
        flexShrink:   0,
        borderBottom: "1px solid #0C0C1C",
        background:   "#040408",
        overflowX:    "auto",
      }}>
        {/* MAP tab */}
        <button
          data-testid="loc-tab-map"
          onClick={() => setActiveTab(null)}
          style={{
            background:  activeTab === null ? "#08081C" : "transparent",
            border:      "none",
            borderBottom:`2px solid ${activeTab === null ? "#0080CC" : "transparent"}`,
            color:       activeTab === null ? "#A0B8D0" : "#3A3A52",
            padding:     "8px 18px",
            cursor:      "pointer",
            flexShrink:  0,
            fontFamily:  "'JetBrains Mono',monospace",
            fontSize:    9.5,
            fontWeight:  activeTab === null ? 700 : 400,
            letterSpacing: "0.12em",
          }}
        >
          MAP OVERVIEW
        </button>

        {locations.map(loc => {
          const isActive = activeTab === loc.id;
          const col      = STATUS_COLOR[loc.status] || STATUS_COLOR.unknown;
          const hasCrit  = loc.status === "critical";
          const hasWarn  = loc.status === "warning";

          return (
            <button
              key={loc.id}
              data-testid={`loc-tab-${loc.id}`}
              onClick={() => setActiveTab(loc.id)}
              style={{
                background:  isActive ? "#08081C" : "transparent",
                border:      "none",
                borderBottom:`2px solid ${isActive ? col : "transparent"}`,
                color:       isActive ? (hasCrit ? "#FF8080" : hasWarn ? "#FFD070" : "#A0B8D0") : "#3A3A52",
                padding:     "8px 18px",
                cursor:      "pointer",
                flexShrink:  0,
                fontFamily:  "'JetBrains Mono',monospace",
                fontSize:    9.5,
                fontWeight:  isActive ? 700 : 400,
                letterSpacing: "0.12em",
                display:     "flex",
                alignItems:  "center",
                gap:         7,
                whiteSpace:  "nowrap",
              }}
            >
              <div style={{
                width:       6,
                height:      6,
                borderRadius:"50%",
                background:  col,
                flexShrink:  0,
                boxShadow:   `0 0 4px ${col}80`,
              }} />
              {loc.name.toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", paddingTop: 10 }}>
        {loading ? (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", height: "100%",
            fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#252535", letterSpacing: "0.18em",
          }}>
            LOADING LOCATION DATA...
          </div>
        ) : activeTab === null ? (
          <MichiganMap
            locations={locations}
            onSelectLocation={id => setActiveTab(id)}
          />
        ) : activeLocObj ? (
          <LocationView key={activeLocObj.id} loc={activeLocObj} />
        ) : null}
      </div>
    </div>
  );
}
