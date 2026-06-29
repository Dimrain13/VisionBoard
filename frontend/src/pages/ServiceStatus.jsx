import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { ExternalLink, RefreshCw } from "lucide-react";
import { format, parseISO } from "date-fns";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_CFG = {
  operational: { label: "OPERATIONAL",  color: "#00F0FF", border: "rgba(0,240,255,0.25)",  bg: "rgba(0,240,255,0.04)",  dot: "#00F0FF" },
  minor_outage: { label: "MINOR ISSUE", color: "#FFD700", border: "rgba(255,215,0,0.25)",  bg: "rgba(255,215,0,0.04)",  dot: "#FFD700" },
  major_outage: { label: "MAJOR OUTAGE",color: "#FF003C", border: "rgba(255,0,60,0.3)",   bg: "rgba(255,0,60,0.05)",   dot: "#FF003C" },
  maintenance:  { label: "MAINTENANCE", color: "#60A5FA", border: "rgba(96,165,250,0.25)", bg: "rgba(96,165,250,0.04)", dot: "#60A5FA" },
  unknown:      { label: "UNKNOWN",     color: "#6B7280", border: "rgba(107,114,128,0.2)", bg: "rgba(107,114,128,0.04)",dot: "#374151" },
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
      <div className="flex items-center justify-between">
        <h1 style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Vendor Service Status
        </h1>
        <div className="flex items-center gap-4">
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#4A5568" }}>
            Updated: {format(lastRefresh, "HH:mm:ss")}
          </span>
          <button data-testid="refresh-status-btn" onClick={() => load(true)} disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded text-sm transition-colors disabled:opacity-50"
            style={{ border: "1px solid rgba(0,240,255,0.4)", color: "#00F0FF", fontFamily: "JetBrains Mono, monospace" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(0,240,255,0.08)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "CHECKING..." : "REFRESH"}
          </button>
        </div>
      </div>

      {/* Overall banner */}
      <div className="dash-card p-4 flex items-center gap-3" style={{ border: `1px solid ${oCfg.border}`, background: oCfg.bg }}>
        <div className={`w-3 h-3 rounded-full ${overall !== "operational" ? "pulse-dot" : ""}`} style={{ background: oCfg.dot }} />
        <span style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 18, fontWeight: 600, color: oCfg.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {overall === "operational" ? "All Vendor Systems Operational"
            : overall === "major_outage" ? "Major Service Disruption Detected"
            : "Minor Service Issues Detected"}
        </span>
      </div>

      {/* Vendor cards */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-3 gap-4">
          {loading ? (
            [...Array(5)].map((_, i) => <div key={i} className="dash-card shimmer h-36" />)
          ) : vendors.map(vendor => {
            const cfg = STATUS_CFG[vendor.status] || STATUS_CFG.unknown;
            return (
              <div key={vendor.id} data-testid={`vendor-card-${vendor.id}`}
                className="dash-card p-5" style={{ border: `1px solid ${cfg.border}`, background: cfg.bg }}>
                <div className="flex items-start justify-between mb-3">
                  <span style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 17, fontWeight: 600, color: "#fff", letterSpacing: "0.06em" }}>{vendor.name}</span>
                  <a href={vendor.web_url} target="_blank" rel="noopener noreferrer" style={{ color: "#4A5568" }}
                    onMouseEnter={e => e.currentTarget.style.color = "#00F0FF"}
                    onMouseLeave={e => e.currentTarget.style.color = "#4A5568"}>
                    <ExternalLink size={13} />
                  </a>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${vendor.status !== "operational" ? "pulse-dot" : ""}`} style={{ background: cfg.dot }} />
                  <span className="text-sm font-bold" style={{ fontFamily: "JetBrains Mono, monospace", color: cfg.color }}>{cfg.label}</span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: "#6B7280" }}>{vendor.description}</p>
                {vendor.incidents?.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {vendor.incidents.map((inc, i) => (
                      <div key={i} className="text-xs pl-2" style={{ borderLeft: "2px solid rgba(255,215,0,0.5)", color: "#9CA3AF" }}>{inc.name}</div>
                    ))}
                  </div>
                )}
                <div className="mt-3 text-xs" style={{ color: "#374151", fontFamily: "JetBrains Mono, monospace" }}>
                  {vendor.last_checked ? format(parseISO(vendor.last_checked), "HH:mm:ss") : "—"}
                </div>
              </div>
            );
          })}

          {/* IsItDown card */}
          <div className="dash-card p-5" style={{ border: "1px solid rgba(167,139,250,0.25)", background: "rgba(167,139,250,0.04)" }}>
            <div className="flex items-start justify-between mb-3">
              <span style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 17, fontWeight: 600, color: "#fff" }}>IsItDown.right</span>
              <a href="https://www.isitdownright.now.com" target="_blank" rel="noopener noreferrer" style={{ color: "#4A5568" }}><ExternalLink size={13} /></a>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#A78BFA" }} />
              <span className="text-sm font-bold" style={{ fontFamily: "JetBrains Mono, monospace", color: "#A78BFA" }}>EXTERNAL TOOL</span>
            </div>
            <p className="text-xs leading-relaxed mb-3" style={{ color: "#6B7280" }}>Check if any website or service is down globally.</p>
            <a data-testid="isitdown-link" href="https://www.isitdownright.now.com" target="_blank" rel="noopener noreferrer"
              className="text-xs" style={{ fontFamily: "JetBrains Mono, monospace", color: "#A78BFA" }}>
              OPEN TOOL →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
