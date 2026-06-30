import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { format, parseISO } from "date-fns";
import { Trash2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SEV = {
  critical: { color: "#EF4444", label: "CRIT", badge: "badge-red"   },
  warning:  { color: "#F59E0B", label: "WARN", badge: "badge-amber" },
  info:     { color: "#10B981", label: "INFO", badge: "badge-green" },
};

export default function UniFiEvents() {
  const [events, setEvents]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    try {
      const params = filter ? { severity: filter } : {};
      const res = await axios.get(`${API}/unifi-events`, { params });
      setEvents(res.data.items);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => {
    load();
    if (autoRefresh) {
      const iv = setInterval(load, 5000);
      return () => clearInterval(iv);
    }
  }, [load, autoRefresh]);

  const clearAll = async () => {
    if (!window.confirm("Clear all UniFi syslog events?")) return;
    await axios.delete(`${API}/unifi-events`);
    load();
  };

  const counts = {
    total:    events.length,
    critical: events.filter(e => e.severity === "critical").length,
    warning:  events.filter(e => e.severity === "warning").length,
  };

  return (
    <div className="h-full flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="section-label mb-1.5">Network Syslog / UDP</div>
          <h1 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 600, color: "#FAFAFA", letterSpacing: "0.12em" }}>
            UNIFI EVENTS
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className="btn"
            style={{ color: autoRefresh ? "#10B981" : "#3F3F46", borderColor: autoRefresh ? "rgba(16,185,129,0.3)" : "#27272A" }}
          >
            <span style={{ display: "inline-block", width: 6, height: 6, background: autoRefresh ? "#10B981" : "#27272A", marginRight: 2 }} />
            {autoRefresh ? "LIVE" : "PAUSED"}
          </button>
          <button data-testid="clear-unifi-btn" onClick={clearAll} className="btn btn-danger">
            <Trash2 size={10} /> CLEAR
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-3">
        {[["TOTAL EVENTS", counts.total, "#52525B"], ["CRITICAL", counts.critical, "#EF4444"], ["WARNINGS", counts.warning, "#F59E0B"]].map(([l, v, c]) => (
          <div key={l} className="card p-4 text-center" style={{ borderLeft: `2px solid ${c}` }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 30, fontWeight: 700, color: c, lineHeight: 1 }}>{v}</div>
            <div className="section-label mt-2">{l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <span className="section-label">FILTER:</span>
        {[["", "ALL"], ["critical", "CRITICAL"], ["warning", "WARNING"], ["info", "INFO"]].map(([v, l]) => (
          <button key={l} data-testid={`unifi-filter-${v || "all"}`} onClick={() => setFilter(v)}
            className="btn"
            style={{ color: filter === v ? "#FAFAFA" : "#27272A", borderColor: filter === v ? "#3F3F46" : "transparent" }}>
            {l}
          </button>
        ))}
      </div>

      {/* Terminal feed */}
      <div className="flex-1 card overflow-hidden flex flex-col min-h-0" style={{ background: "#050507" }}>
        <div className="card-header" style={{ background: "#050507" }}>
          <div className="flex items-center gap-3">
            <div style={{ width: 6, height: 6, background: autoRefresh ? "#10B981" : "#27272A" }} />
            <span className="section-label">SYSLOG STREAM / UDP:5140</span>
          </div>
          <span className="section-label">{events.length} EVT</span>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="p-5" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#1F1F23", letterSpacing: "0.18em" }}>
              [ LOADING... ]
            </div>
          ) : events.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#1A1A1C", letterSpacing: "0.2em" }}>
                [ NO EVENTS RECEIVED ]
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#141416", letterSpacing: "0.1em" }}>
                CONFIGURE UNIFI → SETTINGS → SYSTEM → REMOTE LOGGING → UDP:5140
              </span>
            </div>
          ) : (
            events.map((evt, idx) => {
              const sev = SEV[evt.severity] || SEV.info;
              return (
                <div key={evt.id || idx}
                  data-testid={`unifi-event-${evt.severity}`}
                  className="flex items-start gap-4 px-4 py-1.5 table-row"
                  style={{ borderLeft: `2px solid ${idx === 0 ? sev.color : "transparent"}`, fontFamily: "'JetBrains Mono', monospace" }}
                >
                  <span style={{ fontSize: 9.5, color: "#27272A", flexShrink: 0, minWidth: 68, lineHeight: "20px" }}>
                    {evt.created_at ? format(parseISO(evt.created_at), "HH:mm:ss") : "—"}
                  </span>
                  <span style={{ fontSize: 9.5, color: sev.color, fontWeight: 700, flexShrink: 0, minWidth: 34, letterSpacing: "0.1em", lineHeight: "20px" }}>
                    {sev.label}
                  </span>
                  <span style={{ fontSize: 9.5, color: "#3F3F46", flexShrink: 0, minWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: "20px" }}>
                    {evt.device || "—"}
                  </span>
                  <span style={{ fontSize: 9.5, color: "#52525B", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: "20px" }}>
                    {evt.message}
                  </span>
                  <span style={{ fontSize: 9, color: "#1F1F23", flexShrink: 0, lineHeight: "20px" }}>
                    {evt.source_ip}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
