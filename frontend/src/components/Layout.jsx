import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import TopNav from "./TopNav";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Default page order — overridden by kiosk_pages from settings API
const ALL_KIOSK_PAGES = [
  "/dashboard",
  "/map",
  "/alerts",
  "/status",
  "/circuits",
  "/unifi-devices",
  "/tickets",
  "/wug-topology",
  "/wazuh",
];

export default function Layout({ children }) {
  const navigate   = useNavigate();
  const location   = useLocation();

  const [kioskEnabled,  setKioskEnabled]  = useState(false);
  const [kioskInterval, setKioskInterval] = useState(30);
  const [kioskPages,    setKioskPages]    = useState(ALL_KIOSK_PAGES);
  const [isPaused,      setIsPaused]      = useState(false);
  const [displayTick,   setDisplayTick]   = useState(0);  // reactive: drives UI

  // Refs so timer callbacks always see fresh values without recreating the interval
  const pageIdxRef      = useRef(-1);          // index into kioskPagesRef.current, -1 = not in list
  const tickRef         = useRef(0);
  const kioskEnabledRef = useRef(false);
  const kioskIntervalRef= useRef(30);
  const kioskPagesRef   = useRef(ALL_KIOSK_PAGES);
  const isPausedRef     = useRef(false);

  // Sync refs with state
  kioskEnabledRef.current  = kioskEnabled;
  kioskIntervalRef.current = kioskInterval;
  kioskPagesRef.current    = kioskPages.length > 0 ? kioskPages : ALL_KIOSK_PAGES;
  isPausedRef.current      = isPaused;

  // Auto-hide cursor for kiosk — hides after 3s of inactivity, shows briefly on move
  useEffect(() => {
    let hideTimer = null;
    const hideCursor = () => document.body.classList.add("cursor-hidden");
    const showCursor = () => {
      document.body.classList.remove("cursor-hidden");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hideCursor, 3000);
    };
    hideCursor(); // hide immediately on load
    window.addEventListener("mousemove", showCursor);
    return () => {
      window.removeEventListener("mousemove", showCursor);
      clearTimeout(hideTimer);
      document.body.classList.remove("cursor-hidden");
    };
  }, []);

  // Load kiosk settings and re-poll every 60s so YAML changes take effect without restart
  useEffect(() => {
    const fetchSettings = () => {
      axios.get(`${API}/settings`).then(res => {
        setKioskEnabled(res.data.kiosk_enabled  ?? false);
        setKioskInterval(res.data.kiosk_interval ?? 30);
        const pages = res.data.kiosk_pages;
        if (Array.isArray(pages) && pages.length > 0) {
          setKioskPages(pages);
        }
      }).catch(() => {});
    };
    fetchSettings();
    const poll = setInterval(fetchSettings, 60000);
    return () => clearInterval(poll);
  }, []);

  // When URL changes: sync pageIdxRef to where we are in the rotation list
  useEffect(() => {
    pageIdxRef.current = kioskPagesRef.current.indexOf(location.pathname);
    tickRef.current    = 0;
    setDisplayTick(0);
  }, [location.pathname]);

  // When pages list changes (settings reload): re-sync index to current URL
  useEffect(() => {
    pageIdxRef.current = kioskPagesRef.current.indexOf(location.pathname);
  }, [kioskPages, location.pathname]);

  // Single persistent 1-second heartbeat — uses refs for all decision-making
  useEffect(() => {
    const timer = setInterval(() => {
      if (!kioskEnabledRef.current || isPausedRef.current) return;

      tickRef.current += 1;
      setDisplayTick(tickRef.current);

      if (tickRef.current >= kioskIntervalRef.current) {
        tickRef.current = 0;
        setDisplayTick(0);

        const len     = kioskPagesRef.current.length;
        const nextIdx = (pageIdxRef.current + 1 + len) % len;
        pageIdxRef.current = nextIdx;
        navigate(kioskPagesRef.current[nextIdx]);
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
