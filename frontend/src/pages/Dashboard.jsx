import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Bell, Network, Ticket, Activity, AlertTriangle, CheckCircle, ArrowRight } from "lucide-react";
import { format, parseISO, formatDistanceToNowStrict } from "date-fns";
import { Link } from "react-router-dom";
import MapEmbed from "../components/MapEmbed";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SEV_CONFIG = {
  critical: { bar: "alert-critical", text: "#F87171", badge: "badge-red",  label: "CRIT" },
  warning:  { bar: "alert-warning",  text: "#FCD34D", badge: "badge-amber", label: "WARN" },
  info:     { bar: "alert-info",     text: "#60A5FA", badge: "badge-blue",  label: "INFO" },
};

const PRI_COLOR = { critical: "#F87171", high: "#FB923C", medium: "#FCD34D", low: "#71717A" };

const VENDOR_STATUS = {
  operational: { color: "#4ADE80", dot: "dot-online",   label: "OK" },
  minor_outage: { color: "#FCD34D", dot: "dot-degraded", label: "MINOR" },
  major_outage: { color: "#F87171", dot: "dot-offline",  label: "DOWN" },
  unknown: { color: "#52525B", dot: "dot-unknown", label: "—" },
};

function KPICard({ testId, label, value, sub, color = "#FAFAFA", icon: Icon }) {
  return (
    <div data-testid={testId} className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "#52525B" }}>{label}</span>
        {Icon && <Icon size={14} strokeWidth={1.5} style={{ color: "#3F3F46" }} />}
      </div>
      <div className="text-3xl font-semibold tabular-nums leading-none mb-2"
        style={{ fontFamily: "Plus Jakarta Sans, sans-serif", color }}>
        {value}
      </div>
      {sub && <div className="text-xs" style={{ color: "#52525B" }}>{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);

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
      setAlerts(a.data.items.slice(0, 6));
      setVendors(v.data);
      setTickets(t.data.items.slice(0, 5));
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
    <div className="h-full flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
      </div>
      <div className="flex-1 grid grid-cols-5 gap-4">
        <div className="col-span-3 skeleton rounded-xl" />
        <div className="col-span-2 skeleton rounded-xl" />
      </div>
      <div className="grid grid-cols-5 gap-4" style={{ height: 260 }}>
        <div className="col-span-3 skeleton rounded-xl" />
        <div className="col-span-2 skeleton rounded-xl" />
      </div>
    </div>
  );

  const s = summary || {};
  const criticalVendors = vendors.filter(v => v.status === "major_outage").length;
  const offlineSites = sites.filter(s => s.status === "offline").length;

  return (
    <div className="h-full flex flex-col gap-4">

      {/* ── Row 1: KPI ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard testId="kpi-active-alerts" label="Active Alerts" icon={Bell}
          value={s.alerts?.unacknowledged ?? 0}
          sub={`${s.alerts?.critical ?? 0} critical · ${s.alerts?.warning ?? 0} warning`}
          color={s.alerts?.critical > 0 ? "#F87171" : s.alerts?.warning > 0 ? "#FCD34D" : "#4ADE80"}
        />
        <KPICard testId="kpi-circuits" label="DIA Circuits Online" icon={Network}
          value={`${s.circuits?.up ?? 0} / ${s.circuits?.total ?? 0}`}
          sub={`${s.circuits?.down ?? 0} down · ${s.circuits?.degraded ?? 0} degraded`}
          color={s.circuits?.down > 0 ? "#F87171" : s.circuits?.degraded > 0 ? "#FCD34D" : "#FAFAFA"}
        />
        <KPICard testId="kpi-tickets" label="Open Tickets" icon={Ticket}
          value={(s.tickets?.open ?? 0) + (s.tickets?.in_progress ?? 0)}
          sub={`${s.tickets?.critical ?? 0} critical · ${s.tickets?.open ?? 0} open`}
          color={s.tickets?.critical > 0 ? "#F87171" : "#FAFAFA"}
        />
        <KPICard testId="kpi-vendors" label="Vendor Health" icon={Activity}
          value={`${vendors.filter(v => v.status === "operational").length} / ${vendors.length}`}
          sub={`${offlineSites} site${offlineSites !== 1 ? "s" : ""} offline`}
          color={criticalVendors > 0 ? "#F87171" : "#FAFAFA"}
        />
      </div>

      {/* ── Row 2: Alerts + Vendor Status ─────────────────────────── */}
      <div className="flex-1 grid grid-cols-5 gap-4 min-h-0">

        {/* Alerts */}
        <div className="col-span-3 card flex flex-col min-h-0">
          <div className="card-header">
            <span className="text-sm font-semibold text-white" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Active Alerts</span>
            <Link to="/alerts" className="flex items-center gap-1 text-xs" style={{ color: "#52525B", textDecoration: "none" }}
              onMouseEnter={e => e.currentTarget.style.color = "#A1A1AA"}
              onMouseLeave={e => e.currentTarget.style.color = "#52525B"}>
              View all <ArrowRight size={11} />
            </Link>
          </div>
          <div className="flex-1 overflow-auto">
            {alerts.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle size={28} style={{ color: "#4ADE80" }} strokeWidth={1.5} />
                  <span className="text-sm" style={{ color: "#52525B" }}>No active alerts</span>
                </div>
              </div>
            ) : alerts.map(alert => {
              const cfg = SEV_CONFIG[alert.severity] || SEV_CONFIG.info;
              return (
                <div key={alert.id} data-testid={`alert-item-${alert.severity}`}
                  className={`flex items-start gap-3 px-5 py-3 table-row ${cfg.bar}`}
                  style={{ background: "transparent" }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: "#E4E4E7" }}>{alert.title}</div>
                    <div className="flex items-center gap-2 mt-0.5" style={{ fontSize: 11, color: "#52525B" }}>
                      {alert.site && <span>{alert.site}</span>}
                      {alert.device && <><span>·</span><span style={{ fontFamily: "JetBrains Mono, monospace" }}>{alert.device}</span></>}
                      <span>· {formatDistanceToNowStrict(parseISO(alert.created_at), { addSuffix: true })}</span>
                    </div>
                  </div>
                  <span className={`badge ${cfg.badge} flex-shrink-0 mt-0.5`}>{cfg.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Vendor Status */}
        <div className="col-span-2 card flex flex-col min-h-0">
          <div className="card-header">
            <span className="text-sm font-semibold text-white" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Vendor Status</span>
            <Link to="/status" className="flex items-center gap-1 text-xs" style={{ color: "#52525B", textDecoration: "none" }}
              onMouseEnter={e => e.currentTarget.style.color = "#A1A1AA"}
              onMouseLeave={e => e.currentTarget.style.color = "#52525B"}>
              Details <ArrowRight size={11} />
            </Link>
          </div>
          <div className="flex-1 overflow-auto">
            {vendors.map(vendor => {
              const cfg = VENDOR_STATUS[vendor.status] || VENDOR_STATUS.unknown;
              return (
                <div key={vendor.id} data-testid={`vendor-status-${vendor.id}`}
                  className="flex items-center justify-between px-5 py-3 table-row">
                  <span className="text-sm" style={{ color: "#D4D4D8" }}>{vendor.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="relative flex h-2 w-2">
                      {vendor.status !== "operational" && vendor.status !== "unknown" && (
                        <div className={`absolute inline-flex h-full w-full rounded-full opacity-75 ping ${cfg.dot}`} />
                      )}
                      <div className={`relative inline-flex rounded-full h-2 w-2 ${cfg.dot}`} />
                    </div>
                    <span className="text-xs tabular-nums" style={{ fontFamily: "JetBrains Mono, monospace", color: cfg.color }}>{cfg.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Row 3: Network Map + Tickets ───────────────────────────── */}
      <div className="grid grid-cols-5 gap-4" style={{ height: 270 }}>

        {/* Map */}
        <div className="col-span-3 card overflow-hidden flex flex-col">
          <div className="card-header py-3">
            <span className="text-sm font-semibold text-white" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Network Map</span>
            <div className="flex items-center gap-4" style={{ fontSize: 11, color: "#52525B" }}>
              {[["#22C55E", "Online"], ["#F59E0B", "Degraded"], ["#EF4444", "Offline"]].map(([c, l]) => (
                <span key={l} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: c }} />{l}
                </span>
              ))}
              <Link to="/map" className="flex items-center gap-1 ml-2" style={{ color: "#52525B", textDecoration: "none" }}
                onMouseEnter={e => e.currentTarget.style.color = "#A1A1AA"}
                onMouseLeave={e => e.currentTarget.style.color = "#52525B"}>
                Full view <ArrowRight size={10} />
              </Link>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <MapEmbed sites={sites} />
          </div>
        </div>

        {/* Recent Tickets */}
        <div className="col-span-2 card flex flex-col">
          <div className="card-header py-3">
            <span className="text-sm font-semibold text-white" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>Recent Tickets</span>
            <Link to="/tickets" className="flex items-center gap-1 text-xs" style={{ color: "#52525B", textDecoration: "none" }}
              onMouseEnter={e => e.currentTarget.style.color = "#A1A1AA"}
              onMouseLeave={e => e.currentTarget.style.color = "#52525B"}>
              View all <ArrowRight size={11} />
            </Link>
          </div>
          <div className="flex-1 overflow-auto">
            {tickets.map(t => (
              <div key={t.id} data-testid={`ticket-item-${t.id}`}
                className="flex items-center gap-3 px-5 py-3 table-row">
                <div className="w-1 h-7 rounded-full flex-shrink-0"
                  style={{ background: PRI_COLOR[t.priority] || "#3F3F46" }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate" style={{ color: "#D4D4D8" }}>{t.title}</div>
                  <div className="text-xs mt-0.5" style={{ color: "#52525B", fontFamily: "JetBrains Mono, monospace" }}>
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
