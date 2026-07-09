import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { ExternalLink, RefreshCw, Zap, ZapOff } from "lucide-react";
import { format } from "date-fns";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_CFG = {
  operational:  { label: "OPERATIONAL",  color: "#00FF66", badge: "badge-green", dot: "dot-online"   },
  minor_outage: { label: "MINOR ISSUE",  color: "#FFB014", badge: "badge-amber", dot: "dot-degraded" },
  major_outage: { label: "MAJOR OUTAGE", color: "#FF2A2A", badge: "badge-red",   dot: "dot-offline"  },
  maintenance:  { label: "MAINTENANCE",  color: "#00E5FF", badge: "badge-blue",  dot: "dot-unknown"  },
  unknown:      { label: "NO DATA",      color: "#3A3A48", badge: "badge-zinc",  dot: "dot-unknown"  },
};

const CATEGORY_ORDER = ["Security", "Microsoft", "AI", "Cloud", "Telecom", "Other"];

export default function ServiceStatus() {
  const [vendors, setVendors]     = useState([]);
  const [ddStatus, setDdStatus]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await axios.get(`${API}/vendor-status`);
      // Support both old (array) and new (object with vendors/dd_status) shapes
      if (Array.isArray(res.data)) {
        setVendors(res.data);
      } else {
        setVendors(res.data.vendors || []);
        setDdStatus(res.data.dd_status || null);
      }
      setLastRefresh(new Date());
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); const iv = setInterval(load, 60000); return () => clearInterval(iv); }, [load]);

  const overall = vendors.length === 0 ? "unknown"
    : vendors.every(v => v.status === "operational") ? "operational"
    : vendors.some(v => v.status === "major_outage") ? "major_outage" : "minor_outage";

  const oCfg = STATUS_CFG[overall] || STATUS_CFG.unknown;
  const knownCount = vendors.filter(v => v.status !== "unknown").length;

  const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
    const items = vendors.filter(v => v.category === cat);
    if (items.length) acc[cat] = items;
    return acc;
  }, {});

  return (
    <div className="h-full flex flex-col gap-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="section-label mb-1.5">Service Health</div>
          <h1 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 600, color: "#FAFAFA", letterSpacing: "0.12em" }}>
            VENDOR STATUS
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Downdetector token status badge */}
          {ddStatus && (
            <div className="flex items-center gap-1.5 card px-2 py-1" title={
              ddStatus.configured
                ? ddStatus.token_active
                  ? `Token active — refreshes in ~${Math.round((ddStatus.next_refresh_in_s || 0) / 60)}m`
                  : "Token expired or not yet fetched"
                : "Enter client_id + secret in Settings → DOWNDETECTOR API"
            }>
              {ddStatus.configured && ddStatus.token_active
                ? <Zap size={9} style={{ color: "#00FF66" }} />
                : <ZapOff size={9} style={{ color: ddStatus.configured ? "#FFB014" : "#3A3A48" }} />
              }
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5,
                color: ddStatus.configured && ddStatus.token_active ? "#00FF66"
                     : ddStatus.configured ? "#FFB014"
                     : "#3F3F46",
                letterSpacing: "0.1em",
              }}>
                {ddStatus.configured && ddStatus.token_active
                  ? `DD ACTIVE · ~${Math.round((ddStatus.next_refresh_in_s || 0) / 60)}m`
                  : ddStatus.configured
                    ? "DD TOKEN PENDING"
                    : "DD NOT CONFIGURED"}
              </span>
            </div>
          )}
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: "#27272A", letterSpacing: "0.08em" }}>
            CHK {format(lastRefresh, "HH:mm:ss")}
          </span>
          <button data-testid="refresh-status-btn" onClick={() => load(true)} disabled={refreshing} className="btn">
            <RefreshCw size={10} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "CHECKING..." : "REFRESH"}
          </button>
        </div>
      </div>

      {/* Overall status banner */}
      <div className="card p-3 flex items-center gap-3" style={{ borderLeft: `2px solid ${oCfg.color}` }}>
        <div className="relative flex" style={{ width: 8, height: 8 }}>
          {overall !== "operational" && (
            <div className={`absolute inline-flex opacity-75 ping ${oCfg.dot}`} style={{ width: 8, height: 8 }} />
          )}
          <div className={`relative inline-flex ${oCfg.dot}`} style={{ width: 8, height: 8 }} />
        </div>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: oCfg.color, letterSpacing: "0.18em" }}>
          {overall === "operational" ? "ALL VENDOR SYSTEMS OPERATIONAL"
            : overall === "major_outage" ? "MAJOR SERVICE DISRUPTION DETECTED"
            : knownCount === 0 ? "AWAITING DOWNDETECTOR CREDENTIALS"
            : "MINOR SERVICE ISSUES DETECTED"}
        </span>
        <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#3F3F46" }}>
          {knownCount > 0 ? `${vendors.filter(v => v.status === "operational").length} / ${vendors.length} OPERATIONAL` : `${knownCount} / ${vendors.length} MONITORED`}
        </span>
      </div>

      {/* Vendor grid — grouped by category */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="grid grid-cols-5 gap-2">
            {[...Array(21)].map((_, i) => <div key={i} className="skeleton h-28" />)}
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#3F3F46", letterSpacing: "0.14em", marginBottom: 6 }}>
                  — {cat.toUpperCase()}
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {items.map(vendor => {
                    const cfg = STATUS_CFG[vendor.status] || STATUS_CFG.unknown;
                    const needsDD = vendor.status === "unknown" && !vendor.status_url;
                    return (
                      <div key={vendor.id} data-testid={`vendor-card-${vendor.id}`}
                        className="card p-3" style={{ borderLeft: `2px solid ${cfg.color}` }}>
                        <div className="flex items-start justify-between mb-2">
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, color: "#D4D4D8", letterSpacing: "0.08em", lineHeight: 1.3 }}>
                            {vendor.name.toUpperCase()}
                          </span>
                          <a href={vendor.web_url} target="_blank" rel="noopener noreferrer"
                            style={{ color: "#27272A", flexShrink: 0, marginLeft: 4 }}
                            onMouseEnter={e => e.currentTarget.style.color = "#52525B"}
                            onMouseLeave={e => e.currentTarget.style.color = "#27272A"}>
                            <ExternalLink size={10} />
                          </a>
                        </div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <div className="relative flex" style={{ width: 6, height: 6 }}>
                            {vendor.status !== "operational" && vendor.status !== "unknown" && (
                              <div className={`absolute inline-flex opacity-75 ping ${cfg.dot}`} style={{ width: 6, height: 6 }} />
                            )}
                            <div className={`relative inline-flex ${cfg.dot}`} style={{ width: 6, height: 6 }} />
                          </div>
                          <span className={`badge ${cfg.badge}`} style={{ fontSize: 8 }}>{cfg.label}</span>
                        </div>
                        {/* Source badge */}
                        <div style={{ marginBottom: 4 }}>
                          {vendor.source === "downdetector" ? (
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7.5, color: "#00B4D8", letterSpacing: "0.08em" }}>DD ↑</span>
                          ) : vendor.source === "statuspage" ? (
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7.5, color: "#52525B", letterSpacing: "0.08em" }}>STATUSPAGE</span>
                          ) : needsDD ? (
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7.5, color: "#3F3F46", letterSpacing: "0.08em" }}>NEEDS DD</span>
                          ) : (
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7.5, color: "#27272A", letterSpacing: "0.08em" }}>—</span>
                          )}
                        </div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, color: "#1F1F23", letterSpacing: "0.06em" }}>
                          {vendor.last_checked ? format(new Date(vendor.last_checked), "HH:mm:ss") : "—"}
                        </div>
                      </div>
                    );
                  })}
                  {/* IsItDown card at end of last category */}
                  {cat === Object.keys(grouped).at(-1) && (
                    <div className="card p-3">
                      <div className="flex items-start justify-between mb-2">
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, color: "#D4D4D8", letterSpacing: "0.08em" }}>
                          ISITDOWN
                        </span>
                        <a href="https://downdetector.com" target="_blank" rel="noopener noreferrer"
                          style={{ color: "#27272A" }}
                          onMouseEnter={e => e.currentTarget.style.color = "#52525B"}
                          onMouseLeave={e => e.currentTarget.style.color = "#27272A"}>
                          <ExternalLink size={10} />
                        </a>
                      </div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <div style={{ width: 6, height: 6, background: "#60A5FA", flexShrink: 0 }} />
                        <span className="badge badge-blue" style={{ fontSize: 8 }}>EXTERNAL</span>
                      </div>
                      <p style={{ fontSize: 10, color: "#3F3F46", lineHeight: 1.5 }} className="line-clamp-2">
                        Check any website from an external perspective.
                      </p>
                      <a data-testid="isitdown-link" href="https://downdetector.com" target="_blank" rel="noopener noreferrer"
                        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, color: "#27272A", display: "block", marginTop: 8 }}
                        onMouseEnter={e => e.currentTarget.style.color = "#52525B"}
                        onMouseLeave={e => e.currentTarget.style.color = "#27272A"}>
                        OPEN →
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
