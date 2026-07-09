import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { RefreshCw, Wifi, Camera, Server, Monitor, Router, AlertTriangle } from "lucide-react";
import { format, parseISO } from "date-fns";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const TYPE_CFG = {
  access_point: { label: "ACCESS POINTS", Icon: Wifi,     color: "#00E5FF" },
  camera:       { label: "CAMERAS",        Icon: Camera,   color: "#FFB014" },
  switch:       { label: "SWITCHES",       Icon: Server,   color: "#00FF66" },
  gateway:      { label: "GATEWAYS",       Icon: Router,   color: "#A78BFA" },
  poe_switch:   { label: "PoE SWITCHES",   Icon: Server,   color: "#00FF66" },
  device:       { label: "OTHER DEVICES",  Icon: Monitor,  color: "#3A3A48" },
};

const TYPE_ORDER = ["camera", "switch", "poe_switch", "access_point", "gateway", "device"];

function DeviceCard({ device }) {
  const isOnline = device.status === "online";
  const tCfg     = TYPE_CFG[device.type] || TYPE_CFG.device;
  const { Icon } = tCfg;

  return (
    <div
      data-testid={`unifi-device-${device.id}`}
      className="card"
      style={{
        padding: "12px 14px",
        borderLeft: `2px solid ${isOnline ? tCfg.color : "#FF2A2A"}`,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10.5,
            fontWeight: 700,
            color: "#D4D4D8",
            letterSpacing: "0.06em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {device.name}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#3A3A48", letterSpacing: "0.05em", marginTop: 2 }}>
            {device.model || device.type_raw?.toUpperCase() || "—"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          <div className="relative flex" style={{ width: 7, height: 7 }}>
            {!isOnline && <div className="ping absolute" style={{ width: 7, height: 7, background: "#FF2A2A", opacity: 0.6 }} />}
            <div style={{ width: 7, height: 7, background: isOnline ? tCfg.color : "#FF2A2A", boxShadow: isOnline ? `0 0 5px ${tCfg.color}` : "0 0 5px #FF2A2A" }} />
          </div>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, color: isOnline ? tCfg.color : "#FF2A2A", letterSpacing: "0.1em" }}>
            {isOnline ? "UP" : "DOWN"}
          </span>
        </div>
      </div>

      {/* Details */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {device.ip && (
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#52525B" }}>
            {device.ip}
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          {device.uptime_str && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, color: "#3A3A48" }}>
              UP {device.uptime_str}
            </span>
          )}
          {device.num_sta > 0 && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, color: "#52525B" }}>
              {device.num_sta} CLIENTS
            </span>
          )}
        </div>
      </div>

      {/* Controller badge */}
      <div style={{
        marginTop: 2,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 8,
        color: "#2A2A38",
        letterSpacing: "0.1em",
        borderTop: "1px solid #1C1C24",
        paddingTop: 5,
      }}>
        {device.controller?.toUpperCase()}
      </div>
    </div>
  );
}

export default function UniFiDevices() {
  const [data, setData]         = useState({ devices: [], updated: null });
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await axios.get(`${API}/unifi/devices`);
      setData(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, [load]);

  const { devices, updated } = data;
  const notConfigured = !loading && devices.length === 0;

  // Summary counts
  const online  = devices.filter(d => d.status === "online").length;
  const offline = devices.filter(d => d.status === "offline").length;

  // Group by type, offline devices sorted to top within each group
  const grouped = TYPE_ORDER.reduce((acc, type) => {
    const items = devices
      .filter(d => d.type === type)
      .sort((a, b) => (a.status === "online" ? 1 : 0) - (b.status === "online" ? 1 : 0));
    if (items.length) acc[type] = items;
    return acc;
  }, {});

  // Controllers seen
  const controllers = [...new Set(devices.map(d => d.controller))].filter(Boolean);

  return (
    <div className="h-full flex flex-col gap-3">

      {/* Header */}
      <div className="flex items-center justify-between" style={{ flexShrink: 0 }}>
        <div>
          <div className="section-label mb-1.5">Infrastructure</div>
          <h1 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 600, color: "#FAFAFA", letterSpacing: "0.12em" }}>
            UNIFI DEVICES
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {controllers.map(c => (
            <span key={c} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#3A3A48", letterSpacing: "0.12em" }}>
              {c?.toUpperCase()}
            </span>
          ))}
          {updated && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#27272A", letterSpacing: "0.08em" }}>
              UPD {format(parseISO(updated), "HH:mm:ss")}
            </span>
          )}
          <button data-testid="unifi-refresh-btn" onClick={() => load(true)} disabled={refreshing} className="btn">
            <RefreshCw size={10} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "POLLING..." : "REFRESH"}
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      {!loading && devices.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          {[
            { label: "TOTAL",    value: devices.length, color: "#E2E2E5" },
            { label: "ONLINE",   value: online,          color: "#00FF66" },
            { label: "OFFLINE",  value: offline,         color: offline > 0 ? "#FF2A2A" : "#3A3A48" },
            { label: "CAMERAS",  value: devices.filter(d => d.type === "camera").length,       color: "#FFB014" },
            { label: "SWITCHES", value: devices.filter(d => d.type === "switch" || d.type === "poe_switch").length,  color: "#00FF66" },
            { label: "APs",      value: devices.filter(d => d.type === "access_point").length, color: "#00E5FF" },
          ].map(({ label, value, color }) => (
            <div key={label} className="card" style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>
                {value}
              </div>
              <div className="section-label" style={{ marginBottom: 0 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Device groups */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
            {[...Array(18)].map((_, i) => <div key={i} className="skeleton" style={{ height: 100 }} />)}
          </div>
        ) : notConfigured ? (
          <div style={{ height: "60%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <AlertTriangle size={32} style={{ color: "#FFB014", opacity: 0.5 }} strokeWidth={1} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#3A3A48", letterSpacing: "0.18em", marginBottom: 8 }}>
                NO CONTROLLERS CONFIGURED
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#27272A", letterSpacing: "0.08em" }}>
                Add UniFi controller URLs and credentials in Settings → UNIFI CONTROLLERS
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {Object.entries(grouped).map(([type, items]) => {
              const tCfg = TYPE_CFG[type] || TYPE_CFG.device;
              const { Icon } = tCfg;
              const typeOnline  = items.filter(d => d.status === "online").length;
              const typeOffline = items.filter(d => d.status === "offline").length;

              return (
                <div key={type}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <Icon size={11} style={{ color: tCfg.color, opacity: 0.8 }} />
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#3A3A48", letterSpacing: "0.14em" }}>
                      {tCfg.label}
                    </span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#00FF66" }}>{typeOnline} UP</span>
                    {typeOffline > 0 && (
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#FF2A2A" }}>{typeOffline} DOWN</span>
                    )}
                  </div>
                  <div data-testid={`unifi-group-${type}`}
                    style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
                    {items.map(d => <DeviceCard key={d.id} device={d} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
