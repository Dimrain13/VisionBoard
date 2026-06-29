import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Plus, Edit2, Trash2, X } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_STYLE = {
  up:       { color: "#00F0FF", border: "rgba(0,240,255,0.35)",  bg: "rgba(0,240,255,0.08)" },
  down:     { color: "#FF003C", border: "rgba(255,0,60,0.35)",   bg: "rgba(255,0,60,0.08)" },
  degraded: { color: "#FFD700", border: "rgba(255,215,0,0.35)",  bg: "rgba(255,215,0,0.08)" },
  unknown:  { color: "#6B7280", border: "rgba(107,114,128,0.3)", bg: "rgba(107,114,128,0.06)" },
};

const EMPTY = { site: "", provider: "", circuit_id: "", bandwidth_mbps: 100, ip_address: "", status: "up", notes: "" };

export default function DIACircuits() {
  const [circuits, setCircuits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/circuits`);
      setCircuits(res.data);
    } catch (e) { console.error(e); }
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

  const summary = { up: circuits.filter(c => c.status === "up").length, down: circuits.filter(c => c.status === "down").length, degraded: circuits.filter(c => c.status === "degraded").length };

  const inputStyle = { background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontFamily: "JetBrains Mono, monospace", borderRadius: 4 };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "0.12em", textTransform: "uppercase" }}>DIA Circuits</h1>
        <button data-testid="add-circuit-btn" onClick={() => { setForm(EMPTY); setEditId(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded text-sm transition-colors"
          style={{ border: "1px solid rgba(0,240,255,0.4)", color: "#00F0FF", fontFamily: "JetBrains Mono, monospace" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(0,240,255,0.08)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          <Plus size={14} /> ADD CIRCUIT
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[["Up", summary.up, "#00F0FF"], ["Degraded", summary.degraded, "#FFD700"], ["Down", summary.down, "#FF003C"]].map(([l, v, c]) => (
          <div key={l} className="dash-card p-4 text-center">
            <div className="text-3xl font-bold" style={{ fontFamily: "JetBrains Mono, monospace", color: c }}>{v}</div>
            <div className="text-xs uppercase tracking-widest mt-1" style={{ color: "#4A5568" }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 dash-card overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm" data-testid="circuits-table">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(0,240,255,0.1)" }}>
                {["Site", "Provider", "Circuit ID", "Bandwidth", "IP Address", "Status", "Notes", ""].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wider"
                    style={{ color: "#4A5568", fontFamily: "JetBrains Mono, monospace" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-8" style={{ color: "#374151", fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>LOADING...</td></tr>
              ) : circuits.map(c => {
                const st = STATUS_STYLE[c.status] || STATUS_STYLE.unknown;
                return (
                  <tr key={c.id} data-testid={`circuit-row-${c.id}`}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <td className="px-4 py-3 font-medium" style={{ color: "#E5E7EB" }}>{c.site}</td>
                    <td className="px-4 py-3" style={{ color: "#9CA3AF" }}>{c.provider}</td>
                    <td className="px-4 py-3 text-xs" style={{ fontFamily: "JetBrains Mono, monospace", color: "#D1D5DB" }}>{c.circuit_id}</td>
                    <td className="px-4 py-3 text-xs" style={{ fontFamily: "JetBrains Mono, monospace", color: "#9CA3AF" }}>{c.bandwidth_mbps}Mbps</td>
                    <td className="px-4 py-3 text-xs" style={{ fontFamily: "JetBrains Mono, monospace", color: "#6B7280" }}>{c.ip_address || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs uppercase px-2 py-0.5 rounded" style={{ fontFamily: "JetBrains Mono, monospace", color: st.color, border: `1px solid ${st.border}`, background: st.bg }}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs max-w-xs truncate" style={{ color: "#6B7280" }}>{c.notes || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button data-testid={`edit-circuit-${c.id}`} onClick={() => openEdit(c)}
                          className="p-1.5 rounded transition-colors" style={{ color: "#4A5568" }}
                          onMouseEnter={e => { e.currentTarget.style.color = "#00F0FF"; e.currentTarget.style.background = "rgba(0,240,255,0.08)"; }}
                          onMouseLeave={e => { e.currentTarget.style.color = "#4A5568"; e.currentTarget.style.background = "transparent"; }}>
                          <Edit2 size={12} />
                        </button>
                        <button data-testid={`delete-circuit-${c.id}`} onClick={() => del(c.id)}
                          className="p-1.5 rounded transition-colors" style={{ color: "#4A5568" }}
                          onMouseEnter={e => { e.currentTarget.style.color = "#FF003C"; e.currentTarget.style.background = "rgba(255,0,60,0.08)"; }}
                          onMouseLeave={e => { e.currentTarget.style.color = "#4A5568"; e.currentTarget.style.background = "transparent"; }}>
                          <Trash2 size={12} />
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
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div className="dash-card p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 17, fontWeight: 600, color: "#fff", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {editId ? "Edit Circuit" : "Add Circuit"}
              </h3>
              <button onClick={() => setShowForm(false)} style={{ color: "#6B7280" }}><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[["Site", "site", "Novi"], ["Provider", "provider", "AT&T"], ["Circuit ID", "circuit_id", "ATT-NV-0034"], ["IP Address", "ip_address", "203.0.113.1"]].map(([l, k, ph]) => (
                <div key={k}>
                  <div className="text-xs mb-1 uppercase" style={{ color: "#6B7280", fontFamily: "JetBrains Mono, monospace" }}>{l}</div>
                  <input data-testid={`circuit-${k}-input`} placeholder={ph}
                    className="w-full px-3 py-2 text-sm focus:outline-none" style={{ ...inputStyle, borderRadius: 4 }}
                    value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
                </div>
              ))}
              <div>
                <div className="text-xs mb-1 uppercase" style={{ color: "#6B7280", fontFamily: "JetBrains Mono, monospace" }}>Bandwidth (Mbps)</div>
                <input data-testid="circuit-bandwidth-input" type="number" min="1"
                  className="w-full px-3 py-2 text-sm focus:outline-none" style={inputStyle}
                  value={form.bandwidth_mbps} onChange={e => setForm(f => ({ ...f, bandwidth_mbps: parseInt(e.target.value) || 0 }))} />
              </div>
              <div>
                <div className="text-xs mb-1 uppercase" style={{ color: "#6B7280", fontFamily: "JetBrains Mono, monospace" }}>Status</div>
                <select data-testid="circuit-status-select" className="w-full px-3 py-2 text-sm focus:outline-none" style={inputStyle}
                  value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="up">Up</option><option value="down">Down</option><option value="degraded">Degraded</option><option value="unknown">Unknown</option>
                </select>
              </div>
            </div>
            <div className="mt-3">
              <div className="text-xs mb-1 uppercase" style={{ color: "#6B7280", fontFamily: "JetBrains Mono, monospace" }}>Notes</div>
              <input data-testid="circuit-notes-input" placeholder="Optional notes"
                className="w-full px-3 py-2 text-sm focus:outline-none" style={inputStyle}
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <button onClick={() => setShowForm(false)} style={{ color: "#6B7280", fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>CANCEL</button>
              <button data-testid="submit-circuit-btn" onClick={submit}
                className="px-4 py-2 rounded text-sm"
                style={{ border: "1px solid rgba(0,240,255,0.4)", color: "#00F0FF", fontFamily: "JetBrains Mono, monospace" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(0,240,255,0.08)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >{editId ? "UPDATE" : "CREATE"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
