import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import NetworkMap from "./pages/NetworkMap";
import Alerts from "./pages/Alerts";
import ServiceStatus from "./pages/ServiceStatus";
import DIACircuits from "./pages/DIACircuits";
import Tickets from "./pages/Tickets";
import Settings from "./pages/Settings";
import "./App.css";

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/map" element={<NetworkMap />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/status" element={<ServiceStatus />} />
          <Route path="/circuits" element={<DIACircuits />} />
          <Route path="/tickets" element={<Tickets />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
