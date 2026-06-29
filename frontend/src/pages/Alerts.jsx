import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { CheckCircle, Trash2, Plus, X } from "lucide-react";
import { format, parseISO } from "date-fns";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SEV = {
  critical: { border: "rgba(255,0,60,0.3)", bg: "rgba(255,0,60,0.06)", dot: "#FF003C", text: "#FF6B7A", label: "CRITICAL" },
  warning:  { border: "rgba(255,215,0,0.3)", bg: "rgba(255,215,0,0.06)", dot: "#FFD700", text: "#FFD700", label: "WARNING" },
  info:     { border: "rgba(0,240,255,0.2)", bg: "rgba(0,240,255,0.05)", dot: "#00F0FF", text: "#00F0FF", label: "INFO" },
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
    await axios.post(`${API}/alerts`, form);
    setShowForm(false); setForm(EMPTY); load();
  };

  const counts = {
    unacked: alerts.filter(a => !a.acknowledged).length,
    critical: alerts.filter(a => a.severity === "critical").length,
    warning: alerts.filter(a => a.severity === "warning").length,
    info: alerts.filter(a => a.severity === "info").length,
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "0.12em", textTransform: "uppercase" }}>Alert Center</h1>
        <button data-testid="add-alert-btn" onClick={() => { setForm(EMPTY); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded text-sm transition-colors"
          style={{ border: "1px solid rgba(0,240,255,0.4)", color: "#00F0FF", fontFamily: "JetBrains Mono, monospace" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(0,240,255,0.08)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          <Plus size={14} /> ADD ALERT
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        {[["Unacknowledged", counts.unacked, "#fff"],["Critical", counts.critical, "#FF003C"],["Warning", counts.warning, "#FFD700"],["Info", counts.info, "#00F0FF"]].map(([l, v, c]) => (
          <div key={l} className="dash-card p-4 text-center">
            <div className="text-3xl font-bold" style={{ fontFamily: "JetBrains Mono, monospace", color: c }}>{v}</div>
            <div className="text-xs uppercase tracking-widest mt-1" style={{ color: "#4A5568" }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center">
        <span className="text-xs uppercase tracking-widest" style={{ color: "#4A5568", fontFamily: "JetBrains Mono, monospace" }}>Filter:</span>
        {[["", "ALL"], ["critical", "CRITICAL"], ["warning", "WARNING"], ["info", "INFO"]].map(([v, l]) => (
          <button key={l} data-testid={`filter-${v || "all"}`} onClick={() => setFilter(v)}
            className="px-3 py-1 text-xs rounded transition-colors"
            style={{
              border: filter === v ? "1px solid #00F0FF" : "1px solid rgba(255,255,255,0.1)",
              color: filter === v ? "#00F0FF" : "#6B7280",
              background: filter === v ? "rgba(0,240,255,0.08)" : "transparent",
              fontFamily: "JetBrains Mono, monospace",
            }}
          >{l}</button>
        ))}
      </div>

      {/* Alert list */}
      <div className="flex-1 overflow-auto space-y-2">
        {loading ? (
          <div className="text-center py-8" style={{ fontFamily: "JetBrains Mono, monospace", color: "#00F0FF", fontSize: 12 }}>LOADING...</div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-12" style={{ fontFamily: "JetBrains Mono, monospace", color: "#374151", fontSize: 12 }}>NO ALERTS FOUND</div>
        ) : alerts.map(alert => {
          const st = SEV[alert.severity] || SEV.info;
          return (
            <div key={alert.id} data-testid={`alert-row-${alert.id}`}
              className={`flex items-start gap-4 p-4 rounded ${alert.severity === "critical" && !alert.acknowledged ? "pulse-critical" : ""}`}
              style={{ border: `1px solid ${st.border}`, background: st.bg, opacity: alert.acknowledged ? 0.5 : 1 }}
            >
              <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: st.dot }} />
              <div className="flex-1 min-w-0">
                <div className="font-medium" style={{ color: st.text }}>{alert.title}</div>
                <div className="text-sm mt-0.5" style={{ color: "#6B7280" }}>{alert.message}</div>
                <div className="flex items-center gap-3 mt-2 text-xs flex-wrap" style={{ color: "#4A5568", fontFamily: "JetBrains Mono, monospace" }}>
                  <span>{format(parseISO(alert.created_at), "MMM dd HH:mm")}</span>
                  {alert.site && <><span>·</span><span>{alert.site}</span></>}
                  {alert.device && <><span>·</span><span>{alert.device}</span></>}
                  {alert.acknowledged && <span style={{ color: "#4ADE80" }}>· ACK by {alert.acknowledged_by}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs uppercase px-2 py-0.5 rounded" style={{ fontFamily: "JetBrains Mono, monospace", color: st.text, border: `1px solid ${st.border}` }}>
                  {st.label}
                </span>
                {!alert.acknowledged && (
                  <button data-testid={`ack-btn-${alert.id}`} onClick={() => ack(alert.id)}
                    className="p-1.5 rounded transition-colors" style={{ color: "#4ADE80" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(74,222,128,0.1)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    title="Acknowledge">
                    <CheckCircle size={14} />
                  </button>
                )}
                <button data-testid={`delete-btn-${alert.id}`} onClick={() => del(alert.id)}
                  className="p-1.5 rounded transition-colors" style={{ color: "#4A5568" }}
                  onMouseEnter={e => { e.currentTarget.style.color = "#FF003C"; e.currentTarget.style.background = "rgba(255,0,60,0.08)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = "#4A5568"; e.currentTarget.style.background = "transparent"; }}
                  title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Modal */}
      {showForm && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div className="dash-card p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 17, fontWeight: 600, color: "#fff", letterSpacing: "0.1em", textTransform: "uppercase" }}>Add Alert</h3>
              <button onClick={() => setShowForm(false)} style={{ color: "#6B7280" }}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <input data-testid="alert-title-input" placeholder="Alert title"
                className="w-full px-3 py-2 rounded text-sm focus:outline-none"
                style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontFamily: "JetBrains Mono, monospace" }}
                value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              <textarea data-testid="alert-message-input" placeholder="Alert details" rows={3}
                className="w-full px-3 py-2 rounded text-sm focus:outline-none resize-none"
                style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontFamily: "JetBrains Mono, monospace" }}
                value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} />
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Severity", el: <select data-testid="alert-severity-select" className="w-full px-3 py-2 rounded text-sm focus:outline-none" style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontFamily: "JetBrains Mono, monospace" }} value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option></select> },
                  { label: "Site", el: <input data-testid="alert-site-input" placeholder="Site" className="w-full px-3 py-2 rounded text-sm focus:outline-none" style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontFamily: "JetBrains Mono, monospace" }} value={form.site} onChange={e => setForm(f => ({ ...f, site: e.target.value }))} /> },
                  { label: "Device", el: <input data-testid="alert-device-input" placeholder="Device" className="w-full px-3 py-2 rounded text-sm focus:outline-none" style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontFamily: "JetBrains Mono, monospace" }} value={form.device} onChange={e => setForm(f => ({ ...f, device: e.target.value }))} /> },
                ].map(({ label, el }) => (
                  <div key={label}>
                    <div className="text-xs mb-1" style={{ color: "#6B7280", fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase" }}>{label}</div>
                    {el}
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowForm(false)} style={{ color: "#6B7280", fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>CANCEL</button>
                <button data-testid="submit-alert-btn" onClick={submit}
                  className="px-4 py-2 rounded text-sm transition-colors"
                  style={{ border: "1px solid rgba(0,240,255,0.4)", color: "#00F0FF", fontFamily: "JetBrains Mono, monospace" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(0,240,255,0.08)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >CREATE ALERT</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
