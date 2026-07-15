/**
 * Tickets — Per-location Incident board.
 *
 * Shows only Incidents with status Open or Waiting On User.
 * Groups by requester location, one card per location (4×N grid).
 * Pi-safe: static SVG + CSS only.
 */
import React, { useState, useEffect } from "react";
import axios from "axios";
import { RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PRI_COLOR = {
  Critical: "#FF2A2A",
  High:     "#FF7A00",
  Medium:   "#FFB014",
  Low:      "#2E2E40",
};

const STATUS_COLOR = {
  "Open":                 "#00FF66",
  "Waiting On User":      "#FFB014",
  "Waiting on User":      "#FFB014",
  "Waiting On 3rd Party": "#00E5FF",
  "Waiting on 3rd Party": "#00E5FF",
};

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)    return `${diff}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ── Location card ──────────────────────────────────────────────────────────────
function LocationCard({ location, tickets }) {
  const critCount = tickets.filter(t => t.priority === "Critical").length;
  const hasCrit   = critCount > 0;
  const bc        = hasCrit ? "#FF2A2A" : "#1C1C2A";

  return (
    <div
      data-testid={`loc-card-${location.replace(/\s+/g, "-").toLowerCase()}`}
      style={{
        background: "#06060F",
        border: `1px solid ${hasCrit ? "#FF2A2A33" : "#0C0C1A"}`,
        borderRadius: 3,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        flex: 1,
        minWidth: 0,
        boxShadow: hasCrit ? "0 0 12px #FF2A2A18" : "none",
      }}
    >
      {/* Card header */}
      <div style={{
        padding: "6px 10px",
        borderBottom: `1px solid ${hasCrit ? "#FF2A2A22" : "#0C0C1A"}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
        background: hasCrit ? "#0D0404" : "#070710",
      }}>
        <span style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, fontWeight: 700,
          color: hasCrit ? "#FF8080" : "#8080A0", letterSpacing: "0.14em",
        }}>
          {location.toUpperCase()}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{
            fontFamily: "'JetBrains Mono',monospace", fontSize: 8.5,
            color: "#3A3A50", letterSpacing: "0.06em",
          }}>
            {tickets.length} INC
          </span>
          {hasCrit && (
            <span style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
              color: "#FF4444", background: "#180808",
              padding: "1px 5px", border: "1px solid #FF2A2A44",
              letterSpacing: "0.06em",
            }}>
              {critCount} CRIT
            </span>
          )}
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: hasCrit ? "#FF2A2A" : "#00FF66",
            boxShadow: `0 0 5px ${hasCrit ? "#FF2A2A88" : "#00FF6688"}`,
          }} />
        </div>
      </div>

      {/* Ticket list */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {tickets.length === 0 ? (
          <div style={{
            height: "100%", display: "flex", alignItems: "center",
            justifyContent: "center", opacity: 0.25,
            fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#3A3A50",
          }}>
            NO OPEN INCIDENTS
          </div>
        ) : tickets.map(t => {
          const pc = PRI_COLOR[t.priority] || PRI_COLOR.Low;
          const sc = STATUS_COLOR[t.status] || "#3A3A50";
          return (
            <div
              key={t.id}
              data-testid={`ticket-row-${t.id}`}
              style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                padding: "7px 10px",
                borderBottom: "1px solid #0A0A16",
                borderLeft: `2px solid ${pc}`,
              }}
            >
              {/* Priority bar */}
              <div style={{
                width: 3, minHeight: 28, background: pc,
                flexShrink: 0, borderRadius: 1, marginTop: 2,
                opacity: 0.9,
              }} />

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 9.5, color: "#C0C0CC",
                  overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap", lineHeight: 1.35,
                }}>
                  {t.title}
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, marginTop: 3,
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                }}>
                  <span style={{ color: "#3A3A50" }}>{t.display_id}</span>
                  <span style={{
                    color: sc,
                    border: `1px solid ${sc}40`,
                    background: `${sc}0D`,
                    padding: "0 4px",
                    fontSize: 7.5, letterSpacing: "0.05em",
                  }}>
                    {t.status.toUpperCase()}
                  </span>
                  {t.assigned_to && (
                    <span style={{ color: "#2A2A3A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 90 }}>
                      {t.assigned_to}
                    </span>
                  )}
                  <span style={{ color: "#1E1E2E", marginLeft: "auto", flexShrink: 0 }}>
                    {timeAgo(t.opened)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Demo data ──────────────────────────────────────────────────────────────────
const DEMO_LOCATIONS = {
  "Novi HQ": [
    { id: "1001", display_id: "INC-1001", title: "Outlook sync failing — executive suite", status: "Open",             priority: "Critical", assigned_to: "J. Smith",  opened: new Date(Date.now() - 7200000).toISOString() },
    { id: "1002", display_id: "INC-1002", title: "VPN throughput degraded 40Mbps → 6Mbps",  status: "Waiting On User", priority: "High",     assigned_to: "R. Torres", opened: new Date(Date.now() - 18000000).toISOString() },
    { id: "1003", display_id: "INC-1003", title: "Printer queue stuck — 2nd floor",          status: "Open",             priority: "Medium",   assigned_to: "",          opened: new Date(Date.now() - 86400000).toISOString() },
  ],
  "Canton": [
    { id: "1004", display_id: "INC-1004", title: "AP offline — plant floor sector C",        status: "Open",             priority: "Critical", assigned_to: "L. Chen",   opened: new Date(Date.now() - 3600000).toISOString() },
    { id: "1005", display_id: "INC-1005", title: "Badge readers intermittent response",      status: "Open",             priority: "High",     assigned_to: "M. Davis",  opened: new Date(Date.now() - 14400000).toISOString() },
  ],
  "Remus": [
    { id: "1006", display_id: "INC-1006", title: "WAN circuit packet loss 4%",               status: "Open",             priority: "High",     assigned_to: "NOC Team",  opened: new Date(Date.now() - 1800000).toISOString() },
    { id: "1007", display_id: "INC-1007", title: "Shared drive inaccessible — accounting",   status: "Waiting On User",  priority: "Medium",   assigned_to: "J. Smith",  opened: new Date(Date.now() - 28800000).toISOString() },
  ],
  "Mt. Pleasant": [
    { id: "1008", display_id: "INC-1008", title: "NinjaRMM agent offline — server room",     status: "Open",             priority: "Medium",   assigned_to: "B. Wilson", opened: new Date(Date.now() - 43200000).toISOString() },
  ],
  "Constantine": [
    { id: "1009", display_id: "INC-1009", title: "Email delivery delay 15+ minutes",         status: "Open",             priority: "Medium",   assigned_to: "NOC Team",  opened: new Date(Date.now() - 7200000).toISOString() },
  ],
  "Ovid": [],
  "Canton WHS": [
    { id: "1010", display_id: "INC-1010", title: "Switch port flapping — dock area",         status: "Open",             priority: "High",     assigned_to: "L. Chen",   opened: new Date(Date.now() - 5400000).toISOString() },
  ],
  "Middlebury": [
    { id: "1011", display_id: "INC-1011", title: "DNS resolution slow — workstations",       status: "Waiting On User",  priority: "Low",      assigned_to: "",          opened: new Date(Date.now() - 172800000).toISOString() },
  ],
};

// ── Main page ──────────────────────────────────────────────────────────────────
export default function Tickets() {
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [isMock,    setIsMock]    = useState(true);
  const [lastFetch, setLastFetch] = useState(null);
  const [error,     setError]     = useState(null);

  const fetchTickets = () => {
    setLoading(true);
    axios.get(`${API}/vivantio/tickets`, { timeout: 30000 })
      .then(r => {
        if (r.data?.configured && r.data?.by_location) {
          setData(r.data);
          setIsMock(false);
          setError(null);
        } else if (!r.data?.configured) {
          setError("VIVANTIO NOT CONFIGURED");
        }
      })
      .catch(e => setError(e.message))
      .finally(() => { setLoading(false); setLastFetch(new Date()); });
  };

  useEffect(() => {
    fetchTickets();
    const iv = setInterval(fetchTickets, 60000);
    return () => clearInterval(iv);
  }, []);

  // Build location map — live data or demo fallback
  const byLocation = isMock ? DEMO_LOCATIONS : (data?.by_location || {});

  // Sort locations: those with Critical incidents first, then by ticket count desc
  const sortedLocations = Object.entries(byLocation).sort(([, a], [, b]) => {
    const aCrit = a.filter(t => t.priority === "Critical").length;
    const bCrit = b.filter(t => t.priority === "Critical").length;
    if (bCrit !== aCrit) return bCrit - aCrit;
    return b.length - a.length;
  });

  const totalTickets = sortedLocations.reduce((s, [, ts]) => s + ts.length, 0);
  const totalCrit    = sortedLocations.reduce((s, [, ts]) => s + ts.filter(t => t.priority === "Critical").length, 0);
  const totalWaiting = sortedLocations.reduce((s, [, ts]) => s + ts.filter(t => t.status?.toLowerCase().includes("waiting")).length, 0);
  const locCount     = sortedLocations.length;

  // Grid: always 4 columns; rows are determined by location count
  const cols = 4;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 8 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <h1
            data-testid="tickets-header"
            style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700,
              color: "#E2E2E5", letterSpacing: "0.18em",
            }}
          >
            INCIDENT BOARD
          </h1>
          {isMock && !error && (
            <span style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5, color: "#FFB014",
              background: "#1A1200", border: "1px solid #FFB01430",
              padding: "2px 7px", letterSpacing: "0.1em",
            }}>
              DEMO DATA — VIVANTIO NOT CONNECTED
            </span>
          )}
          {error && (
            <span data-testid="tickets-error" style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5, color: "#FF4444",
              background: "#180808", border: "1px solid #FF2A2A33",
              padding: "2px 7px", letterSpacing: "0.1em",
            }}>
              {error.slice(0, 80)}
            </span>
          )}
        </div>

        {/* KPI strip */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {[
            ["SITES",    locCount,      "#3A3A50"],
            ["OPEN INC", totalTickets,  "#C4C4D8"],
            ["CRITICAL", totalCrit,     totalCrit > 0 ? "#FF4444" : "#3A3A50"],
            ["WAITING",  totalWaiting,  totalWaiting > 0 ? "#FFB014" : "#3A3A50"],
          ].map(([label, val, color]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{
                fontFamily: "'JetBrains Mono',monospace", fontSize: 16,
                fontWeight: 700, color, lineHeight: 1,
              }}>{val}</div>
              <div style={{
                fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                color: "#28283A", letterSpacing: "0.1em", marginTop: 2,
              }}>{label}</div>
            </div>
          ))}

          <button
            data-testid="tickets-refresh-btn"
            onClick={fetchTickets}
            style={{
              background: "transparent", border: "1px solid #1C1C2A", color: "#3A3A50",
              cursor: "pointer", padding: "5px 10px",
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: "'JetBrains Mono',monospace", fontSize: 8, letterSpacing: "0.1em",
            }}
          >
            <RefreshCw size={10} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            REFRESH
          </button>

          {lastFetch && (
            <span style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
              color: "#28283A", letterSpacing: "0.06em",
            }}>
              {lastFetch.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* ── Status banner ── */}
      {totalCrit > 0 ? (
        <div data-testid="tickets-alert-banner" style={{
          flexShrink: 0, padding: "6px 14px",
          background: "#140808", border: "1px solid #FF2A2A33",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <AlertTriangle size={12} color="#FF4444" />
          <span style={{
            fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
            color: "#FF6060", letterSpacing: "0.1em",
          }}>
            {totalCrit} CRITICAL INCIDENT{totalCrit !== 1 ? "S" : ""} OPEN — IMMEDIATE ATTENTION REQUIRED
          </span>
        </div>
      ) : (
        <div data-testid="tickets-status-ok" style={{
          flexShrink: 0, padding: "6px 14px",
          background: "#080F08", border: "1px solid #00FF6622",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <CheckCircle2 size={12} color="#00FF66" />
          <span style={{
            fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
            color: "#00CC44", letterSpacing: "0.1em",
          }}>
            {totalTickets} OPEN INCIDENT{totalTickets !== 1 ? "S" : ""} — NO CRITICAL PRIORITY ACROSS {locCount} SITES
          </span>
        </div>
      )}

      {/* ── Location card grid ── */}
      <div style={{
        flex: 1,
        minHeight: 0,
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridAutoRows: sortedLocations.length > cols ? "1fr" : "1fr",
        gap: 8,
      }}>
        {sortedLocations.map(([location, tickets]) => (
          <LocationCard key={location} location={location} tickets={tickets} />
        ))}
      </div>

    </div>
  );
}
