import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Bell, Network, Ticket, Activity, CheckCircle, ArrowRight,
  ShieldAlert, Wifi,
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
  minor_outage: { color: "#FFB014", dot: "dot-degraded", label: "MINOR" },
  major_outage: { color: "#FF2A2A", dot: "dot-offline",  label: "DOWN"  },
  unknown:      { color: "#3A3A48", dot: "dot-unknown",  label: "—"     },
};

const PRI_COLOR = {
  critical: "#FF2A2A",
  high:     "#FF6B14",
  medium:   "#FFB014",
  low:      "#3A3A48",
};

function KPICard({ testId, label, value, sub, color = "#E2E2E5", Icon, glowColor }) {
  return (
    <div data-testid={testId} className="card p-5" style={{ borderTop: `2px solid ${color}20` }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ flex: 1 }}>
          <div className="section-label" style={{ marginBottom: 10 }}>{label}</div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 36,
              fontWeight: 700,
              color,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              textShadow: glowColor ? `0 0 20px ${glowColor}` : "none",
            }}
          >
            {value}
          </div>
          {sub && (
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9.5,
              color: "#3A3A48",
              letterSpacing: "0.06em",
              marginTop: 8,
            }}>
              {sub}
            </div>
          )}
        </div>
        {Icon && (
          <Icon
            size={28}
            strokeWidth={1}
            style={{ color, opacity: 0.15, marginLeft: 12, flexShrink: 0, marginTop: 4 }}
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
      const [s, a, v, t, si] = await Promise.all([
        axios.get(`${API}/dashboard/summary`),
        axios.get(`${API}/alerts`, { params: { acknowledged: false } }),
        axios.get(`${API}/vendor-status`),
        axios.get(`${API}/tickets`),
        axios.get(`${API}/sites`),
      ]);
      setSummary(s.data);
      setAlerts(a.data.items.slice(0, 8));
      setVendors(v.data);
      setTickets(t.data.items.slice(0, 6));
      setSites(si.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadAll();
    const iv = setInterval(loadAll, 30000);
    return () => clearInterval(iv);
  }, [loadAll]);

  if (loading) return (
    <div className="h-full flex flex-col gap-3">
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 100 }} />)}
      </div>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
      <div style={{ height: 260, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
    <div className="h-full flex flex-col gap-3">

      {/* ── Row 1: KPI Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3" style={{ flexShrink: 0 }}>
        <KPICard
          testId="kpi-active-alerts"
          label="Active Alerts"
          Icon={Bell}
          value={s.alerts?.unacknowledged ?? 0}
          sub={`${criticalAlerts} critical · ${s.alerts?.warning ?? 0} warning`}
          color={criticalAlerts > 0 ? "#FF2A2A" : s.alerts?.warning > 0 ? "#FFB014" : "#00FF66"}
          glowColor={criticalAlerts > 0 ? "#FF2A2A40" : null}
        />
        <KPICard
          testId="kpi-circuits"
          label="DIA Circuits Online"
          Icon={Wifi}
          value={`${s.circuits?.up ?? 0} / ${circuitsTotal}`}
          sub={`${circuitsDown} down · ${s.circuits?.degraded ?? 0} degraded`}
          color={circuitsDown > 0 ? "#FF2A2A" : s.circuits?.degraded > 0 ? "#FFB014" : "#E2E2E5"}
        />
        <KPICard
          testId="kpi-tickets"
          label="Open Tickets"
          Icon={Ticket}
          value={(s.tickets?.open ?? 0) + (s.tickets?.in_progress ?? 0)}
          sub={`${s.tickets?.critical ?? 0} critical priority`}
          color={s.tickets?.critical > 0 ? "#FF2A2A" : "#E2E2E5"}
        />
        <KPICard
          testId="kpi-vendors"
          label="Vendor Health"
          Icon={Activity}
          value={`${vendors.filter(v => v.status === "operational").length} / ${vendors.length}`}
          sub={`${offlineSites} site${offlineSites !== 1 ? "s" : ""} offline`}
          color={criticalVendors > 0 ? "#FF2A2A" : "#E2E2E5"}
        />
      </div>

      {/* ── Row 2: Alert Feed + Vendor Status ────────────────────────── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "3fr 2fr", gap: 12, minHeight: 0 }}>

        {/* Alert Feed */}
        <div className="card flex flex-col min-h-0">
          <div className="card-header">
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldAlert size={12} style={{ color: "#FF2A2A" }} />
              ACTIVE ALERT FEED
            </span>
            <Link
              to="/alerts"
              style={{ display: "flex", alignItems: "center", gap: 6, color: "#3A3A48", textDecoration: "none", fontSize: 10, letterSpacing: "0.1em" }}
              onMouseEnter={e => e.currentTarget.style.color = "#00E5FF"}
              onMouseLeave={e => e.currentTarget.style.color = "#3A3A48"}
            >
              VIEW ALL <ArrowRight size={10} />
            </Link>
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            {alerts.length === 0 ? (
              <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <CheckCircle size={24} style={{ color: "#00FF66" }} strokeWidth={1.5} />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#3A3A48", letterSpacing: "0.15em" }}>
                  NO ACTIVE ALERTS
                </span>
              </div>
            ) : (
              alerts.map(alert => {
                const cfg = SEV_CONFIG[alert.severity] || SEV_CONFIG.info;
                return (
                  <div
                    key={alert.id}
                    data-testid={`alert-item-${alert.severity}`}
                    className={`table-row ${cfg.bar}`}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px" }}
                  >
                    <span className={`badge ${cfg.badge}`} style={{ flexShrink: 0 }}>{cfg.label}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "#E2E2E5", fontFamily: "'JetBrains Mono', monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {alert.title}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 3, fontSize: 10, color: "#3A3A48", fontFamily: "'JetBrains Mono', monospace" }}>
                        {alert.site && <span>{alert.site}</span>}
                        {alert.device && <><span>·</span><span>{alert.device}</span></>}
                        <span>· {formatDistanceToNowStrict(parseISO(alert.created_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Vendor Status */}
        <div className="card flex flex-col min-h-0">
          <div className="card-header">
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Network size={12} style={{ color: "#00E5FF", opacity: 0.7 }} />
              VENDOR STATUS
            </span>
            <Link
              to="/status"
              style={{ display: "flex", alignItems: "center", gap: 6, color: "#3A3A48", textDecoration: "none", fontSize: 10, letterSpacing: "0.1em" }}
              onMouseEnter={e => e.currentTarget.style.color = "#00E5FF"}
              onMouseLeave={e => e.currentTarget.style.color = "#3A3A48"}
            >
              DETAILS <ArrowRight size={10} />
            </Link>
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            {vendors.map(vendor => {
              const cfg = VENDOR_STATUS[vendor.status] || VENDOR_STATUS.unknown;
              return (
                <div
                  key={vendor.id}
                  data-testid={`vendor-status-${vendor.id}`}
                  className="table-row"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px" }}
                >
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#C0C0CC" }}>
                    {vendor.name}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: cfg.color, letterSpacing: "0.1em" }}>
                      {cfg.label}
                    </span>
                    <div style={{ position: "relative", display: "flex", width: 7, height: 7 }}>
                      {vendor.status !== "operational" && vendor.status !== "unknown" && (
                        <div className={`ping absolute ${cfg.dot}`} style={{ width: 7, height: 7 }} />
                      )}
                      <div className={`relative ${cfg.dot}`} style={{ width: 7, height: 7 }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Row 3: Network Map + Recent Tickets ──────────────────────── */}
      <div style={{ height: 260, display: "grid", gridTemplateColumns: "3fr 2fr", gap: 12, flexShrink: 0 }}>

        {/* Map */}
        <div className="card overflow-hidden flex flex-col">
          <div className="card-header">
            <span>NETWORK TOPOLOGY</span>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {[["#00FF66","ONLINE"],["#FFB014","DEGRADED"],["#FF2A2A","OFFLINE"]].map(([c, l]) => (
                <span key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9.5, color: "#3A3A48", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em" }}>
                  <span style={{ width: 5, height: 5, background: c, display: "inline-block", flexShrink: 0 }} />{l}
                </span>
              ))}
              <Link
                to="/map"
                style={{ display: "flex", alignItems: "center", gap: 5, color: "#3A3A48", textDecoration: "none", fontSize: 9.5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em" }}
                onMouseEnter={e => e.currentTarget.style.color = "#00E5FF"}
                onMouseLeave={e => e.currentTarget.style.color = "#3A3A48"}
              >
                FULL VIEW <ArrowRight size={9} />
              </Link>
            </div>
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <MapEmbed sites={sites} />
          </div>
        </div>

        {/* Recent Tickets */}
        <div className="card flex flex-col">
          <div className="card-header">
            <span>RECENT TICKETS</span>
            <Link
              to="/tickets"
              style={{ display: "flex", alignItems: "center", gap: 6, color: "#3A3A48", textDecoration: "none", fontSize: 10, letterSpacing: "0.1em" }}
              onMouseEnter={e => e.currentTarget.style.color = "#00E5FF"}
              onMouseLeave={e => e.currentTarget.style.color = "#3A3A48"}
            >
              VIEW ALL <ArrowRight size={10} />
            </Link>
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            {tickets.map(t => (
              <div
                key={t.id}
                data-testid={`ticket-item-${t.id}`}
                className="table-row"
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px" }}
              >
                <div style={{
                  width: 2,
                  height: 30,
                  background: PRI_COLOR[t.priority] || "#3A3A48",
                  flexShrink: 0,
                  boxShadow: t.priority === "critical" ? `0 0 6px ${PRI_COLOR.critical}` : "none",
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#C0C0CC", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.title}
                  </div>
                  <div style={{ fontSize: 9.5, fontFamily: "'JetBrains Mono', monospace", color: "#3A3A48", marginTop: 2, letterSpacing: "0.05em" }}>
                    {t.ticket_number} · {t.status.replace("_", " ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
