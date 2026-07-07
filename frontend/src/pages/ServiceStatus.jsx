import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { ExternalLink, RefreshCw } from "lucide-react";
import { format, parseISO } from "date-fns";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_CFG = {
  operational:  { label: "OPERATIONAL",  color: "#00FF66", badge: "badge-green", dot: "dot-online"   },
  minor_outage: { label: "MINOR ISSUE",  color: "#FFB014", badge: "badge-amber", dot: "dot-degraded" },
  major_outage: { label: "MAJOR OUTAGE", color: "#FF2A2A", badge: "badge-red",   dot: "dot-offline"  },
  maintenance:  { label: "MAINTENANCE",  color: "#00E5FF", badge: "badge-blue",  dot: "dot-unknown"  },
  unknown:      { label: "UNKNOWN",      color: "#3A3A48", badge: "badge-zinc",  dot: "dot-unknown"  },
};

export default function ServiceStatus() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await axios.get(`${API}/vendor-status`);
      setVendors(res.data);
      setLastRefresh(new Date());
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); const iv = setInterval(load, 60000); return () => clearInterval(iv); }, [load]);

  const overall = vendors.length === 0 ? "unknown"
    : vendors.every(v => v.status === "operational") ? "operational"
    : vendors.some(v => v.status === "major_outage") ? "major_outage" : "minor_outage";

  const oCfg = STATUS_CFG[overall] || STATUS_CFG.unknown;

  return (
    <div className="h-full flex flex-col gap-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="section-label mb-1.5">Service Health</div>
          <h1 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 600, color: "#FAFAFA", letterSpacing: "0.12em" }}>
            VENDOR STATUS
          </h1>
        </div>
        <div className="flex items-center gap-3">
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
      <div className="card p-4 flex items-center gap-3" style={{ borderLeft: `2px solid ${oCfg.color}` }}>
        <div className="relative flex" style={{ width: 8, height: 8 }}>
          {overall !== "operational" && (
            <div className={`absolute inline-flex opacity-75 ping ${oCfg.dot}`} style={{ width: 8, height: 8 }} />
          )}
          <div className={`relative inline-flex ${oCfg.dot}`} style={{ width: 8, height: 8 }} />
        </div>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, color: oCfg.color, letterSpacing: "0.18em" }}>
          {overall === "operational" ? "ALL VENDOR SYSTEMS OPERATIONAL"
            : overall === "major_outage" ? "MAJOR SERVICE DISRUPTION DETECTED"
            : "MINOR SERVICE ISSUES DETECTED"}
        </span>
      </div>

      {/* Vendor cards */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-3 gap-3">
          {loading ? (
            [...Array(5)].map((_, i) => <div key={i} className="skeleton h-36" />)
          ) : vendors.map(vendor => {
            const cfg = STATUS_CFG[vendor.status] || STATUS_CFG.unknown;
            return (
              <div key={vendor.id} data-testid={`vendor-card-${vendor.id}`}
                className="card p-5" style={{ borderLeft: `2px solid ${cfg.color}` }}>
                <div className="flex items-start justify-between mb-4">
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, color: "#D4D4D8", letterSpacing: "0.1em" }}>
                    {vendor.name.toUpperCase()}
                  </span>
                  <a href={vendor.web_url} target="_blank" rel="noopener noreferrer"
                    style={{ color: "#27272A" }}
                    onMouseEnter={e => e.currentTarget.style.color = "#52525B"}
                    onMouseLeave={e => e.currentTarget.style.color = "#27272A"}>
                    <ExternalLink size={11} />
                  </a>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="relative flex" style={{ width: 7, height: 7 }}>
                    {vendor.status !== "operational" && (
                      <div className={`absolute inline-flex opacity-75 ping ${cfg.dot}`} style={{ width: 7, height: 7 }} />
                    )}
                    <div className={`relative inline-flex ${cfg.dot}`} style={{ width: 7, height: 7 }} />
                  </div>
                  <span className={`badge ${cfg.badge}`}>{cfg.label}</span>
                </div>
                <p style={{ fontSize: 11, color: "#3F3F46", lineHeight: 1.6 }}>{vendor.description}</p>
                {vendor.incidents?.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {vendor.incidents.map((inc, i) => (
                      <div key={i} style={{ fontSize: 10, paddingLeft: 8, borderLeft: "2px solid rgba(245,158,11,0.3)", color: "#52525B", fontFamily: "'JetBrains Mono', monospace" }}>
                        {inc.name}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: "#1F1F23", letterSpacing: "0.08em" }}>
                  LAST {vendor.last_checked ? format(parseISO(vendor.last_checked), "HH:mm:ss") : "—"}
                </div>
              </div>
            );
          })}

          {/* IsItDown external tool card */}
          <div className="card p-5">
            <div className="flex items-start justify-between mb-4">
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, color: "#D4D4D8", letterSpacing: "0.1em" }}>
                ISITDOWN.RIGHT
              </span>
              <a href="https://www.isitdownright.now.com" target="_blank" rel="noopener noreferrer"
                style={{ color: "#27272A" }}
                onMouseEnter={e => e.currentTarget.style.color = "#52525B"}
                onMouseLeave={e => e.currentTarget.style.color = "#27272A"}>
                <ExternalLink size={11} />
              </a>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <div style={{ width: 7, height: 7, background: "#60A5FA" }} />
              <span className="badge badge-blue">EXTERNAL TOOL</span>
            </div>
            <p style={{ fontSize: 11, color: "#3F3F46", lineHeight: 1.6 }}>
              Check if any website or service is down globally from external perspective.
            </p>
            <a data-testid="isitdown-link" href="https://www.isitdownright.now.com" target="_blank" rel="noopener noreferrer"
              style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#27272A", letterSpacing: "0.1em", display: "block", marginTop: 12 }}
              onMouseEnter={e => e.currentTarget.style.color = "#52525B"}
              onMouseLeave={e => e.currentTarget.style.color = "#27272A"}>
              OPEN TOOL →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
