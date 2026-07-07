import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Plus, Edit2, X } from "lucide-react";
import { format, parseISO } from "date-fns";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PRI_COLOR  = { critical: "#FF2A2A", high: "#FF6B14", medium: "#FFB014", low: "#3A3A48" };
const PRI_BADGE  = { critical: "badge-red", high: "badge-amber", medium: "badge-amber", low: "badge-zinc" };

const STATUS_CFG = {
  open:        { badge: "badge-blue",  label: "OPEN"        },
  in_progress: { badge: "badge-amber", label: "IN PROGRESS" },
  resolved:    { badge: "badge-green", label: "RESOLVED"    },
  closed:      { badge: "badge-zinc",  label: "CLOSED"      },
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

  const counts = {
    open: tickets.filter(t => t.status === "open").length,
    in_progress: tickets.filter(t => t.status === "in_progress").length,
    critical: tickets.filter(t => t.priority === "critical").length,
  };

  return (
    <div className="h-full flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="section-label mb-1.5">Vivantio ITSM</div>
          <h1 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 600, color: "#FAFAFA", letterSpacing: "0.12em" }}>
            TICKET QUEUE
          </h1>
        </div>
        <button data-testid="add-ticket-btn" onClick={() => { setForm(EMPTY); setEditId(null); setShowForm(true); }} className="btn btn-primary">
          <Plus size={11} /> NEW TICKET
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-3">
        {[["OPEN", counts.open, "#00E5FF"], ["IN PROGRESS", counts.in_progress, "#FFB014"], ["CRITICAL PRIORITY", counts.critical, "#FF2A2A"]].map(([l, v, c]) => (
          <div key={l} className="card p-4 text-center" style={{ borderLeft: `2px solid ${c}` }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 30, fontWeight: 700, color: c, lineHeight: 1 }}>{v}</div>
            <div className="section-label mt-2">{l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <span className="section-label">FILTER:</span>
        {[["", "ALL"], ["open", "OPEN"], ["in_progress", "IN PROGRESS"], ["resolved", "RESOLVED"], ["closed", "CLOSED"]].map(([v, l]) => (
          <button key={l} data-testid={`ticket-filter-${v || "all"}`} onClick={() => setFilterStatus(v)}
            className="btn"
            style={{ color: filterStatus === v ? "#FAFAFA" : "#27272A", borderColor: filterStatus === v ? "#3F3F46" : "transparent" }}>
            {l}
          </button>
        ))}
      </div>

      {/* Tickets grid */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-32" />)}
          </div>
        ) : tickets.length === 0 ? (
          <div className="h-40 flex items-center justify-center" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#1F1F23", letterSpacing: "0.2em" }}>
            [ NO TICKETS FOUND ]
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {tickets.map(t => {
              const ss = STATUS_CFG[t.status] || STATUS_CFG.open;
              return (
                <div key={t.id} data-testid={`ticket-card-${t.id}`}
                  className="card p-4"
                  style={{ borderLeft: `2px solid ${PRI_COLOR[t.priority] || "#27272A"}` }}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: "#27272A", letterSpacing: "0.08em" }}>{t.ticket_number}</span>
                      <span className={`badge ${ss.badge}`}>{ss.label}</span>
                    </div>
                    <button data-testid={`edit-ticket-${t.id}`} onClick={() => openEdit(t)}
                      className="btn flex-shrink-0" style={{ padding: "3px 7px", borderColor: "transparent" }}>
                      <Edit2 size={10} />
                    </button>
                  </div>
                  <h3 style={{ fontSize: 13, fontWeight: 500, color: "#D4D4D8", lineHeight: 1.4, marginBottom: 4 }}>{t.title}</h3>
                  {t.description && (
                    <p style={{ fontSize: 11, color: "#3F3F46", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {t.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-3 flex-wrap"
                    style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#27272A", letterSpacing: "0.05em" }}>
                    <span className={`badge ${PRI_BADGE[t.priority] || "badge-zinc"}`}>{t.priority.toUpperCase()}</span>
                    {t.site && <span>{t.site}</span>}
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
        <div className="modal-backdrop">
          <div className="card p-6" style={{ width: "100%", maxWidth: 520 }}>
            <div className="flex items-center justify-between mb-5">
              <h3 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, color: "#FAFAFA", letterSpacing: "0.18em" }}>
                {editId ? "// EDIT TICKET" : "// NEW TICKET"}
              </h3>
              <button onClick={() => setShowForm(false)} className="btn" style={{ padding: "4px 8px", borderColor: "transparent" }}>
                <X size={14} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <div className="section-label mb-1.5">TITLE</div>
                <input data-testid="ticket-title-input" className="input" placeholder="Ticket title"
                  value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <div className="section-label mb-1.5">DESCRIPTION</div>
                <textarea data-testid="ticket-description-input" className="input" style={{ height: 72, resize: "none" }} placeholder="Details..."
                  value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[{ label: "PRIORITY", key: "priority", opts: ["critical","high","medium","low"] },
                  { label: "STATUS", key: "status", opts: ["open","in_progress","resolved","closed"] }].map(({ label, key, opts }) => (
                  <div key={key}>
                    <div className="section-label mb-1.5">{label}</div>
                    <select data-testid={`ticket-${key}-select`} className="input"
                      value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}>
                      {opts.map(o => <option key={o} value={o}>{o.replace("_"," ").toUpperCase()}</option>)}
                    </select>
                  </div>
                ))}
                <div>
                  <div className="section-label mb-1.5">CATEGORY</div>
                  <input data-testid="ticket-category-input" className="input" placeholder="Network"
                    value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="section-label mb-1.5">SITE</div>
                  <input data-testid="ticket-site-input" className="input" placeholder="Site"
                    value={form.site} onChange={e => setForm(f => ({ ...f, site: e.target.value }))} />
                </div>
                <div>
                  <div className="section-label mb-1.5">ASSIGNED TO</div>
                  <input data-testid="ticket-assigned-input" className="input" placeholder="Assignee"
                    value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowForm(false)} className="btn">CANCEL</button>
                <button data-testid="submit-ticket-btn" onClick={submit} className="btn btn-primary">
                  {editId ? "UPDATE" : "CREATE"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
