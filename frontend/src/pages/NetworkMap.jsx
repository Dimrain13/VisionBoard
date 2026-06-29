import React, { useState, useEffect, useCallback } from "react";
import { ComposableMap, Geographies, Geography, Marker, Line } from "react-simple-maps";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const MI_OH_IN = ["26", "39", "18"];

const CONNECTIONS = [
  ["novi", "remus"], ["novi", "ovid"], ["novi", "mt-pleasant"],
  ["novi", "constantine"], ["novi", "canton-plant"], ["novi", "canton-warehouse"],
  ["novi", "middlebury"], ["constantine", "middlebury"],
];

const statusColor = (s) => s === "online" ? "#00F0FF" : s === "degraded" ? "#FFD700" : s === "offline" ? "#FF003C" : "#6B7280";

export default function NetworkMap() {
  const [sites, setSites] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSites = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/sites`);
      setSites(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadSites();
    const iv = setInterval(loadSites, 30000);
    return () => clearInterval(iv);
  }, [loadSites]);

  const getSite = (id) => sites.find(s => s.id === id);

  const lineColor = (fromId, toId) => {
    const f = getSite(fromId), t = getSite(toId);
    if (!f || !t) return "rgba(0,240,255,0.15)";
    if (f.status === "offline" || t.status === "offline") return "rgba(255,0,60,0.5)";
    if (f.status === "degraded" || t.status === "degraded") return "rgba(255,215,0,0.4)";
    return "rgba(0,240,255,0.3)";
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Network Map
        </h1>
        <div className="flex gap-4" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>
          {[["#00F0FF","Online"],["#FFD700","Degraded"],["#FF003C","Offline"]].map(([c,l]) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: c }} />
              <span style={{ color: "#9CA3AF" }}>{l}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 grid gap-4 min-h-0" style={{ gridTemplateColumns: "3fr 1fr" }}>
        {/* Map */}
        <div className="dash-card p-3 relative overflow-hidden">
          {loading ? (
            <div className="h-full flex items-center justify-center" style={{ fontFamily: "JetBrains Mono, monospace", color: "#00F0FF", fontSize: 13 }}>
              LOADING MAP DATA...
            </div>
          ) : (
            <ComposableMap
              projection="geoMercator"
              projectionConfig={{ scale: 5200, center: [-83.2, 42.4] }}
              style={{ width: "100%", height: "100%" }}
            >
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.filter(g => MI_OH_IN.includes(g.id)).map(g => (
                    <Geography key={g.rsmKey} geography={g}
                      fill="rgba(0,240,255,0.04)" stroke="rgba(0,240,255,0.22)" strokeWidth={0.7}
                      style={{ default: { outline: "none" }, hover: { outline: "none", fill: "rgba(0,240,255,0.08)" }, pressed: { outline: "none" } }}
                    />
                  ))
                }
              </Geographies>

              {/* Connection lines */}
              {sites.length > 0 && CONNECTIONS.map(([fId, tId]) => {
                const f = getSite(fId), t = getSite(tId);
                if (!f || !t) return null;
                return (
                  <Line key={`${fId}-${tId}`}
                    coordinates={[f.coordinates, t.coordinates]}
                    stroke={lineColor(fId, tId)}
                    strokeWidth={1}
                    strokeLinecap="round"
                    strokeDasharray="5 3"
                  />
                );
              })}

              {/* Markers */}
              {sites.map(site => {
                const sc = statusColor(site.status);
                const isHQ = site.id === "novi";
                return (
                  <Marker key={site.id} coordinates={site.coordinates}
                    onClick={() => setSelected(selected?.id === site.id ? null : site)}
                    data-testid={`map-node-${site.id}`}
                  >
                    {site.status !== "online" && (
                      <circle r={isHQ ? 14 : 11} fill="none" stroke={sc} strokeWidth={1} opacity={0.3} className="pulse-dot" />
                    )}
                    <circle r={isHQ ? 8 : 6} fill={sc} fillOpacity={0.9} stroke="#000" strokeWidth={1.5} style={{ cursor: "pointer" }}
                      filter={`drop-shadow(0 0 4px ${sc})`}
                    />
                    {isHQ && <circle r={4} fill="#000" fillOpacity={0.5} />}
                    <text textAnchor="middle" y={-15}
                      style={{ fontSize: isHQ ? 11 : 9.5, fill: "rgba(255,255,255,0.9)", fontFamily: "JetBrains Mono, monospace", pointerEvents: "none", fontWeight: isHQ ? 700 : 400 }}>
                      {site.name}
                    </text>
                    <text textAnchor="middle" y={-5}
                      style={{ fontSize: 8, fill: sc, fontFamily: "JetBrains Mono, monospace", pointerEvents: "none" }}>
                      {site.state}
                    </text>
                  </Marker>
                );
              })}
            </ComposableMap>
          )}
        </div>

        {/* Sites Panel */}
        <div className="dash-card p-4 flex flex-col min-h-0 overflow-hidden">
          <h3 className="mb-3" style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 14, fontWeight: 600, color: "#fff", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Sites ({sites.length})
          </h3>
          <div className="flex-1 overflow-auto space-y-1.5">
            {sites.map(site => (
              <button key={site.id} data-testid={`site-item-${site.id}`}
                onClick={() => setSelected(selected?.id === site.id ? null : site)}
                className="w-full text-left p-2.5 rounded transition-all"
                style={{
                  border: `1px solid ${selected?.id === site.id ? "rgba(0,240,255,0.5)" : "rgba(255,255,255,0.06)"}`,
                  background: selected?.id === site.id ? "rgba(0,240,255,0.07)" : "rgba(255,255,255,0.02)",
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: "#E5E7EB" }}>{site.name}</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: statusColor(site.status) }} />
                    <span className="text-xs uppercase" style={{ fontFamily: "JetBrains Mono, monospace", color: statusColor(site.status) }}>
                      {site.status}
                    </span>
                  </div>
                </div>
                <div className="text-xs mt-0.5" style={{ color: "#4A5568" }}>
                  {site.state} · {site.type} · {site.circuit_count} circuit{site.circuit_count !== 1 ? "s" : ""}
                </div>
              </button>
            ))}
          </div>

          {selected && (
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(0,240,255,0.15)" }}>
              <div className="mb-2" style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 13, fontWeight: 600, color: "#00F0FF", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                {selected.name}
              </div>
              {[
                ["State", selected.state],
                ["Type", selected.type],
                ["Status", selected.status],
                ["Circuits", selected.circuit_count],
                ["Active Alerts", selected.alert_count],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs py-0.5">
                  <span style={{ color: "#4A5568" }}>{k}</span>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", color: k === "Active Alerts" && v > 0 ? "#FFD700" : "#9CA3AF" }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
