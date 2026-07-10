import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import TopNav from "./TopNav";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Pages that cycle in kiosk mode (order matters)
const KIOSK_PAGES = ["/dashboard", "/wazuh", "/circuits", "/alerts"];

export default function Layout({ children }) {
  const navigate   = useNavigate();
  const location   = useLocation();

  const [kioskEnabled,  setKioskEnabled]  = useState(false);
  const [kioskInterval, setKioskInterval] = useState(30);
  const [isPaused,      setIsPaused]      = useState(false);
  const [displayTick,   setDisplayTick]   = useState(0);  // reactive: drives UI

  // Refs so timer callbacks always see fresh values without recreating the interval
  const currentPageRef  = useRef(location.pathname);
  const tickRef         = useRef(0);           // imperative counter
  const kioskEnabledRef = useRef(false);
  const kioskIntervalRef= useRef(30);
  const isPausedRef     = useRef(false);

  // Sync refs with state
  kioskEnabledRef.current  = kioskEnabled;
  kioskIntervalRef.current = kioskInterval;
  isPausedRef.current      = isPaused;

  // Load kiosk settings and re-poll every 60s so YAML changes take effect without restart
  useEffect(() => {
    const fetchSettings = () => {
      axios.get(`${API}/settings`).then(res => {
        setKioskEnabled(res.data.kiosk_enabled  ?? false);
        setKioskInterval(res.data.kiosk_interval ?? 30);
      }).catch(() => {});
    };
    fetchSettings();
    const poll = setInterval(fetchSettings, 60000);
    return () => clearInterval(poll);
  }, []);

  // Reset tick whenever the URL changes (e.g. manual nav or after auto-rotation)
  useEffect(() => {
    currentPageRef.current = location.pathname;
    tickRef.current        = 0;
    setDisplayTick(0);
  }, [location.pathname]);

  // Single persistent 1-second heartbeat — uses refs for all decision-making
  useEffect(() => {
    const timer = setInterval(() => {
      if (!kioskEnabledRef.current || isPausedRef.current) return;

      tickRef.current += 1;
      setDisplayTick(tickRef.current);

      if (tickRef.current >= kioskIntervalRef.current) {
        // Reset before navigating so the tick display snaps to 0 immediately
        tickRef.current = 0;
        setDisplayTick(0);

        const idx  = KIOSK_PAGES.indexOf(currentPageRef.current);
        const safe = idx < 0 ? 0 : idx;
        navigate(KIOSK_PAGES[(safe + 1) % KIOSK_PAGES.length]);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]); // intentionally stable — refs handle dynamic values

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: "#030305",
        color: "#E2E2E5",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <TopNav
        kioskEnabled={kioskEnabled}
        isPaused={isPaused}
        onTogglePause={() => setIsPaused(p => !p)}
        kioskTick={displayTick}
        kioskInterval={kioskInterval}
      />
      <main
        style={{
          flex: 1,
          overflow: "auto",
          padding: "14px",
          position: "relative",
          minHeight: 0,
        }}
      >
        {/* Subtle cyan grid overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            opacity: 0.018,
            backgroundImage:
              "linear-gradient(#00E5FF 1px, transparent 1px), linear-gradient(90deg, #00E5FF 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%" }}>
          {children}
        </div>
      </main>
    </div>
  );
}
