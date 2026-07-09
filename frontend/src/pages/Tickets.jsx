import React, { useState, useEffect } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PRIORITY_COLOR  = { Critical: "#FF2A2A", High: "#FF7A00", Medium: "#FFB014", Low: "#3A3A48" };
const PRIORITY_ORDER  = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const STATUS_BADGE_CLS = {
  "Open":               "badge-green",
  "In Progress":        "badge-cyan",
  "Pending":            "badge-amber",
  "Waiting On User":    "badge-amber",
  "Waiting on 3rd Party": "badge-amber",
};

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function Tickets() {
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null);
  const [filter,   setFilter]   = useState("all"); // all | critical | high

  useEffect(() => {
    const fetch = () =>
      axios.get(`${API}/vivantio/tickets`, { timeout: 30000 })
        .then(r => setData(r.data))
        .catch(e => console.error("Tickets error:", e))
        .finally(() => setLoading(false));
    fetch();
    const iv = setInterval(fetch, 60000);
    return () => clearInterval(iv);
  }, []);

  const tickets = data?.tickets || [];
  const shown   = filter === "all"     ? tickets
                : filter === "critical" ? tickets.filter(t => t.priority === "Critical")
                : tickets.filter(t => t.priority === "High" || t.priority === "Critical");

  const critCount = (data?.by_priority?.Critical || 0);
  const highCount = (data?.by_priority?.High     || 0);

  return (
    <div className="h-full flex flex-col gap-3">

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <h1 style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:700, color:"#E2E2E5", letterSpacing:"0.18em" }}>
          VIVANTIO TICKETS
        </h1>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          {data?.stale && (
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:"#FFB014" }}>CACHED DATA</span>
          )}
          {loading && (
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:"#3A3A48" }}>LOADING...</span>
          )}
        </div>
      </div>

      {!data?.configured && !loading ? (
        <div className="card" style={{ display:"flex", alignItems:"center", justifyContent:"center", flex:1 }}>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#3A3A48" }}>
            VIVANTIO NOT CONFIGURED — ADD CREDENTIALS IN SETTINGS
          </span>
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12, flexShrink:0 }}>
            {[
              { label:"TOTAL OPEN",  value: data?.total ?? "—",     color:"#00E5FF" },
              { label:"CRITICAL",    value: critCount,               color:"#FF2A2A" },
              { label:"HIGH",        value: highCount,               color:"#FF7A00" },
              { label:"MEDIUM/LOW",  value: (data?.total || 0) - critCount - highCount, color:"#3A3A48" },
            ].map(({ label, value, color }) => (
              <div key={label} className="card" style={{ padding:"14px 16px" }}>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:"#3A3A48", letterSpacing:"0.1em", marginBottom:6 }}>{label}</div>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:28, fontWeight:700, color, lineHeight:1 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + list */}
          <div className="flex-1 flex gap-3 min-h-0">

            {/* Ticket table */}
            <div className="card flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Filter bar */}
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 16px", borderBottom:"1px solid #1C1C24", flexShrink:0 }}>
                {[["all","ALL"],["critical","CRITICAL"],["high","HIGH + CRITICAL"]].map(([key,label]) => (
                  <button key={key}
                    data-testid={`ticket-filter-${key}`}
                    onClick={() => setFilter(key)}
                    style={{
                      fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, letterSpacing:"0.1em",
                      padding:"4px 10px", border:"none", cursor:"pointer",
                      background: filter === key ? "rgba(0,229,255,0.12)" : "transparent",
                      color:      filter === key ? "#00E5FF" : "#3A3A48",
                      borderBottom: filter === key ? "1px solid #00E5FF" : "1px solid transparent",
                    }}>
                    {label}
                  </button>
                ))}
                <span style={{ marginLeft:"auto", fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:"#3A3A48" }}>
                  {shown.length} TICKETS
                </span>
              </div>

              {/* Table header */}
              <div style={{ display:"grid", gridTemplateColumns:"90px 1fr 110px 120px 80px", padding:"8px 16px", borderBottom:"1px solid #1C1C24", flexShrink:0 }}>
                {["ID","TITLE","STATUS","ASSIGNED","OPENED"].map(h => (
                  <span key={h} style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:"#3A3A48", letterSpacing:"0.1em" }}>{h}</span>
                ))}
              </div>

              {/* Rows */}
              <div className="flex-1 overflow-auto">
                {shown.length === 0 && !loading && (
                  <div style={{ padding:24, textAlign:"center", fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:"#3A3A48" }}>
                    NO ACTIVE TICKETS
                  </div>
                )}
                {shown.map(t => {
                  const pColor = PRIORITY_COLOR[t.priority] || "#3A3A48";
                  const isSel  = selected?.id === t.id;
                  return (
                    <div key={t.id}
                      data-testid={`ticket-row-${t.id}`}
                      onClick={() => setSelected(isSel ? null : t)}
                      style={{
                        display:"grid", gridTemplateColumns:"90px 1fr 110px 120px 80px",
                        padding:"9px 16px", cursor:"pointer", alignItems:"center",
                        borderLeft: isSel ? `2px solid ${pColor}` : "2px solid transparent",
                        background: isSel ? `${pColor}0A` : "transparent",
                        borderBottom:"1px solid rgba(28,28,36,0.5)",
                      }}>

                      {/* ID + priority dot */}
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ width:6, height:6, borderRadius:0, background:pColor, display:"inline-block", flexShrink:0, transform:"rotate(45deg)" }} />
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10, color:"#7A7A8A" }}>{t.display_id}</span>
                      </div>

                      {/* Title */}
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10.5, color:"#C0C0CC", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", paddingRight:8 }}>
                        {t.title}
                      </span>

                      {/* Status badge */}
                      <span className={`badge ${STATUS_BADGE_CLS[t.status] || "badge-zinc"}`} style={{ fontSize:8.5, padding:"2px 6px", width:"fit-content" }}>
                        {t.status.toUpperCase()}
                      </span>

                      {/* Assigned */}
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:"#3A3A48", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {t.assigned_to || t.group || "—"}
                      </span>

                      {/* Opened */}
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:"#3A3A48" }}>
                        {timeAgo(t.opened)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detail panel */}
            {selected && (
              <div className="card" style={{ width:320, flexShrink:0, overflow:"auto" }}>
                <div className="card-header">
                  <span>{selected.display_id}</span>
                  <span className={`badge ${STATUS_BADGE_CLS[selected.status] || "badge-zinc"}`}>
                    {selected.status.toUpperCase()}
                  </span>
                </div>

                <div style={{ padding:"14px 16px" }}>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:"#E2E2E5", lineHeight:1.5, marginBottom:16 }}>
                    {selected.title}
                  </div>

                  {[
                    ["TYPE",     selected.type],
                    ["PRIORITY", selected.priority_raw],
                    ["ASSIGNED", selected.assigned_to || "—"],
                    ["GROUP",    selected.group       || "—"],
                    ["CATEGORY", selected.category    || "—"],
                    ["OPENED",   selected.opened ? new Date(selected.opened).toLocaleString() : "—"],
                    ["UPDATED",  selected.updated ? timeAgo(selected.updated) : "—"],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid rgba(28,28,36,0.8)", gap:8 }}>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color:"#3A3A48", flexShrink:0 }}>{k}</span>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:9.5, color: k === "PRIORITY" ? (PRIORITY_COLOR[selected.priority] || "#9090A0") : "#9090A0", textAlign:"right" }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
