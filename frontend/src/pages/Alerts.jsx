import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { CheckCircle, Trash2, Plus, X } from "lucide-react";
import { formatDistanceToNowStrict, parseISO } from "date-fns";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const SEV = {
  critical: { bar: "alert-critical", badge: "badge-red",  text: "#F87171", label: "CRITICAL" },
  warning:  { bar: "alert-warning",  badge: "badge-amber", text: "#FCD34D", label: "WARNING" },
  info:     { bar: "alert-info",     badge: "badge-blue",  text: "#60A5FA", label: "INFO" },
};
const EMPTY = { title: "", message: "", severity: "warning", site: "", device: "" };

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [filter, setFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const params = filter ? { severity: filter } : {};
      const res = await axios.get(`${API}/alerts`, { params });
      setAlerts(res.data.items);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, [load]);

  const ack = async (id) => { await axios.put(`${API}/alerts/${id}/acknowledge`); load(); };
  const del = async (id) => { await axios.delete(`${API}/alerts/${id}`); load(); };
  const submit = async () => {
    if (!form.title) return;
    await axios.post(`${API}/alerts`, form);
    setShowForm(false); setForm(EMPTY); load();
  };

  const counts = { unacked: alerts.filter(a => !a.acknowledged).length, critical: alerts.filter(a => a.severity === "critical").length, warning: alerts.filter(a => a.severity === "warning").length, info: alerts.filter(a => a.severity === "info").length };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 600, color: "#FAFAFA", letterSpacing: "0.12em" }}>ALERT CENTER</h1>
        <button data-testid="add-alert-btn" onClick={() => { setForm(EMPTY); setShowForm(true); }} className="btn btn-primary">
          <Plus size={13} /> Add Alert
        </button>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-4 gap-3">
        {[["Unacknowledged", counts.unacked, "#FAFAFA"], ["Critical", counts.critical, "#F87171"], ["Warning", counts.warning, "#FCD34D"], ["Info", counts.info, "#60A5FA"]].map(([l, v, c]) => (
          <div key={l} className="card p-4 text-center">
            <div className="text-3xl font-semibold tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace", color: c }}>{v}</div>
            <div className="section-label mt-1.5">{l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: "#52525B" }}>Filter:</span>
        {[["", "All"], ["critical", "Critical"], ["warning", "Warning"], ["info", "Info"]].map(([v, l]) => (
          <button key={l} data-testid={`filter-${v || "all"}`} onClick={() => setFilter(v)}
            className="px-3 py-1 rounded-md text-xs font-medium transition-all"
            style={{ background: filter === v ? "rgba(255,255,255,0.08)" : "transparent", color: filter === v ? "#FAFAFA" : "#71717A", border: filter === v ? "1px solid #3F3F46" : "1px solid transparent" }}>
            {l}
          </button>
        ))}
      </div>

      {/* Alerts */}
      <div className="flex-1 card overflow-hidden flex flex-col min-h-0">
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-6 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-14 rounded-lg" />)}</div>
          ) : alerts.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <CheckCircle size={32} style={{ color: "#4ADE80" }} strokeWidth={1.5} />
                <span className="text-sm" style={{ color: "#52525B" }}>No alerts match your filter</span>
              </div>
            </div>
          ) : alerts.map(alert => {
            const cfg = SEV[alert.severity] || SEV.info;
            return (
              <div key={alert.id} data-testid={`alert-row-${alert.id}`}
                className={`flex items-start gap-4 px-5 py-3.5 table-row ${cfg.bar}`}
                style={{ opacity: alert.acknowledged ? 0.45 : 1 }}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: "#E4E4E7" }}>{alert.title}</div>
                  <div className="text-xs mt-1 leading-relaxed line-clamp-1" style={{ color: "#71717A" }}>{alert.message}</div>
                  <div className="flex items-center gap-2 mt-1.5 text-xs" style={{ color: "#52525B", fontFamily: "JetBrains Mono, monospace" }}>
                    <span>{formatDistanceToNowStrict(parseISO(alert.created_at), { addSuffix: true })}</span>
                    {alert.site && <><span>·</span><span>{alert.site}</span></>}
                    {alert.device && <><span>·</span><span>{alert.device}</span></>}
                    {alert.acknowledged && <span style={{ color: "#4ADE80" }}>· Ack'd by {alert.acknowledged_by}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                  <span className={`badge ${cfg.badge}`}>{cfg.label}</span>
                  {!alert.acknowledged && (
                    <button data-testid={`ack-btn-${alert.id}`} onClick={() => ack(alert.id)} className="btn" style={{ padding: "4px 8px" }} title="Acknowledge">
                      <CheckCircle size={12} />
                    </button>
                  )}
                  <button data-testid={`delete-btn-${alert.id}`} onClick={() => del(alert.id)} className="btn" style={{ padding: "4px 8px", borderColor: "transparent" }} title="Delete"
                    onMouseEnter={e => e.currentTarget.style.color = "#F87171"}
                    onMouseLeave={e => e.currentTarget.style.color = ""}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="modal-backdrop">
          <div className="card p-6 w-full max-w-md" style={{ borderRadius: 16 }}>
            <div className="flex items-center justify-between mb-5">
              <h3 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, color: "#FAFAFA", letterSpacing: "0.15em" }}>ADD ALERT</h3>
              <button onClick={() => setShowForm(false)} className="btn" style={{ padding: "4px 8px", borderColor: "transparent" }}><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <input data-testid="alert-title-input" className="input" placeholder="Alert title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              <textarea data-testid="alert-message-input" className="input" style={{ height: 80, resize: "none" }} placeholder="Details" value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} />
              <div className="grid grid-cols-3 gap-2">
                <select data-testid="alert-severity-select" className="input" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                  <option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option>
                </select>
                <input data-testid="alert-site-input" className="input" placeholder="Site" value={form.site} onChange={e => setForm(f => ({ ...f, site: e.target.value }))} />
                <input data-testid="alert-device-input" className="input" placeholder="Device" value={form.device} onChange={e => setForm(f => ({ ...f, device: e.target.value }))} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setShowForm(false)} className="btn">Cancel</button>
                <button data-testid="submit-alert-btn" onClick={submit} className="btn btn-primary">Create Alert</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
