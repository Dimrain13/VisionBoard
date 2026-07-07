import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Plus, Edit2, Trash2, X } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_CFG = {
  up:       { badge: "badge-green", label: "UP",       color: "#00FF66" },
  down:     { badge: "badge-red",   label: "DOWN",     color: "#FF2A2A" },
  degraded: { badge: "badge-amber", label: "DEGRADED", color: "#FFB014" },
  unknown:  { badge: "badge-zinc",  label: "UNKNOWN",  color: "#3A3A48" },
};

const EMPTY = { site: "", provider: "", circuit_id: "", bandwidth_mbps: 100, ip_address: "", status: "up", notes: "" };

export default function DIACircuits() {
  const [circuits, setCircuits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => {
    try { const res = await axios.get(`${API}/circuits`); setCircuits(res.data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv); }, [load]);

  const submit = async () => {
    if (editId) await axios.put(`${API}/circuits/${editId}`, form);
    else await axios.post(`${API}/circuits`, form);
    setShowForm(false); setEditId(null); setForm(EMPTY); load();
  };

  const openEdit = (c) => {
    setForm({ site: c.site, provider: c.provider, circuit_id: c.circuit_id, bandwidth_mbps: c.bandwidth_mbps, ip_address: c.ip_address || "", status: c.status, notes: c.notes || "" });
    setEditId(c.id); setShowForm(true);
  };

  const del = async (id) => { await axios.delete(`${API}/circuits/${id}`); load(); };

  const summary = {
    up: circuits.filter(c => c.status === "up").length,
    down: circuits.filter(c => c.status === "down").length,
    degraded: circuits.filter(c => c.status === "degraded").length,
  };

  return (
    <div className="h-full flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="section-label mb-1.5">Network Infrastructure</div>
          <h1 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 600, color: "#FAFAFA", letterSpacing: "0.12em" }}>
            DIA CIRCUITS
          </h1>
        </div>
        <button data-testid="add-circuit-btn" onClick={() => { setForm(EMPTY); setEditId(null); setShowForm(true); }} className="btn btn-primary">
          <Plus size={11} /> ADD CIRCUIT
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-3">
        {[["CIRCUITS UP", summary.up, "#00FF66"], ["DEGRADED", summary.degraded, "#FFB014"], ["DOWN", summary.down, "#FF2A2A"]].map(([l, v, c]) => (
          <div key={l} className="card p-4 text-center" style={{ borderLeft: `2px solid ${c}` }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 30, fontWeight: 700, color: c, lineHeight: 1 }}>{v}</div>
            <div className="section-label mt-2">{l}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 card overflow-hidden flex flex-col min-h-0">
        <div className="card-header">
          <span className="section-label">{circuits.length} CIRCUITS MONITORED</span>
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full" data-testid="circuits-table">
            <thead>
              <tr>
                {["Site", "Provider", "Circuit ID", "Bandwidth", "IP Address", "Status", "Notes", ""].map(h => (
                  <th key={h} className="th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-10" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#27272A", letterSpacing: "0.2em" }}>
                  [ LOADING... ]
                </td></tr>
              ) : circuits.map(c => {
                const st = STATUS_CFG[c.status] || STATUS_CFG.unknown;
                return (
                  <tr key={c.id} data-testid={`circuit-row-${c.id}`} className="table-row">
                    <td className="px-4 py-3" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#D4D4D8", fontWeight: 600 }}>{c.site}</td>
                    <td className="px-4 py-3" style={{ fontSize: 12, color: "#71717A" }}>{c.provider}</td>
                    <td className="px-4 py-3" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#A1A1AA" }}>{c.circuit_id}</td>
                    <td className="px-4 py-3" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#52525B" }}>{c.bandwidth_mbps} Mbps</td>
                    <td className="px-4 py-3" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#3F3F46" }}>{c.ip_address || "—"}</td>
                    <td className="px-4 py-3"><span className={`badge ${st.badge}`}>{st.label}</span></td>
                    <td className="px-4 py-3" style={{ fontSize: 11, color: "#3F3F46", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.notes || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button data-testid={`edit-circuit-${c.id}`} onClick={() => openEdit(c)} className="btn" style={{ padding: "4px 8px" }}>
                          <Edit2 size={10} />
                        </button>
                        <button data-testid={`delete-circuit-${c.id}`} onClick={() => del(c.id)} className="btn btn-danger" style={{ padding: "4px 8px" }}>
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="modal-backdrop">
          <div className="card p-6" style={{ width: "100%", maxWidth: 520 }}>
            <div className="flex items-center justify-between mb-5">
              <h3 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, color: "#FAFAFA", letterSpacing: "0.18em" }}>
                {editId ? "// EDIT CIRCUIT" : "// ADD CIRCUIT"}
              </h3>
              <button onClick={() => setShowForm(false)} className="btn" style={{ padding: "4px 8px", borderColor: "transparent" }}>
                <X size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[["SITE", "site", "Novi"], ["PROVIDER", "provider", "AT&T"], ["CIRCUIT ID", "circuit_id", "ATT-NV-0034"], ["IP ADDRESS", "ip_address", "203.0.113.1"]].map(([l, k, ph]) => (
                <div key={k}>
                  <div className="section-label mb-1.5">{l}</div>
                  <input data-testid={`circuit-${k}-input`} placeholder={ph} className="input"
                    value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
                </div>
              ))}
              <div>
                <div className="section-label mb-1.5">BANDWIDTH (MBPS)</div>
                <input data-testid="circuit-bandwidth-input" type="number" min="1" className="input"
                  value={form.bandwidth_mbps} onChange={e => setForm(f => ({ ...f, bandwidth_mbps: parseInt(e.target.value) || 0 }))} />
              </div>
              <div>
                <div className="section-label mb-1.5">STATUS</div>
                <select data-testid="circuit-status-select" className="input"
                  value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="up">UP</option>
                  <option value="down">DOWN</option>
                  <option value="degraded">DEGRADED</option>
                  <option value="unknown">UNKNOWN</option>
                </select>
              </div>
            </div>
            <div className="mt-3">
              <div className="section-label mb-1.5">NOTES</div>
              <input data-testid="circuit-notes-input" placeholder="Optional notes" className="input"
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-5">
              <button onClick={() => setShowForm(false)} className="btn">CANCEL</button>
              <button data-testid="submit-circuit-btn" onClick={submit} className="btn btn-primary">
                {editId ? "UPDATE" : "CREATE"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
