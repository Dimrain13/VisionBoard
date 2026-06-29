import React from "react";
import { ComposableMap, Geographies, Geography, Marker, Line } from "react-simple-maps";

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const MI_OH_IN = ["26", "39", "18"];
const CONNECTIONS = [
  ["novi", "remus"], ["novi", "ovid"], ["novi", "mt-pleasant"],
  ["novi", "constantine"], ["novi", "canton-plant"], ["novi", "canton-warehouse"],
  ["novi", "middlebury"], ["constantine", "middlebury"],
];
const DOT_COLOR = { online: "#22C55E", degraded: "#F59E0B", offline: "#EF4444", unknown: "#3F3F46" };
const SHORT_LABEL = { "Mt. Pleasant": "Mt. Plsnt", "Canton Warehouse": "Canton WH", "Canton Plant": "Ctn. Plant" };

export default function MapEmbed({ sites = [], onSiteClick, selectedId }) {
  const get = (id) => sites.find(s => s.id === id);

  const lineStroke = (fId, tId) => {
    const f = get(fId), t = get(tId);
    if (!f || !t) return "rgba(63,63,70,0.4)";
    if (f.status === "offline" || t.status === "offline") return "rgba(239,68,68,0.35)";
    if (f.status === "degraded" || t.status === "degraded") return "rgba(245,158,11,0.3)";
    return "rgba(63,63,70,0.5)";
  };

  return (
    <ComposableMap
      projection="geoMercator"
      projectionConfig={{ scale: 5200, center: [-83.2, 42.4] }}
      style={{ width: "100%", height: "100%" }}
    >
      <Geographies geography={GEO_URL}>
        {({ geographies }) =>
          geographies.filter(g => MI_OH_IN.includes(g.id)).map(g => (
            <Geography key={g.rsmKey} geography={g}
              fill="rgba(39,39,42,0.25)" stroke="#27272A" strokeWidth={0.6}
              style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }}
            />
          ))
        }
      </Geographies>

      {sites.length > 0 && CONNECTIONS.map(([fId, tId]) => {
        const f = get(fId), t = get(tId);
        if (!f || !t) return null;
        return (
          <Line key={`${fId}-${tId}`}
            coordinates={[f.coordinates, t.coordinates]}
            stroke={lineStroke(fId, tId)} strokeWidth={0.9} strokeLinecap="round"
          />
        );
      })}

      {sites.map(site => {
        const c = DOT_COLOR[site.status] || DOT_COLOR.unknown;
        const isHQ = site.id === "novi";
        const label = SHORT_LABEL[site.name] || site.name;
        const isSelected = selectedId === site.id;
        const hasIssue = site.status === "offline" || site.status === "degraded";
        return (
          <Marker key={site.id} coordinates={site.coordinates}
            onClick={() => onSiteClick && onSiteClick(site)}>
            {hasIssue && (
              <circle r={isHQ ? 12 : 9} fill="none" stroke={c} strokeWidth={1} opacity={0.25}>
                <animate attributeName="r" from={isHQ ? 7 : 5} to={isHQ ? 14 : 11} dur="1.8s" repeatCount="indefinite" />
                <animate attributeName="opacity" from={0.3} to={0} dur="1.8s" repeatCount="indefinite" />
              </circle>
            )}
            <circle r={isHQ ? 7 : 5}
              fill={c} stroke={isSelected ? "#FAFAFA" : "#09090B"} strokeWidth={isSelected ? 2 : 1.5}
              style={{ cursor: "pointer" }}
            />
            <text textAnchor="middle" y={-11}
              style={{ fontSize: 8.5, fill: "#A1A1AA", fontFamily: "Inter, sans-serif", pointerEvents: "none", fontWeight: 500 }}>
              {label}
            </text>
          </Marker>
        );
      })}
    </ComposableMap>
  );
}
