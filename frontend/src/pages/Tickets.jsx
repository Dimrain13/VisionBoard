import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Plus, Edit2, X } from "lucide-react";
import { format, parseISO } from "date-fns";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PRI_STYLE = {
  critical: "#FF003C", high: "#F97316", medium: "#FFD700", low: "#6B7280",
};
const STATUS_STYLE = {
  open:        { color: "#00F0FF", border: "rgba(0,240,255,0.3)",  bg: "rgba(0,240,255,0.06)" },
  in_progress: { color: "#FFD700", border: "rgba(255,215,0,0.3)",  bg: "rgba(255,215,0,0.06)" },
  resolved:    { color: "#4ADE80", border: "rgba(74,222,128,0.3)", bg: "rgba(74,222,128,0.05)" },
  closed:      { color: "#6B7280", border: "rgba(107,114,128,0.2)",bg: "rgba(107,114,128,0.04)" },
};

const EMPTY = { title: "", description: "", priority: "medium", status: "open", category: "", assigned_to: "", site: "" };

export default function Tickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [filterStatus, setFilterStatus] = useState("");

  const load = useCallback(async () => {
    try {
      const params = filterStatus ? { status: filterStatus } : {};
      const res = await axios.get(`${API}/tickets`, { params });
      setTickets(res.data.items);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filterStatus]);

  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, [load]);

  const submit = async () => {
    if (editId) await axios.put(`${API}/tickets/${editId}`, form);
    else await axios.post(`${API}/tickets`, form);
    setShowForm(false); setEditId(null); setForm(EMPTY); load();
  };

  const openEdit = (t) => {
    setForm({ title: t.title, description: t.description || "", priority: t.priority, status: t.status, category: t.category || "", assigned_to: t.assigned_to || "", site: t.site || "" });
    setEditId(t.id); setShowForm(true);
  };

  const counts = { open: tickets.filter(t => t.status === "open").length, in_progress: tickets.filter(t => t.status === "in_progress").length, critical: tickets.filter(t => t.priority === "critical").length };
  const inputStyle = { background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontFamily: "JetBrains Mono, monospace", borderRadius: 4 };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Ticket Queue <span style={{ fontSize: 13, color: "#4A5568", fontFamily: "JetBrains Mono, monospace", fontWeight: 400, letterSpacing: "normal", textTransform: "none" }}>Vivantio</span>
        </h1>
        <button data-testid="add-ticket-btn" onClick={() => { setForm(EMPTY); setEditId(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded text-sm transition-colors"
          style={{ border: "1px solid rgba(0,240,255,0.4)", color: "#00F0FF", fontFamily: "JetBrains Mono, monospace" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(0,240,255,0.08)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          <Plus size={14} /> NEW TICKET
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[["Open", counts.open, "#00F0FF"], ["In Progress", counts.in_progress, "#FFD700"], ["Critical Priority", counts.critical, "#FF003C"]].map(([l, v, c]) => (
          <div key={l} className="dash-card p-4 text-center">
            <div className="text-3xl font-bold" style={{ fontFamily: "JetBrains Mono, monospace", color: c }}>{v}</div>
            <div className="text-xs uppercase tracking-widest mt-1" style={{ color: "#4A5568" }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 items-center">
        <span className="text-xs uppercase tracking-widest" style={{ color: "#4A5568", fontFamily: "JetBrains Mono, monospace" }}>Status:</span>
        {[["", "ALL"], ["open", "OPEN"], ["in_progress", "IN PROGRESS"], ["resolved", "RESOLVED"], ["closed", "CLOSED"]].map(([v, l]) => (
          <button key={l} data-testid={`ticket-filter-${v || "all"}`} onClick={() => setFilterStatus(v)}
            className="px-3 py-1 text-xs rounded transition-colors"
            style={{
              border: filterStatus === v ? "1px solid #00F0FF" : "1px solid rgba(255,255,255,0.1)",
              color: filterStatus === v ? "#00F0FF" : "#6B7280",
              background: filterStatus === v ? "rgba(0,240,255,0.08)" : "transparent",
              fontFamily: "JetBrains Mono, monospace",
            }}
          >{l}</button>
        ))}
      </div>

      {/* Ticket cards */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="text-center py-8" style={{ fontFamily: "JetBrains Mono, monospace", color: "#00F0FF", fontSize: 12 }}>LOADING...</div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12" style={{ fontFamily: "JetBrains Mono, monospace", color: "#374151", fontSize: 12 }}>NO TICKETS FOUND</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {tickets.map(t => {
              const ss = STATUS_STYLE[t.status] || STATUS_STYLE.open;
              return (
                <div key={t.id} data-testid={`ticket-card-${t.id}`} className="dash-card p-4"
                  style={{ borderLeftColor: PRI_STYLE[t.priority], borderLeftWidth: 3 }}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs" style={{ fontFamily: "JetBrains Mono, monospace", color: "#374151" }}>{t.ticket_number}</span>
                      <span className="text-xs uppercase px-1.5 py-0.5 rounded" style={{ fontFamily: "JetBrains Mono, monospace", color: ss.color, border: `1px solid ${ss.border}`, background: ss.bg }}>
                        {t.status.replace("_", " ")}
                      </span>
                    </div>
                    <button data-testid={`edit-ticket-${t.id}`} onClick={() => openEdit(t)}
                      className="p-1.5 rounded flex-shrink-0" style={{ color: "#4A5568" }}
                      onMouseEnter={e => { e.currentTarget.style.color = "#00F0FF"; e.currentTarget.style.background = "rgba(0,240,255,0.08)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = "#4A5568"; e.currentTarget.style.background = "transparent"; }}>
                      <Edit2 size={12} />
                    </button>
                  </div>
                  <h3 className="text-sm font-medium leading-snug mb-1" style={{ color: "#E5E7EB" }}>{t.title}</h3>
                  {t.description && <p className="text-xs line-clamp-2" style={{ color: "#6B7280" }}>{t.description}</p>}
                  <div className="flex items-center gap-2 mt-3 flex-wrap" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#4A5568" }}>
                    <span style={{ color: PRI_STYLE[t.priority] }}>{t.priority.toUpperCase()}</span>
                    {t.site && <><span>·</span><span>{t.site}</span></>}
                    {t.assigned_to && <><span>·</span><span>{t.assigned_to}</span></>}
                    {t.category && <><span>·</span><span>{t.category}</span></>}
                    <span>· {format(parseISO(t.created_at), "MMM dd")}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div className="dash-card p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 17, fontWeight: 600, color: "#fff", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {editId ? "Edit Ticket" : "New Ticket"}
              </h3>
              <button onClick={() => setShowForm(false)} style={{ color: "#6B7280" }}><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <input data-testid="ticket-title-input" placeholder="Ticket title"
                className="w-full px-3 py-2 text-sm focus:outline-none" style={inputStyle}
                value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              <textarea data-testid="ticket-description-input" placeholder="Description" rows={3}
                className="w-full px-3 py-2 text-sm focus:outline-none resize-none" style={inputStyle}
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Priority", key: "priority", opts: ["critical", "high", "medium", "low"] },
                  { label: "Status", key: "status", opts: ["open", "in_progress", "resolved", "closed"] },
                ].map(({ label, key, opts }) => (
                  <div key={key}>
                    <div className="text-xs mb-1 uppercase" style={{ color: "#6B7280", fontFamily: "JetBrains Mono, monospace" }}>{label}</div>
                    <select data-testid={`ticket-${key}-select`} className="w-full px-3 py-2 text-sm focus:outline-none" style={inputStyle}
                      value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}>
                      {opts.map(o => <option key={o} value={o}>{o.replace("_", " ")}</option>)}
                    </select>
                  </div>
                ))}
                <div>
                  <div className="text-xs mb-1 uppercase" style={{ color: "#6B7280", fontFamily: "JetBrains Mono, monospace" }}>Category</div>
                  <input data-testid="ticket-category-input" placeholder="Network" className="w-full px-3 py-2 text-sm focus:outline-none" style={inputStyle}
                    value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs mb-1 uppercase" style={{ color: "#6B7280", fontFamily: "JetBrains Mono, monospace" }}>Site</div>
                  <input data-testid="ticket-site-input" placeholder="Site name" className="w-full px-3 py-2 text-sm focus:outline-none" style={inputStyle}
                    value={form.site} onChange={e => setForm(f => ({ ...f, site: e.target.value }))} />
                </div>
                <div>
                  <div className="text-xs mb-1 uppercase" style={{ color: "#6B7280", fontFamily: "JetBrains Mono, monospace" }}>Assigned To</div>
                  <input data-testid="ticket-assigned-input" placeholder="Assignee" className="w-full px-3 py-2 text-sm focus:outline-none" style={inputStyle}
                    value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowForm(false)} style={{ color: "#6B7280", fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>CANCEL</button>
                <button data-testid="submit-ticket-btn" onClick={submit}
                  className="px-4 py-2 rounded text-sm"
                  style={{ border: "1px solid rgba(0,240,255,0.4)", color: "#00F0FF", fontFamily: "JetBrains Mono, monospace" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(0,240,255,0.08)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >{editId ? "UPDATE" : "CREATE"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
