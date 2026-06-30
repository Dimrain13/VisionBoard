import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { format, parseISO } from "date-fns";
import { RefreshCw, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Wazuh rule.level → severity bucket
function getLevel(alert) {
  const lvl = parseInt(alert?.rule?.level ?? 0);
  if (lvl >= 15) return { label: "CRIT", color: "#EF4444", badge: "badge-red",   min: 15 };
  if (lvl >= 11) return { label: "HIGH", color: "#F97316", badge: "badge-red",   min: 11 };
  if (lvl >= 6)  return { label: "MED",  color: "#F59E0B", badge: "badge-amber", min: 6  };
  return            { label: "LOW",  color: "#52525B", badge: "badge-zinc",  min: 1  };
}

const FILTER_OPTS = [
  { label: "ALL",  minLevel: 1  },
  { label: "CRIT", minLevel: 15 },
  { label: "HIGH", minLevel: 11 },
  { label: "MED",  minLevel: 6  },
  { label: "LOW",  minLevel: 1  },
];

const HOURS_OPTS = [1, 6, 12, 24, 48, 72];

export default function WazuhPage() {
  const navigate = useNavigate();
  const [status, setStatus]         = useState(null);   // {connected, reason, url}
  const [alerts, setAlerts]         = useState([]);
  const [agents, setAgents]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [minLevel, setMinLevel]     = useState(1);
  const [hoursBack, setHoursBack]   = useState(24);
  const [groupFilter, setGroupFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("ALL");

  const [lastRefresh, setLastRefresh] = useState(new Date());

  const loadAll = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const [statusRes, alertsRes, agentsRes] = await Promise.allSettled([
        axios.get(`${API}/wazuh/status`),
        axios.get(`${API}/wazuh/alerts`, { params: { min_level: minLevel, hours_back: hoursBack, limit: 200, ...(groupFilter ? { group: groupFilter } : {}) } }),
        axios.get(`${API}/wazuh/agents`),
      ]);

      if (statusRes.status === "fulfilled") setStatus(statusRes.value.data);
      if (alertsRes.status === "fulfilled") setAlerts(alertsRes.value.data.items || []);
      if (agentsRes.status === "fulfilled") setAgents(agentsRes.value.data.items || []);
      setLastRefresh(new Date());
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [minLevel, hoursBack, groupFilter]);

  useEffect(() => { loadAll(); const iv = setInterval(loadAll, 30000); return () => clearInterval(iv); }, [loadAll]);

  const counts = {
    critical: alerts.filter(a => parseInt(a?.rule?.level ?? 0) >= 15).length,
    high:     alerts.filter(a => { const l = parseInt(a?.rule?.level ?? 0); return l >= 11 && l < 15; }).length,
    medium:   alerts.filter(a => { const l = parseInt(a?.rule?.level ?? 0); return l >= 6  && l < 11; }).length,
    active:   agents.filter(a => a.status === "active").length,
  };

  const isConfigured = status?.connected !== undefined || status?.reason === "not_configured" ? status?.reason !== "not_configured" : null;
  const notConfigured = status?.reason === "not_configured";

  return (
    <div className="h-full flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="section-label mb-1.5">SIEM / Security Events</div>
          <h1 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 600, color: "#FAFAFA", letterSpacing: "0.12em" }}>
            WAZUH SECURITY
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: "#27272A", letterSpacing: "0.08em" }}>
            {format(lastRefresh, "HH:mm:ss")}
          </span>
          <button data-testid="wazuh-refresh-btn" onClick={() => loadAll(true)} disabled={refreshing} className="btn">
            <RefreshCw size={10} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "LOADING..." : "REFRESH"}
          </button>
        </div>
      </div>

      {/* Connection status */}
      {notConfigured ? (
        <div className="card p-4 flex items-center justify-between" style={{ borderLeft: "2px solid #F59E0B" }}>
          <div className="flex items-center gap-3">
            <div style={{ width: 7, height: 7, background: "#F59E0B" }} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#F59E0B", letterSpacing: "0.15em" }}>
              WAZUH NOT CONFIGURED — ADD CREDENTIALS IN SETTINGS
            </span>
          </div>
          <button onClick={() => navigate("/settings")} className="btn" style={{ borderColor: "rgba(245,158,11,0.3)", color: "#F59E0B" }}>
            <Settings size={10} /> OPEN SETTINGS
          </button>
        </div>
      ) : status && (
        <div className="card p-4 flex items-center gap-3" style={{ borderLeft: `2px solid ${status.connected ? "#10B981" : "#EF4444"}` }}>
          <div className="relative flex" style={{ width: 7, height: 7 }}>
            {status.connected && <div className="absolute inline-flex opacity-75 ping" style={{ width: 7, height: 7, background: "#10B981" }} />}
            <div className="relative inline-flex" style={{ width: 7, height: 7, background: status.connected ? "#10B981" : "#EF4444" }} />
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: status.connected ? "#10B981" : "#EF4444", letterSpacing: "0.15em" }}>
            {status.connected ? `CONNECTED / ${status.url || "10.202.10.70"}` : `CONNECTION FAILED: ${status.reason}`}
          </span>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          ["CRITICAL (24H)", counts.critical, "#EF4444"],
          ["HIGH (24H)",     counts.high,     "#F97316"],
          ["MEDIUM (24H)",   counts.medium,   "#F59E0B"],
          [`ACTIVE AGENTS`,  counts.active,   "#10B981"],
        ].map(([l, v, c]) => (
          <div key={l} className="card p-4 text-center" style={{ borderLeft: `2px solid ${c}` }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 28, fontWeight: 700, color: c, lineHeight: 1 }}>
              {loading ? "—" : v}
            </div>
            <div className="section-label mt-2">{l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="section-label">SEVERITY:</span>
        {FILTER_OPTS.map(({ label, minLevel: ml }) => (
          <button key={label}
            data-testid={`wazuh-filter-${label.toLowerCase()}`}
            onClick={() => { setActiveFilter(label); setMinLevel(ml); }}
            className="btn"
            style={{ color: activeFilter === label ? "#FAFAFA" : "#27272A", borderColor: activeFilter === label ? "#3F3F46" : "transparent" }}>
            {label}
          </button>
        ))}
        <div style={{ width: 1, height: 16, background: "#1F1F23" }} />
        <span className="section-label">HOURS:</span>
        <select className="input" style={{ width: 70, padding: "4px 8px", fontSize: 10 }}
          value={hoursBack} onChange={e => setHoursBack(parseInt(e.target.value))}>
          {HOURS_OPTS.map(h => <option key={h} value={h}>{h}h</option>)}
        </select>
        <span className="section-label">GROUP:</span>
        <input className="input" style={{ width: 140, padding: "4px 10px", fontSize: 10 }}
          placeholder="e.g. syslog, unifi, ids"
          value={groupFilter}
          onChange={e => setGroupFilter(e.target.value)} />
      </div>

      {/* Alert feed */}
      <div className="flex-1 card overflow-hidden flex flex-col min-h-0" style={{ background: "#050507" }}>
        <div className="card-header" style={{ background: "#050507" }}>
          <div className="flex items-center gap-3">
            <div style={{ width: 6, height: 6, background: status?.connected ? "#10B981" : "#27272A" }} />
            <span className="section-label">WAZUH-ALERTS-* / PAST {hoursBack}H / LVL≥{minLevel}</span>
          </div>
          <span className="section-label">{alerts.length} EVENTS</span>
        </div>

        <div className="flex-1 overflow-auto">
          {/* Column headers */}
          <div className="flex gap-4 px-4 py-1.5" style={{ borderBottom: "1px solid #141416", background: "#080808" }}>
            {[["TIMESTAMP", 68], ["LVL", 30], ["GROUPS", 180], ["AGENT", 130], ["DESCRIPTION", null]].map(([h, w]) => (
              <span key={h} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#1F1F23", letterSpacing: "0.2em", flexShrink: 0, ...(w ? { width: w } : { flex: 1 }) }}>
                {h}
              </span>
            ))}
          </div>

          {loading ? (
            <div className="p-5" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#1F1F23", letterSpacing: "0.18em" }}>
              [ QUERYING INDEXER... ]
            </div>
          ) : notConfigured ? (
            <div className="h-full flex items-center justify-center">
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#141416", letterSpacing: "0.2em" }}>
                [ CONFIGURE WAZUH IN SETTINGS TO SEE LIVE ALERTS ]
              </span>
            </div>
          ) : alerts.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#1A1A1C", letterSpacing: "0.2em" }}>
                [ NO ALERTS MATCHING FILTERS ]
              </span>
            </div>
          ) : (
            alerts.map((alert, idx) => {
              const sev = getLevel(alert);
              const level  = parseInt(alert?.rule?.level ?? 0);
              const groups = (alert?.rule?.groups || []).join(", ");
              const agent  = alert?.agent?.name || "—";
              const desc   = alert?.rule?.description || alert?.full_log || "—";
              const ts     = alert?.timestamp;

              return (
                <div key={idx}
                  data-testid="wazuh-alert-row"
                  className="flex gap-4 items-center px-4 py-1.5 table-row"
                  style={{
                    borderLeft: `2px solid ${idx === 0 ? sev.color : "transparent"}`,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  <span style={{ fontSize: 9.5, color: "#27272A", flexShrink: 0, width: 68 }}>
                    {ts ? format(parseISO(ts), "HH:mm:ss") : "—"}
                  </span>
                  <span style={{ fontSize: 9.5, color: sev.color, fontWeight: 700, flexShrink: 0, width: 30, textAlign: "center" }}>
                    {level}
                  </span>
                  <span style={{ fontSize: 9.5, color: "#3F3F46", flexShrink: 0, width: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {groups || "—"}
                  </span>
                  <span style={{ fontSize: 9.5, color: "#52525B", flexShrink: 0, width: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {agent}
                  </span>
                  <span style={{ fontSize: 9.5, color: "#71717A", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {desc}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Agents grid */}
      {agents.length > 0 && (
        <div className="card" style={{ flexShrink: 0 }}>
          <div className="card-header">
            <span className="section-label">AGENTS ({agents.length})</span>
            <span className="section-label">
              {counts.active} ACTIVE / {agents.length - counts.active} DISCONNECTED
            </span>
          </div>
          <div className="p-4 flex flex-wrap gap-2">
            {agents.map(ag => {
              const isActive = ag.status === "active";
              return (
                <div key={ag.id}
                  data-testid={`wazuh-agent-${ag.status}`}
                  className="flex items-center gap-2 px-3 py-1.5"
                  style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${isActive ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.1)"}` }}>
                  <div style={{ width: 5, height: 5, background: isActive ? "#10B981" : "#EF4444", flexShrink: 0 }} />
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: isActive ? "#52525B" : "#3F3F46", letterSpacing: "0.06em" }}>
                    {ag.name || ag.id}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
