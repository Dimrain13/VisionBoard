import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Save, Eye, EyeOff } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [emailPwd, setEmailPwd] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/settings`);
      setSettings(res.data || {});
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...settings };
      if (emailPwd) payload.email_password = emailPwd;
      await axios.put(`${API}/settings`, payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const set = (key, val) => setSettings(s => ({ ...s, [key]: val }));

  const inputStyle = {
    background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.1)",
    color: "#fff", fontFamily: "JetBrains Mono, monospace", borderRadius: 4,
    padding: "8px 12px", fontSize: 13, width: "100%", outline: "none",
  };

  const labelStyle = { fontSize: 11, color: "#6B7280", fontFamily: "JetBrains Mono, monospace", textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6 };

  const Section = ({ title, children }) => (
    <div className="dash-card p-5">
      <h2 style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 16, fontWeight: 600, color: "#fff", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>{title}</h2>
      {children}
    </div>
  );

  if (loading) return <div className="h-full flex items-center justify-center" style={{ fontFamily: "JetBrains Mono, monospace", color: "#00F0FF", fontSize: 13 }}>LOADING...</div>;

  return (
    <div className="h-full flex flex-col gap-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "0.12em", textTransform: "uppercase" }}>Settings</h1>
        <button data-testid="save-settings-btn" onClick={save} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded text-sm transition-colors disabled:opacity-50"
          style={{
            border: saved ? "1px solid rgba(74,222,128,0.4)" : "1px solid rgba(0,240,255,0.4)",
            color: saved ? "#4ADE80" : "#00F0FF",
            fontFamily: "JetBrains Mono, monospace",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(0,240,255,0.08)"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          <Save size={14} />
          {saving ? "SAVING..." : saved ? "SAVED!" : "SAVE SETTINGS"}
        </button>
      </div>

      <div className="overflow-auto flex-1 space-y-4 pr-1">
        {/* Display */}
        <Section title="Display Settings">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={labelStyle}>Refresh Interval (seconds)</label>
              <input data-testid="settings-refresh_interval" type="number" min="10" max="300"
                style={inputStyle} value={settings.refresh_interval || 30}
                onChange={e => set("refresh_interval", parseInt(e.target.value) || 30)} />
            </div>
          </div>
        </Section>

        {/* WUG Email */}
        <Section title="WUG Email Integration (IMAP)">
          <div className="flex items-center gap-3 mb-4">
            <div
              data-testid="settings-email_enabled-toggle"
              onClick={() => set("email_enabled", !settings.email_enabled)}
              className="cursor-pointer rounded-full transition-colors"
              style={{
                width: 40, height: 20,
                background: settings.email_enabled ? "rgba(0,240,255,0.25)" : "rgba(255,255,255,0.1)",
                border: settings.email_enabled ? "1px solid #00F0FF" : "1px solid rgba(255,255,255,0.2)",
                position: "relative",
              }}
            >
              <div style={{
                width: 14, height: 14, borderRadius: "50%",
                background: settings.email_enabled ? "#00F0FF" : "#6B7280",
                position: "absolute", top: 2,
                left: settings.email_enabled ? 22 : 2,
                transition: "left 150ms ease",
              }} />
            </div>
            <span style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "JetBrains Mono, monospace" }}>
              {settings.email_enabled ? "IMAP Polling Enabled" : "IMAP Polling Disabled"}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              ["IMAP Host", "email_host", "mail.yourdomain.com"],
              ["IMAP Port", "email_port", "993"],
              ["Username", "email_username", "monitor@company.com"],
              ["Email Folder", "email_folder", "INBOX"],
              ["Sender Filter", "wug_sender_filter", "whatsupgold"],
            ].map(([l, k, ph]) => (
              <div key={k}>
                <label style={labelStyle}>{l}</label>
                <input data-testid={`settings-${k}`} placeholder={ph} style={inputStyle}
                  value={settings[k] || ""} onChange={e => set(k, e.target.value)} />
              </div>
            ))}
            <div>
              <label style={labelStyle}>Email Password</label>
              <div style={{ position: "relative" }}>
                <input data-testid="settings-email_password" type={showPwd ? "text" : "password"}
                  placeholder="App password" style={{ ...inputStyle, paddingRight: 36 }}
                  value={emailPwd} onChange={e => setEmailPwd(e.target.value)} />
                <button onClick={() => setShowPwd(!showPwd)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#6B7280", background: "none", border: "none", cursor: "pointer" }}>
                  {showPwd ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>
          </div>
          <div className="mt-4 p-3 rounded" style={{ background: "rgba(0,240,255,0.04)", border: "1px solid rgba(0,240,255,0.15)" }}>
            <p style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.7 }}>
              <span style={{ color: "#00F0FF", fontFamily: "JetBrains Mono, monospace" }}>WUG Webhook Endpoint:</span> Forward WUG alert emails via POST to{" "}
              <code style={{ color: "#00F0FF", fontFamily: "JetBrains Mono, monospace", background: "rgba(0,0,0,0.3)", padding: "1px 4px", borderRadius: 2 }}>
                {process.env.REACT_APP_BACKEND_URL}/api/alerts/email-webhook
              </code>{" "}
              with body: <code style={{ color: "#9CA3AF", fontFamily: "JetBrains Mono, monospace" }}>{`{"subject":"...","body":"..."}`}</code>
            </p>
          </div>
        </Section>

        {/* Vivantio */}
        <Section title="Vivantio ITSM">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>API URL</label>
              <input data-testid="settings-vivantio_api_url" placeholder="https://tenant.vivantio.com/api" style={inputStyle}
                value={settings.vivantio_api_url || ""} onChange={e => set("vivantio_api_url", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>API Key</label>
              <input data-testid="settings-vivantio_api_key" type="password" placeholder="Your Vivantio API key" style={inputStyle}
                value={settings.vivantio_api_key || ""} onChange={e => set("vivantio_api_key", e.target.value)} />
            </div>
          </div>
        </Section>

        {/* HP Aruba */}
        <Section title="HP Aruba / Orchestrator">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Orchestrator URL</label>
              <input data-testid="settings-aruba_api_url" placeholder="https://your-orchestrator.company.com" style={inputStyle}
                value={settings.aruba_api_url || ""} onChange={e => set("aruba_api_url", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>API Key / Token</label>
              <input data-testid="settings-aruba_api_key" type="password" placeholder="Aruba API token" style={inputStyle}
                value={settings.aruba_api_key || ""} onChange={e => set("aruba_api_key", e.target.value)} />
            </div>
          </div>
          <p style={{ fontSize: 11, color: "#374151", marginTop: 10, fontFamily: "JetBrains Mono, monospace" }}>
            Aruba Orchestrator integration will be activated once credentials are provided.
          </p>
        </Section>
      </div>
    </div>
  );
}
