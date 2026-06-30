import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { Save, Eye, EyeOff } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function Section({ title, children }) {
  return (
    <div className="card">
      <div className="card-header">
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, color: "#FAFAFA", letterSpacing: "0.18em" }}>
          {title}
        </span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [emailPwd, setEmailPwd] = useState("");

  const load = useCallback(async () => {
    try { const res = await axios.get(`${API}/settings`); setSettings(res.data || {}); }
    catch (e) { console.error(e); }
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

  if (loading) return (
    <div className="h-full flex items-center justify-center"
      style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#27272A", letterSpacing: "0.2em" }}>
      [ LOADING... ]
    </div>
  );

  return (
    <div className="h-full flex flex-col gap-4 max-w-3xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="section-label mb-1.5">Configuration</div>
          <h1 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 600, color: "#FAFAFA", letterSpacing: "0.12em" }}>
            SETTINGS
          </h1>
        </div>
        <button data-testid="save-settings-btn" onClick={save} disabled={saving} className="btn btn-primary"
          style={{ borderColor: saved ? "rgba(16,185,129,0.4)" : undefined, color: saved ? "#34D399" : undefined }}>
          <Save size={11} />
          {saving ? "SAVING..." : saved ? "SAVED" : "SAVE SETTINGS"}
        </button>
      </div>

      <div className="overflow-auto flex-1 space-y-3 pr-1">

        {/* Display */}
        <Section title="DISPLAY">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <div className="section-label mb-1.5">Refresh Interval (seconds)</div>
              <input data-testid="settings-refresh_interval" type="number" min="10" max="300" className="input"
                value={settings.refresh_interval || 30}
                onChange={e => set("refresh_interval", parseInt(e.target.value) || 30)} />
            </div>
          </div>
        </Section>

        {/* WUG Email */}
        <Section title="WUG EMAIL (IMAP)">
          <div className="flex items-center gap-3 mb-4">
            <div
              data-testid="settings-email_enabled-toggle"
              onClick={() => set("email_enabled", !settings.email_enabled)}
              className="cursor-pointer"
              style={{ position: "relative", width: 36, height: 18, background: settings.email_enabled ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.05)", border: `1px solid ${settings.email_enabled ? "rgba(16,185,129,0.4)" : "#27272A"}`, transition: "all 150ms ease" }}
            >
              <div style={{
                width: 12, height: 12, background: settings.email_enabled ? "#10B981" : "#27272A",
                position: "absolute", top: 2, left: settings.email_enabled ? 20 : 2, transition: "left 150ms ease",
              }} />
            </div>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: settings.email_enabled ? "#10B981" : "#3F3F46", letterSpacing: "0.1em" }}>
              {settings.email_enabled ? "IMAP ENABLED" : "IMAP DISABLED"}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              ["IMAP HOST",       "email_host",         "mail.yourdomain.com"],
              ["IMAP PORT",       "email_port",         "993"],
              ["USERNAME",        "email_username",     "monitor@company.com"],
              ["EMAIL FOLDER",    "email_folder",       "INBOX"],
              ["SENDER FILTER",   "wug_sender_filter",  "whatsupgold"],
            ].map(([l, k, ph]) => (
              <div key={k}>
                <div className="section-label mb-1.5">{l}</div>
                <input data-testid={`settings-${k}`} placeholder={ph} className="input"
                  value={settings[k] || ""} onChange={e => set(k, e.target.value)} />
              </div>
            ))}
            <div>
              <div className="section-label mb-1.5">EMAIL PASSWORD</div>
              <div style={{ position: "relative" }}>
                <input data-testid="settings-email_password" type={showPwd ? "text" : "password"}
                  placeholder="App password" className="input" style={{ paddingRight: 36 }}
                  value={emailPwd} onChange={e => setEmailPwd(e.target.value)} />
                <button onClick={() => setShowPwd(!showPwd)}
                  style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#3F3F46", background: "none", border: "none", cursor: "pointer" }}>
                  {showPwd ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
            </div>
          </div>
          <div className="mt-4 p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid #1F1F23" }}>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#3F3F46", lineHeight: 1.8 }}>
              WUG WEBHOOK: POST to{" "}
              <code style={{ color: "#52525B", background: "rgba(0,0,0,0.4)", padding: "1px 6px" }}>
                {process.env.REACT_APP_BACKEND_URL}/api/alerts/email-webhook
              </code>
              {" "}with body: <code style={{ color: "#3F3F46" }}>{`{"subject":"...","body":"..."}`}</code>
            </p>
          </div>
        </Section>

        {/* Vivantio */}
        <Section title="VIVANTIO ITSM">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div className="section-label mb-1.5">API URL</div>
              <input data-testid="settings-vivantio_api_url" placeholder="https://tenant.vivantio.com/api" className="input"
                value={settings.vivantio_api_url || ""} onChange={e => set("vivantio_api_url", e.target.value)} />
            </div>
            <div>
              <div className="section-label mb-1.5">API KEY</div>
              <input data-testid="settings-vivantio_api_key" type="password" placeholder="Your Vivantio API key" className="input"
                value={settings.vivantio_api_key || ""} onChange={e => set("vivantio_api_key", e.target.value)} />
            </div>
          </div>
        </Section>

        {/* HP Aruba */}
        <Section title="HP ARUBA / ORCHESTRATOR">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div className="section-label mb-1.5">ORCHESTRATOR URL</div>
              <input data-testid="settings-aruba_api_url" placeholder="https://your-orchestrator.company.com" className="input"
                value={settings.aruba_api_url || ""} onChange={e => set("aruba_api_url", e.target.value)} />
            </div>
            <div>
              <div className="section-label mb-1.5">API KEY / TOKEN</div>
              <input data-testid="settings-aruba_api_key" type="password" placeholder="Aruba API token" className="input"
                value={settings.aruba_api_key || ""} onChange={e => set("aruba_api_key", e.target.value)} />
            </div>
          </div>
        </Section>

        {/* Wazuh SIEM */}
        <Section title="WAZUH SIEM">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "span 1" }}>
              <div className="section-label mb-1.5">SERVER IP / HOSTNAME</div>
              <input data-testid="settings-wazuh_url" placeholder="10.202.10.70" className="input"
                value={settings.wazuh_url || ""}
                onChange={e => set("wazuh_url", e.target.value)} />
            </div>
            <div>
              <div className="section-label mb-1.5">API PORT (REST)</div>
              <input data-testid="settings-wazuh_api_port" type="number" className="input"
                value={settings.wazuh_api_port || 55000}
                onChange={e => set("wazuh_api_port", parseInt(e.target.value) || 55000)} />
            </div>
            <div>
              <div className="section-label mb-1.5">INDEXER PORT</div>
              <input data-testid="settings-wazuh_indexer_port" type="number" className="input"
                value={settings.wazuh_indexer_port || 9200}
                onChange={e => set("wazuh_indexer_port", parseInt(e.target.value) || 9200)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <div>
              <div className="section-label mb-1.5">API USERNAME</div>
              <input data-testid="settings-wazuh_username" placeholder="wazuh-wui" className="input"
                value={settings.wazuh_username || ""}
                onChange={e => set("wazuh_username", e.target.value)} />
            </div>
            <div>
              <div className="section-label mb-1.5">API PASSWORD</div>
              <input data-testid="settings-wazuh_password" type="password" placeholder="API password" className="input"
                onChange={e => set("wazuh_password", e.target.value)} />
            </div>
            <div>
              <div className="section-label mb-1.5">INDEXER USERNAME <span style={{ color: "#1F1F23" }}>(if different)</span></div>
              <input data-testid="settings-wazuh_indexer_username" placeholder="admin" className="input"
                value={settings.wazuh_indexer_username || ""}
                onChange={e => set("wazuh_indexer_username", e.target.value)} />
            </div>
            <div>
              <div className="section-label mb-1.5">INDEXER PASSWORD <span style={{ color: "#1F1F23" }}>(if different)</span></div>
              <input data-testid="settings-wazuh_indexer_password" type="password" placeholder="Indexer password" className="input"
                onChange={e => set("wazuh_indexer_password", e.target.value)} />
            </div>
          </div>
          <div className="mt-4 p-3" style={{ background: "rgba(16,185,129,0.03)", border: "1px solid rgba(16,185,129,0.1)" }}>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#3F3F46", lineHeight: 2 }}>
              <span style={{ color: "#10B981", letterSpacing: "0.1em" }}>WAZUH API:</span>{" "}
              REST API on port 55000 (JWT auth). Indexer on port 9200 (Basic Auth).
              Self-signed certs are handled automatically.
              Alerts are queried from{" "}
              <code style={{ color: "#52525B", background: "rgba(0,0,0,0.4)", padding: "1px 6px" }}>wazuh-alerts-*</code>
              {" "}index. Rule groups (UniFi, WUG, HP…) are read from{" "}
              <code style={{ color: "#52525B", background: "rgba(0,0,0,0.4)", padding: "1px 6px" }}>rule.groups[]</code>.
            </p>
          </div>
        </Section>

        {/* UniFi Syslog */}
        <Section title="UNIFI SYSLOG RECEIVER">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div className="section-label mb-1.5">UDP LISTEN PORT</div>
              <input data-testid="settings-unifi_syslog_port" type="number" min="1024" max="65535" className="input"
                value={settings.unifi_syslog_port || 5140}
                onChange={e => set("unifi_syslog_port", parseInt(e.target.value) || 5140)} />
            </div>
          </div>
          <div className="mt-4 p-3" style={{ background: "rgba(16,185,129,0.03)", border: "1px solid rgba(16,185,129,0.1)" }}>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#3F3F46", lineHeight: 1.9 }}>
              <span style={{ color: "#10B981", letterSpacing: "0.1em" }}>CONFIG:</span>{" "}
              In your UniFi Network application, go to Settings → System → Remote Logging and point devices to{" "}
              <code style={{ color: "#52525B", background: "rgba(0,0,0,0.4)", padding: "1px 6px" }}>
                {"<this-server-ip>:5140"}
              </code>{" "}
              over UDP. Port changes require app restart.
            </p>
          </div>
        </Section>

      </div>
    </div>
  );
}
