import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Bell, Network, Ticket, CheckCircle } from "lucide-react";
import { format, parseISO } from "date-fns";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SEV_STYLE = {
  critical: { border: "rgba(255,0,60,0.25)", bg: "rgba(255,0,60,0.05)", dot: "#FF003C", text: "#FF6B7A" },
  warning:  { border: "rgba(255,215,0,0.25)", bg: "rgba(255,215,0,0.05)", dot: "#FFD700", text: "#FFD700" },
  info:     { border: "rgba(0,240,255,0.2)",  bg: "rgba(0,240,255,0.05)", dot: "#00F0FF", text: "#00F0FF" },
};

function KPI({ testId, label, value, sub, color }) {
  const colors = { cyan: "#00F0FF", red: "#FF003C", yellow: "#FFD700", gray: "#6B7280" };
  return (
    <div data-testid={testId} className="dash-card p-5">
      <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "#4A5568", fontFamily: "JetBrains Mono, monospace" }}>{label}</div>
      <div className="text-4xl font-bold mb-1" style={{ fontFamily: "JetBrains Mono, monospace", color: colors[color] || colors.cyan }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: "#4A5568" }}>{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    try {
      const [s, a, v, t] = await Promise.all([
        axios.get(`${API}/dashboard/summary`),
        axios.get(`${API}/alerts`, { params: { acknowledged: false } }),
        axios.get(`${API}/vendor-status`),
        axios.get(`${API}/tickets`),
      ]);
      setSummary(s.data);
      setAlerts(a.data.items.slice(0, 7));
      setVendors(v.data);
      setTickets(t.data.items.slice(0, 5));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadAll();
    const iv = setInterval(loadAll, 30000);
    return () => clearInterval(iv);
  }, [loadAll]);

  if (loading) return (
    <div className="h-full flex items-center justify-center">
      <span className="cursor-blink" style={{ fontFamily: "JetBrains Mono, monospace", color: "#00F0FF", fontSize: 14 }}>LOADING SYSTEMS</span>
    </div>
  );

  const s = summary || {};
  const criticalVendors = vendors.filter(v => v.status === "major_outage").length;

  return (
    <div className="h-full flex flex-col gap-4">
      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-4">
        <KPI testId="kpi-active-alerts" label="Active Alerts" value={s.alerts?.unacknowledged ?? 0}
          sub={`${s.alerts?.critical ?? 0} critical · ${s.alerts?.warning ?? 0} warning`}
          color={s.alerts?.critical > 0 ? "red" : "yellow"} />
        <KPI testId="kpi-circuits" label="DIA Circuits" value={`${s.circuits?.up ?? 0}/${s.circuits?.total ?? 0}`}
          sub={`${s.circuits?.down ?? 0} down · ${s.circuits?.degraded ?? 0} degraded`}
          color={s.circuits?.down > 0 ? "red" : s.circuits?.degraded > 0 ? "yellow" : "cyan"} />
        <KPI testId="kpi-tickets" label="Open Tickets" value={(s.tickets?.open ?? 0) + (s.tickets?.in_progress ?? 0)}
          sub={`${s.tickets?.critical ?? 0} critical priority`}
          color={s.tickets?.critical > 0 ? "red" : "yellow"} />
        <KPI testId="kpi-vendors" label="Vendor Health" value={`${vendors.filter(v => v.status === "operational").length}/${vendors.length}`}
          sub={`${criticalVendors} with major issues`}
          color={criticalVendors > 0 ? "red" : "cyan"} />
      </div>

      {/* Middle Row */}
      <div className="flex-1 grid grid-cols-3 gap-4 min-h-0">
        {/* Alert list */}
        <div className="col-span-2 dash-card p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3">
            <h2 style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 16, fontWeight: 600, color: "#fff", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Active Alerts
            </h2>
            <a href="/alerts" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#00F0FF" }}>VIEW ALL →</a>
          </div>
          <div className="flex-1 overflow-auto space-y-2">
            {alerts.length === 0 ? (
              <div className="text-center py-8" style={{ fontFamily: "JetBrains Mono, monospace", color: "#374151", fontSize: 12 }}>NO ACTIVE ALERTS</div>
            ) : alerts.map(alert => {
              const st = SEV_STYLE[alert.severity] || SEV_STYLE.info;
              return (
                <div key={alert.id} data-testid={`alert-item-${alert.severity}`}
                  className={`flex items-start gap-3 p-3 rounded text-sm ${alert.severity === "critical" && "pulse-critical"}`}
                  style={{ border: `1px solid ${st.border}`, background: st.bg }}
                >
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: st.dot }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate" style={{ color: st.text }}>{alert.title}</div>
                    <div className="text-xs mt-0.5 flex items-center gap-2" style={{ color: "#4A5568", fontFamily: "JetBrains Mono, monospace" }}>
                      {alert.site && <span>{alert.site}</span>}
                      {alert.device && <><span>·</span><span>{alert.device}</span></>}
                      <span>· {format(parseISO(alert.created_at), "HH:mm")}</span>
                    </div>
                  </div>
                  <span className="text-xs uppercase flex-shrink-0" style={{ fontFamily: "JetBrains Mono, monospace", color: st.text }}>{alert.severity}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Vendor Status */}
        <div className="dash-card p-4 flex flex-col min-h-0">
          <h2 className="mb-3" style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 16, fontWeight: 600, color: "#fff", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Vendor Status
          </h2>
          <div className="flex-1 overflow-auto space-y-2">
            {vendors.map(vendor => (
              <div key={vendor.id} data-testid={`vendor-status-${vendor.id}`}
                className="flex items-center justify-between p-2.5 rounded"
                style={{ border: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }}
              >
                <span className="text-sm font-medium" style={{ color: "#D1D5DB" }}>{vendor.name}</span>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${vendor.status !== "operational" && vendor.status !== "unknown" ? "pulse-dot" : ""}`}
                    style={{ background: vendor.status === "operational" ? "#00F0FF" : vendor.status === "minor_outage" ? "#FFD700" : vendor.status === "major_outage" ? "#FF003C" : "#374151" }}
                  />
                  <span className="text-xs uppercase" style={{
                    fontFamily: "JetBrains Mono, monospace",
                    color: vendor.status === "operational" ? "#00F0FF" : vendor.status === "minor_outage" ? "#FFD700" : vendor.status === "major_outage" ? "#FF003C" : "#6B7280"
                  }}>
                    {vendor.status === "operational" ? "OK" : vendor.status === "minor_outage" ? "MINOR" : vendor.status === "major_outage" ? "DOWN" : "?"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-2 gap-4" style={{ height: 160 }}>
        {/* Recent Tickets */}
        <div className="dash-card p-4 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h2 style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 15, fontWeight: 600, color: "#fff", letterSpacing: "0.1em", textTransform: "uppercase" }}>Recent Tickets</h2>
            <a href="/tickets" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#00F0FF" }}>VIEW ALL →</a>
          </div>
          <div className="overflow-auto space-y-1.5 flex-1">
            {tickets.map(t => (
              <div key={t.id} data-testid={`ticket-item-${t.id}`} className="flex items-center gap-3 text-sm">
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#374151", flexShrink: 0 }}>{t.ticket_number}</span>
                <span className="truncate flex-1" style={{ color: "#9CA3AF" }}>{t.title}</span>
                <span className="flex-shrink-0 text-xs uppercase" style={{
                  fontFamily: "JetBrains Mono, monospace",
                  color: t.priority === "critical" ? "#FF003C" : t.priority === "high" ? "#F97316" : t.priority === "medium" ? "#FFD700" : "#6B7280"
                }}>{t.priority}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Circuit Overview */}
        <div className="dash-card p-4 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h2 style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 15, fontWeight: 600, color: "#fff", letterSpacing: "0.1em", textTransform: "uppercase" }}>Circuit Overview</h2>
            <a href="/circuits" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#00F0FF" }}>VIEW ALL →</a>
          </div>
          <div className="flex-1 flex items-center">
            <div className="grid grid-cols-3 gap-4 w-full">
              {[
                { label: "Up", val: s.circuits?.up ?? 0, color: "#00F0FF" },
                { label: "Degraded", val: s.circuits?.degraded ?? 0, color: "#FFD700" },
                { label: "Down", val: s.circuits?.down ?? 0, color: "#FF003C" },
              ].map(({ label, val, color }) => (
                <div key={label} className="text-center">
                  <div className="text-3xl font-bold" style={{ fontFamily: "JetBrains Mono, monospace", color }}>{val}</div>
                  <div className="text-xs uppercase tracking-widest mt-1" style={{ color: "#4A5568" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
