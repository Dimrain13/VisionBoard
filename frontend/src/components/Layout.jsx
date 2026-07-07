import React from "react";
import TopNav from "./TopNav";

export default function Layout({ children }) {
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
      <TopNav />
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
