import React from "react";
import TopNav from "./TopNav";

export default function Layout({ children }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "#0A0A0C" }}>
      <TopNav />
      <main className="flex-1 overflow-auto p-6" style={{ minHeight: 0 }}>
        {children}
      </main>
    </div>
  );
}
