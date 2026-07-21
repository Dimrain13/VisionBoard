/**
 * LocationsDashboard
 *
 * MAP tab: Michigan overview with RAG dots per location.
 *
 * Per-location tab (mirrors main Dashboard):
 *   Row 1 — 4 KPI cards (location-filtered, no IPs)
 *   Row 2 — Left: Full SD-WAN mesh map  |  Right: Alerts + Network HW + Tickets
 *   Row 3 — DIA circuit status strip (no IPs)
 *
 * Kiosk: MAP → loc[0] → … → MAP, holds main kiosk timer via window.__kioskHoldPage.
 */
import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Bell, Wifi, WifiOff, Monitor, Ticket, Network,
  CheckCircle, ShieldAlert, RefreshCw, Server,
} from "lucide-react";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import MapEmbed from "../components/MapEmbed";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── Severity config ────────────────────────────────────────────────────────────
const SEV = {
  critical: { color: "#FF2A2A", label: "CRIT" },
  warning:  { color: "#FFB014", label: "WARN" },
  info:     { color: "#00E5FF", label: "INFO" },
};

const PRI_COLOR = { critical: "#FF2A2A", high: "#FF6B14", medium: "#FFB014", low: "#3A3A48" };

// ── Status helpers ─────────────────────────────────────────────────────────────
const STATUS_COLOR = { ok: "#00FF66", warning: "#FFB014", critical: "#FF2A2A", unknown: "#3A3A52" };

// ── KPI card (matches main Dashboard style) ────────────────────────────────────
function KPICard({ label, value, sub, color = "#E2E2E5", Icon, glowColor, testId }) {
  return (
    <div
      data-testid={testId}
      className="card"
      style={{ padding: "14px 18px", borderLeft: `2px solid ${color}` }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ flex: 1 }}>
          <div className="section-label" style={{ marginBottom: 6 }}>{label}</div>
          <div style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontSize:   38,
            fontWeight: 800,
            color,
            lineHeight: 1,
            letterSpacing: "-0.04em",
            textShadow: glowColor ? `0 0 18px ${glowColor}` : "none",
          }}>
            {value}
          </div>
          {sub && (
            <div style={{
              fontFamily:    "'JetBrains Mono',monospace",
              fontSize:      9,
              color:         "#3A3A48",
              letterSpacing: "0.06em",
              marginTop:     8,
              textTransform: "uppercase",
            }}>
              {sub}
            </div>
          )}
        </div>
        {Icon && <Icon size={28} strokeWidth={1} style={{ color, opacity: 0.18, marginLeft: 10, flexShrink: 0 }} />}
      </div>
    </div>
  );
}

// ── Device type label ──────────────────────────────────────────────────────────
const DEV_TYPE_LABEL = {
  gateway: "GATEWAY", firewall: "FIREWALL", switch: "SWITCH", poe_switch: "POE SWITCH",
  access_point: "ACCESS POINT", camera: "CAMERA", device: "DEVICE",
};
const DEV_TYPE_COLOR = {
  gateway: "#A78BFA", firewall: "#FF6B35", switch: "#00FF66", poe_switch: "#00CC55",
  access_point: "#00E5FF", camera: "#FFB014", device: "#505068",
};

// ── Per-location full dashboard (mirrors main Dashboard) ───────────────────────
function LocationView({ loc, locAlerts }) {
  const circuitUp  = loc.circuits.filter(c => c.status === "up").length;
  const circuitTot = loc.circuits.length;
  const circPct    = circuitTot > 0 ? ((circuitUp / circuitTot) * 100).toFixed(0) : 100;
  const anyCircDown= loc.circuits.some(c => c.status === "down");
  const netOffline = loc.network.offline;
  const netOnline  = loc.network.online;
  const netTotal   = loc.network.total;

  return (
    <div
      data-testid={`loc-dashboard-${loc.id}`}
      className="h-full flex flex-col gap-3"
      style={{ background: "#0B0B0F", padding: "8px 0 0", overflow: "hidden" }}
    >
      {/* ── Row 1: KPI cards ──────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3" style={{ flexShrink: 0 }}>
        <KPICard
          testId={`kpi-internet-${loc.id}`}
          label="Internet Availability"
          Icon={anyCircDown ? WifiOff : Wifi}
          value={`${circPct}%`}
          sub={anyCircDown
            ? `${circuitTot - circuitUp} CIRCUIT${circuitTot - circuitUp !== 1 ? "S" : ""} DOWN`
            : `ALL ${circuitTot} CIRCUIT${circuitTot !== 1 ? "S" : ""} UP`}
          color={anyCircDown ? "#FF2A2A" : "#00FF66"}
          glowColor={anyCircDown ? "#FF2A2A50" : null}
        />
        <KPICard
          testId={`kpi-network-${loc.id}`}
          label="Network Hardware"
          Icon={Monitor}
          value={netTotal || "—"}
          sub={netTotal > 0
            ? `${netOnline} ONLINE · ${netOffline} OFFLINE`
            : "NO DEVICE DATA YET"}
          color={netOffline > 0 ? "#FFB014" : netTotal > 0 ? "#00FF66" : "#3A3A48"}
          glowColor={netOffline > 0 ? "#FFB01440" : null}
        />
        <KPICard
          testId={`kpi-tickets-${loc.id}`}
          label="Open Requests"
          Icon={Ticket}
          value={loc.tickets.open}
          sub={loc.tickets.critical > 0
            ? `${loc.tickets.critical} AT CRITICAL PRIORITY`
            : loc.tickets.open > 0 ? "AWAITING RESOLUTION" : "NONE OPEN"}
          color={loc.tickets.critical > 0 ? "#FF2A2A" : loc.tickets.open > 0 ? "#FFB014" : "#E2E2E5"}
        />
        <KPICard
          testId={`kpi-alerts-${loc.id}`}
          label="Active Alerts"
          Icon={Bell}
          value={locAlerts.length}
          sub={locAlerts.filter(a => a.severity === "critical").length > 0
            ? `${locAlerts.filter(a => a.severity === "critical").length} CRITICAL`
            : locAlerts.length > 0 ? "MONITORING" : "ALL CLEAR"}
          color={locAlerts.filter(a => a.severity === "critical").length > 0
            ? "#FF2A2A"
            : locAlerts.length > 0 ? "#FFB014" : "#00FF66"}
          glowColor={locAlerts.filter(a => a.severity === "critical").length > 0 ? "#FF2A2A50" : null}
        />
      </div>

      {/* ── Row 2: Map + Right panels ─────────────────────────── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 10, minHeight: 0 }}>

        {/* Left: Full mesh map */}
        <div className="card flex flex-col" style={{ padding: 0, position: "relative", overflow: "hidden" }}>
          <div
            className="card-header"
            style={{
              position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
              background: "rgba(15,15,20,0.88)", backdropFilter: "blur(4px)",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Network size={13} style={{ color: "#00E5FF" }} />
              SD-WAN MESH — {loc.name.toUpperCase()}
            </span>
            <div style={{ display: "flex", gap: 14 }}>
              {[["#00FF66","ACTIVE"],["#FFB014","DEGRADED"],["#FF2A2A","OFFLINE"]].map(([c, l]) => (
                <span key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 8.5, color: "#A1A1AA", letterSpacing: "0.1em" }}>
                  <div style={{ width: 6, height: 6, background: c, boxShadow: `0 0 4px ${c}` }} /> {l}
                </span>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, background: "#030305" }}>
            <MapEmbed />
          </div>
        </div>

        {/* Right column: Alerts + Network HW + Tickets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>

          {/* Active Alerts */}
          <div className="card flex flex-col" style={{ flex: 1.1, minHeight: 0 }}>
            <div className="card-header">
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <ShieldAlert size={13} style={{ color: "#FF2A2A" }} />
                CRITICAL EVENTS
              </span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: "#3A3A48" }}>
                {loc.name.toUpperCase()}
              </span>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {locAlerts.length === 0 ? (
                <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: 0.3, gap: 8 }}>
                  <CheckCircle size={28} strokeWidth={1} />
                  <div className="section-label">No Active Alerts</div>
                </div>
              ) : (
                locAlerts.slice(0, 8).map(alert => {
                  const cfg = SEV[alert.severity] || SEV.info;
                  return (
                    <div key={alert.id} style={{
                      padding: "10px 14px",
                      borderLeft: `3px solid ${cfg.color}`,
                      borderBottom: "1px solid #1C1C24",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ color: cfg.color, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em" }}>{cfg.label}</span>
                        <span style={{ color: "#3A3A48", fontSize: 8.5 }}>
                          {alert.created_at
                            ? formatDistanceToNowStrict(parseISO(alert.created_at)) + " AGO"
                            : "ACTIVE"}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "#FAFAFA", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {alert.title}
                      </div>
                      <div style={{ fontSize: 8.5, color: "#A1A1AA" }}>
                        {alert.device || "SYSTEM"}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Network Hardware */}
          <div className="card" style={{ flexShrink: 0, padding: "10px 14px" }}>
            <div className="section-label" style={{ marginBottom: 8 }}>
              <Server size={11} style={{ display: "inline", marginRight: 6, color: "#00FF66" }} />
              NETWORK HARDWARE
            </div>
            {netTotal === 0 ? (
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#252535" }}>
                Awaiting device sync…
              </div>
            ) : (
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                {[
                  ["ONLINE",  netOnline,  "#00FF66"],
                  ["OFFLINE", netOffline, netOffline > 0 ? "#FF4444" : "#252535"],
                  ["TOTAL",   netTotal,   "#3A3A52"],
                ].map(([l, v, c]) => (
                  <div key={l} style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 700, color: c, lineHeight: 1 }}>{v}</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: "#252535", letterSpacing: "0.1em", marginTop: 2 }}>{l}</div>
                  </div>
                ))}
                {/* Health bar */}
                <div style={{ flex: 1, height: 5, background: "#0A0A16", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${netTotal > 0 ? (netOnline / netTotal) * 100 : 0}%`,
                    background: netOffline > 0 ? "#FF8844" : "#00FF66",
                    borderRadius: 3,
                  }} />
                </div>
              </div>
            )}
          </div>

          {/* Open Tickets */}
          <div className="card flex flex-col" style={{ flex: 0.9, minHeight: 0 }}>
            <div className="card-header">
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Ticket size={13} style={{ color: loc.tickets.critical > 0 ? "#FF4444" : "#3A3A52" }} />
                OPEN REQUESTS
              </span>
              {loc.tickets.open > 0 && (
                <span style={{
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 700,
                  color: loc.tickets.critical > 0 ? "#FF4444" : "#FFB014",
                  background: loc.tickets.critical > 0 ? "#180404" : "#140C00",
                  border: `1px solid ${loc.tickets.critical > 0 ? "#FF2A2A44" : "#FFB01444"}`,
                  padding: "1px 8px",
                }}>
                  {loc.tickets.open}
                </span>
              )}
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loc.tickets.items.length === 0 ? (
                <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: 0.3, gap: 8 }}>
                  <CheckCircle size={24} strokeWidth={1} />
                  <div className="section-label" style={{ fontSize: 8 }}>No Open Requests</div>
                </div>
              ) : (
                loc.tickets.items.map((t, i) => {
                  const priCol = PRI_COLOR[(t.priority || "low").toLowerCase()] || "#3A3A48";
                  return (
                    <div key={i} style={{ padding: "9px 14px", borderBottom: "1px solid #1C1C24", borderLeft: `3px solid ${priCol}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ color: priCol, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em" }}>
                          {(t.priority || "OPEN").toUpperCase()}
                        </span>
                        <span style={{ color: "#3A3A48", fontSize: 8.5 }}>{(t.status || "").toUpperCase()}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#C8C8D4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.title || "No title"}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 3: Circuit status strip (no IPs) ─────────────── */}
      <div className="card" style={{ height: 68, flexShrink: 0, padding: "10px 16px", overflow: "hidden" }}>
        <div className="section-label" style={{ marginBottom: 8 }}>
          DIA CIRCUITS — {loc.name.toUpperCase()}
        </div>
        <div style={{ display: "flex", gap: 24, overflowX: "auto" }}>
          {loc.circuits.length === 0 ? (
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#252535" }}>No circuits configured</span>
          ) : (
            loc.circuits.map((c, i) => {
              const isUp = c.status === "up";
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: isUp ? "#00FF66" : "#FF2A2A",
                    boxShadow: `0 0 4px ${isUp ? "#00FF66" : "#FF2A2A"}`,
                  }} />
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: isUp ? "#E2E2E5" : "#FF2A2A" }}>
                    {c.provider || "Unknown"}
                  </span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#3A3A48" }}>
                    {c.bandwidth_mbps >= 1000
                      ? `${(c.bandwidth_mbps / 1000).toFixed(0)}G`
                      : `${c.bandwidth_mbps || "?"}M`}
                  </span>
                  <span style={{
                    fontFamily: "'JetBrains Mono',monospace", fontSize: 8, fontWeight: 700,
                    color: isUp ? "#00FF66" : "#FF2A2A",
                    background: isUp ? "#001A0A" : "#1A0000",
                    border: `1px solid ${isUp ? "#00FF6633" : "#FF2A2A33"}`,
                    padding: "1px 6px",
                  }}>
                    {(c.status || "UNKNOWN").toUpperCase()}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main LocationsDashboard page ───────────────────────────────────────────────
export default function LocationsDashboard() {
  const [data,       setData]       = useState(null);
  const [allAlerts,  setAllAlerts]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetch,  setLastFetch]  = useState(null);
  const [activeTab,  setActiveTab]  = useState(null); // null = first loc after load

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const [ov, al] = await Promise.all([
        axios.get(`${API}/locations/overview`,          { timeout: 12000 }),
        axios.get(`${API}/alerts`, { params: { acknowledged: false }, timeout: 8000 }),
      ]);
      setData(ov.data);
      // Auto-select the first location on first load
      setActiveTab(prev => prev ?? (ov.data.locations?.[0]?.id ?? null));
      setAllAlerts(al.data.items || []);
    } catch (e) {
      console.warn("Locations load failed:", e);
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

  // No sub-tab auto-rotation on Locations — user navigates manually.

  const locations    = data?.locations || [];
  const activeLocObj = locations.find(l => l.id === activeTab) ?? locations[0] ?? null;

  // Filter alerts for a specific location (by site name match)
  function alertsForLoc(locName) {
    const nm = locName.toLowerCase();
    return allAlerts.filter(a => {
      const t = ((a.site || "") + " " + (a.device || "") + " " + (a.title || "")).toLowerCase();
      return t.includes(nm) || nm.split(" ").some(w => w.length > 3 && t.includes(w));
    });
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, paddingBottom: 8 }}>
        <h1 style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: "#E2E2E5", letterSpacing: "0.18em", margin: 0 }}>
          LOCATION STATUS
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {lastFetch && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 7.5, color: "#28283A" }}>{lastFetch.toLocaleTimeString()}</span>}
          <button
            data-testid="locations-refresh-btn"
            onClick={() => load(true)}
            style={{ background: "transparent", border: "1px solid #1C1C2A", color: "#3A3A50", cursor: "pointer", padding: "5px 10px", display: "flex", alignItems: "center", gap: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: 8 }}
          >
            <RefreshCw size={10} style={{ animation: (loading || refreshing) ? "spin 1s linear infinite" : "none" }} />
            REFRESH
          </button>
        </div>
      </div>

      {/* Sub-tab strip */}
      <div style={{ display: "flex", flexShrink: 0, borderBottom: "1px solid #0C0C1C", background: "#040408", overflowX: "auto" }}>
        {locations.map(loc => {
          const isActive = activeTab === loc.id;
          const col      = STATUS_COLOR[loc.status] || STATUS_COLOR.unknown;
          return (
            <button
              key={loc.id}
              data-testid={`loc-tab-${loc.id}`}
              onClick={() => setActiveTab(loc.id)}
              style={{
                background: isActive ? "#08081C" : "transparent",
                border: "none", borderBottom: `2px solid ${isActive ? col : "transparent"}`,
                color: isActive ? (loc.status === "critical" ? "#FF8080" : loc.status === "warning" ? "#FFD070" : "#A0B8D0") : "#3A3A52",
                padding: "8px 18px", cursor: "pointer", flexShrink: 0,
                fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5,
                fontWeight: isActive ? 700 : 400, letterSpacing: "0.12em",
                display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap",
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: col, flexShrink: 0, boxShadow: `0 0 4px ${col}80` }} />
              {loc.name.toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", paddingTop: 8 }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#252535", letterSpacing: "0.18em" }}>
            LOADING LOCATION DATA...
          </div>
        ) : activeLocObj ? (
          <LocationView key={activeLocObj.id} loc={activeLocObj} locAlerts={alertsForLoc(activeLocObj.name)} />
        ) : null}
      </div>
    </div>
  );
}
