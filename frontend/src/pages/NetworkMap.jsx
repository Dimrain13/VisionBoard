import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import MapEmbed from "../components/MapEmbed";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function NetworkMap() {
  const [sites, setSites] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/sites`);
      setSites(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load]);

  const DOT_COLOR = { online: "#00FF66", degraded: "#FFB014", offline: "#FF2A2A", unknown: "#3A3A48" };
  const statusBadge = (s) => ({ online: "badge-green", degraded: "badge-amber", offline: "badge-red", unknown: "badge-zinc" }[s] || "badge-zinc");

  return (
    <div className="h-full flex flex-col gap-4">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <h1 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 600, color: "#E2E2E5", letterSpacing: "0.12em" }}>
          NETWORK MAP
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {[["#00FF66","ONLINE"],["#FFB014","DEGRADED"],["#FF2A2A","OFFLINE"]].map(([c,l]) => (
            <span key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#3A3A48", letterSpacing: "0.1em" }}>
              <span style={{ width: 6, height: 6, background: c, display: "inline-block", flexShrink: 0 }} />{l}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 grid gap-4 min-h-0" style={{ gridTemplateColumns: "1fr 280px" }}>
        {/* Map */}
        <div className="card overflow-hidden">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <span className="text-sm skeleton h-4 w-32" />
            </div>
          ) : (
            <MapEmbed sites={sites} onSiteClick={s => setSelected(s?.id === selected?.id ? null : s)} selectedId={selected?.id} />
          )}
        </div>

        {/* Site Panel */}
        <div className="card flex flex-col min-h-0 overflow-hidden">
          <div className="card-header" style={{ padding: "10px 16px" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, color: "#E2E2E5", letterSpacing: "0.12em" }}>
              SITES ({sites.length})
            </span>
          </div>
          <div className="flex-1 overflow-auto">
            {sites.map(site => (
              <button key={site.id} data-testid={`site-item-${site.id}`}
                onClick={() => setSelected(selected?.id === site.id ? null : site)}
                className="w-full flex items-center justify-between px-4 py-3 table-row text-left"
                style={{ background: selected?.id === site.id ? "rgba(255,255,255,0.04)" : "transparent", border: "none", cursor: "pointer" }}>
                <div>
                  <div className="text-sm font-medium" style={{ color: "#E4E4E7" }}>{site.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: "#52525B" }}>
                    {site.state} · {site.type}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex h-2 w-2">
                    {site.status !== "online" && (
                      <div className="absolute inline-flex h-full w-full rounded-full opacity-60 ping"
                        style={{ background: DOT_COLOR[site.status] }} />
                    )}
                    <div className="relative inline-flex rounded-full h-2 w-2" style={{ background: DOT_COLOR[site.status] }} />
                  </div>
                </div>
              </button>
            ))}
          </div>

          {selected && (
            <div className="flex-shrink-0 p-4" style={{ borderTop: "1px solid #27272A" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, color: "#E2E2E5", letterSpacing: "0.08em" }}>
                  {selected.name}
                </span>
                <span className={`badge ${statusBadge(selected.status)}`}>{selected.status.toUpperCase()}</span>
              </div>
              {[["State", selected.state], ["Type", selected.type], ["Circuits", selected.circuit_count], ["Active Alerts", selected.alert_count]].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1" style={{ borderBottom: "1px solid rgba(39,39,42,0.5)" }}>
                  <span className="text-xs" style={{ color: "#52525B" }}>{k}</span>
                  <span className="text-xs tabular-nums" style={{ fontFamily: "JetBrains Mono, monospace", color: k === "Active Alerts" && v > 0 ? "#FCD34D" : "#A1A1AA" }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
