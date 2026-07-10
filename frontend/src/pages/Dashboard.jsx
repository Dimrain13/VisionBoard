import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Bell, Network, Ticket, Activity, CheckCircle, ArrowRight,
  ShieldAlert, Wifi, Camera, Monitor, Server, Router
} from "lucide-react";
import { format, parseISO, formatDistanceToNowStrict } from "date-fns";
import { Link } from "react-router-dom";
import MapEmbed from "../components/MapEmbed";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SEV_CONFIG = {
  critical: { bar: "alert-critical", text: "#FF2A2A", badge: "badge-red",   label: "CRIT" },
  warning:  { bar: "alert-warning",  text: "#FFB014", badge: "badge-amber", label: "WARN" },
  info:     { bar: "alert-info",     text: "#00E5FF", badge: "badge-blue",  label: "INFO" },
};

const VENDOR_STATUS = {
  operational:  { color: "#00FF66", dot: "dot-online",   label: "OK"    },
  minor_outage: { color: "#FFB014", dot: "dot-degraded", label: "WARN" },
  major_outage: { color: "#FF2A2A", dot: "dot-offline",  label: "DOWN"  },
  unknown:      { color: "#3A3A48", dot: "dot-unknown",  label: "???"     },
};

const PRI_COLOR = {
  critical: "#FF2A2A",
  high:     "#FF6B14",
  medium:   "#FFB014",
  low:      "#3A3A48",
};

function KPICard({ testId, label, value, sub, color = "#E2E2E5", Icon, glowColor }) {
  return (
    <div data-testid={testId} className="card" style={{ padding: "16px 20px", borderLeft: `2px solid ${color}` }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ flex: 1 }}>
          <div className="section-label" style={{ marginBottom: 8 }}>{label}</div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 42,
              fontWeight: 800,
              color,
              lineHeight: 1,
              letterSpacing: "-0.04em",
              textShadow: glowColor ? `0 0 20px ${glowColor}` : "none",
            }}
          >
            {value}
          </div>
          {sub && (
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              color: "#3A3A48",
              letterSpacing: "0.06em",
              marginTop: 10,
              textTransform: "uppercase"
            }}>
              {sub}
            </div>
          )}
        </div>
        {Icon && (
          <Icon
            size={32}
            strokeWidth={1}
            style={{ color, opacity: 0.2, marginLeft: 12, flexShrink: 0 }}
          />
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary]   = useState(null);
  const [alerts, setAlerts]     = useState([]);
  const [vendors, setVendors]   = useState([]);
  const [tickets, setTickets]   = useState([]);
  const [sites, setSites]       = useState([]);
  const [loading, setLoading]   = useState(true);

  const loadAll = useCallback(async () => {
    try {
      // Load KPI + content endpoints first — show dashboard immediately
      const [s, a, t, si] = await Promise.all([
        axios.get(`${API}/dashboard/summary`),
        axios.get(`${API}/alerts`, { params: { acknowledged: false } }),
        axios.get(`${API}/vivantio/tickets`),
        axios.get(`${API}/sites`),
      ]);
      setSummary(s.data);
      const rawAlerts = a.data.items || [];
      setAlerts(rawAlerts.filter(al => al.severity !== "info").slice(0, 10));
      setTickets((t.data.tickets || []).slice(0, 5));
      setSites(si.data);
    } catch (e) { console.error("KPI load error:", e); }
    finally { setLoading(false); }

    // Vendor status loads separately — 21 external pings, don't block main UI
    try {
      const v = await axios.get(`${API}/vendor-status`);
      setVendors(Array.isArray(v.data) ? v.data : (v.data.vendors || []));
    } catch (e) { console.error("Vendor status error:", e); }
  }, []);

  useEffect(() => {
    loadAll();
    const iv = setInterval(loadAll, 30000);
    return () => clearInterval(iv);
  }, [loadAll]);

  if (loading) return (
    <div className="h-full flex flex-col gap-3" style={{ background: "#0B0B0F", padding: 12 }}>
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 120 }} />)}
      </div>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    </div>
  );

  const s               = summary || {};
  const criticalAlerts  = s.alerts?.critical ?? 0;
  const circuitsDown    = s.circuits?.down ?? 0;
  const circuitsTotal   = s.circuits?.total ?? 0;
  const criticalVendors = vendors.filter(v => v.status === "major_outage").length;
  const offlineSites    = sites.filter(st => st.status === "offline").length;

  return (
    <div className="h-full flex flex-col gap-3" style={{ background: "#0B0B0F", padding: "12px", maxHeight: "100vh", overflow: "hidden" }}>

      {/* ── Row 1: KPI DRAMA ────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3" style={{ flexShrink: 0 }}>
        <KPICard
          testId="kpi-active-alerts"
          label="System Alerts"
          Icon={Bell}
          value={s.alerts?.unacknowledged ?? 0}
          sub={`${criticalAlerts} CRITICAL · ${s.alerts?.warning ?? 0} WARNING`}
          color={criticalAlerts > 0 ? "#FF2A2A" : s.alerts?.warning > 0 ? "#FFB014" : "#00FF66"}
          glowColor={criticalAlerts > 0 ? "#FF2A2A60" : s.alerts?.warning > 0 ? "#FFB01440" : null}
        />
        <KPICard
          testId="kpi-circuits"
          label="Network Availability"
          Icon={Wifi}
          value={`${((s.circuits?.up / s.circuits?.total) * 100 || 0).toFixed(1)}%`}
          sub={`${circuitsDown} CIRCUITS OFFLINE · ${s.circuits?.degraded ?? 0} DEGRADED`}
          color={circuitsDown > 0 ? "#FF2A2A" : s.circuits?.degraded > 0 ? "#FFB014" : "#00FF66"}
          glowColor={circuitsDown > 0 ? "#FF2A2A40" : null}
        />
        <KPICard
          testId="kpi-vendors"
          label="External Services"
          Icon={Activity}
          value={`${vendors.filter(v => v.status === "operational").length}/${vendors.length}`}
          sub={`${criticalVendors} VENDOR OUTAGES REPORTED`}
          color={criticalVendors > 0 ? "#FF2A2A" : "#00E5FF"}
          glowColor={criticalVendors > 0 ? "#FF2A2A40" : null}
        />
        <KPICard
          testId="kpi-tickets"
          label="Response Queue"
          Icon={Ticket}
          value={(s.tickets?.open ?? 0) + (s.tickets?.in_progress ?? 0)}
          sub={`${s.tickets?.critical ?? 0} TICKETS AT CRITICAL PRIORITY`}
          color={s.tickets?.critical > 0 ? "#FF2A2A" : "#E2E2E5"}
        />
      </div>

      {/* ── MAIN CONTENT SPLIT ────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12, minHeight: 0 }}>
        
        {/* LEFT COLUMN: Map & Site Strip */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
          <div className="card flex flex-col" style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <div className="card-header" style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, background: "rgba(15, 15, 20, 0.85)", backdropFilter: "blur(4px)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Network size={14} style={{ color: "#00E5FF" }} />
                GLOBAL TOPOLOGY MESH
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
                {[["#00FF66","ACTIVE"],["#FFB014","DEGRADED"],["#FF2A2A","OFFLINE"]].map(([c, l]) => (
                  <span key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: "#A1A1AA", letterSpacing: "0.1em" }}>
                    <div style={{ width: 6, height: 6, background: c, boxShadow: `0 0 4px ${c}` }} /> {l}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, background: "#030305" }}>
              <MapEmbed />
            </div>
          </div>

          {/* DIA Circuits Strip */}
          <div className="card" style={{ height: 80, padding: "12px 16px", overflow: "hidden" }}>
            <div className="section-label" style={{ marginBottom: 10 }}>DIA CIRCUIT STATUS ENGINE</div>
            <div style={{ display: "flex", gap: 20, overflowX: "auto", paddingBottom: 5 }}>
              {sites.map(site => (
                <div key={site.id} style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", flexShrink: 0 }}>
                  <div className={site.status === "online" ? "dot-online" : "dot-offline"} style={{ width: 8, height: 8 }} />
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: site.status === "online" ? "#E2E2E5" : "#FF2A2A" }}>
                    {site.name}
                  </span>
                  <span style={{ fontSize: 9, color: "#3A3A48" }}>{site.bandwidth_mbps}M</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Alerts, Vendors, Tickets */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
          
          {/* Active Alerts */}
          <div className="card flex flex-col" style={{ flex: 1.2, minHeight: 0 }}>
            <div className="card-header">
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShieldAlert size={14} style={{ color: "#FF2A2A" }} />
                CRITICAL EVENT STREAM
              </span>
              <Link to="/alerts" className="btn" style={{ fontSize: 9, padding: "2px 8px", color: "#A1A1AA", textDecoration: "none" }}>ALL EVENTS</Link>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {alerts.length === 0 ? (
                <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: 0.3 }}>
                  <CheckCircle size={32} strokeWidth={1} />
                  <div className="section-label" style={{ marginTop: 12 }}>All Systems Nominal</div>
                </div>
              ) : (
                alerts.map(alert => {
                  const cfg = SEV_CONFIG[alert.severity] || SEV_CONFIG.info;
                  return (
                    <div key={alert.id} className={`table-row`} style={{ padding: "12px 16px", borderLeft: `3px solid ${cfg.text}`, borderBottom: "1px solid #1C1C24" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: cfg.text, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em" }}>{cfg.label}</span>
                        <span style={{ color: "#3A3A48", fontSize: 9 }}>{formatDistanceToNowStrict(parseISO(alert.created_at))} AGO</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#FAFAFA", marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {alert.title}
                      </div>
                      <div style={{ fontSize: 9, color: "#A1A1AA", display: "flex", gap: 8 }}>
                        <span style={{ color: "#00E5FF" }}>{alert.site}</span>
                        <span style={{ color: "#3A3A48" }}>//</span>
                        <span>{alert.device || "SYSTEM"}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Vendor Matrix Grid */}
          <div className="card" style={{ flex: 0.8, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div className="card-header">
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Server size={14} style={{ color: "#00FF66" }} />
                VENDOR HEALTH MATRIX
              </span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
              {vendors.map(vendor => {
                const cfg = VENDOR_STATUS[vendor.status] || VENDOR_STATUS.unknown;
                return (
                  <div 
                    key={vendor.id} 
                    style={{ 
                      padding: "8px", 
                      background: "#131318", 
                      border: "1px solid #1C1C24",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      justifyContent: "center",
                      alignItems: "center",
                      textAlign: "center"
                    }}
                  >
                    <div style={{ position: "relative", width: 8, height: 8 }}>
                      {vendor.status !== "operational" && <div className={`ping absolute ${cfg.dot}`} style={{ width: 8, height: 8 }} />}
                      <div className={cfg.dot} style={{ width: 8, height: 8 }} />
                    </div>
                    <div style={{ fontSize: 8, color: "#A1A1AA", textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", width: "100%" }}>
                      {vendor.name.split(' ')[0]}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Compact Tickets — live from Vivantio */}
          <div className="card" style={{ height: 180, display: "flex", flexDirection: "column" }}>
            <div className="card-header">
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Ticket size={14} style={{ color: "#FFB014" }} />
                INCIDENT QUEUE
              </span>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {tickets.length === 0 ? (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.3 }}>
                  <div className="section-label">No Open Tickets</div>
                </div>
              ) : tickets.map(t => (
                <div key={t.id} className="table-row" style={{ display: "flex", alignItems: "center", padding: "8px 16px", borderBottom: "1px solid #1C1C24" }}>
                  <div style={{ width: 3, height: 16, background: PRI_COLOR[t.priority?.toLowerCase()] || PRI_COLOR.low, marginRight: 12, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: "#D4D4D8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                    <div style={{ fontSize: 9, color: "#3A3A48" }}>{t.ticket_number || t.id} · {(t.status || "").replace("_", " ")}</div>
                  </div>
                  <ArrowRight size={10} style={{ color: "#1C1C24" }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── FOOTER STATUS LINE ──────────────────────────────────────── */}
      <div style={{ 
        height: 24, 
        background: "#030305", 
        border: "1px solid #1C1C24", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between", 
        padding: "0 16px",
        fontSize: 9,
        color: "#3A3A48",
        letterSpacing: "0.15em"
      }}>
        <div style={{ display: "flex", gap: 20 }}>
          <span>SYSTEM_OS: v4.2.0-STABLE</span>
          <span>LATENCY: 14ms</span>
          <span>NODE: US-EAST-01</span>
        </div>
        <div style={{ display: "flex", gap: 20, color: "#00E5FF" }}>
          <span>REFRESH_CYCLE: 30S</span>
          <span>{format(new Date(), "yyyy-MM-dd HH:mm:ss").toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}