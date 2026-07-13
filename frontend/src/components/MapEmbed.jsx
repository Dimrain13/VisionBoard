/**
 * MapEmbed — pre-rendered animated GIF mesh map.
 * No SVG, no react-simple-maps, zero CPU animation overhead.
 * Swaps to a per-site "down" GIF when a circuit is offline.
 */
import React, { useState, useEffect } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Must match the slugs produced by generate_map_gifs.py
const SLUG = {
  "Novi":             "novi",
  "Remus":            "remus",
  "Mt. Pleasant":     "mt-pleasant",
  "Ovid":             "ovid",
  "Middlebury":       "middlebury",
  "Canton Warehouse": "canton-wh",
  "Constantine":      "constantine",
  "Canton":           "canton",
};

export default function MapEmbed() {
  const [downSite, setDownSite] = useState(null);

  useEffect(() => {
    const check = () => {
      axios.get(`${API}/circuits`).then(res => {
        const list = Array.isArray(res.data) ? res.data : (res.data.circuits ?? []);
        const first = list.find(c => c.status === "down");
        setDownSite(first ? first.site : null);
      }).catch(() => setDownSite(null));
    };
    check();
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, []);

  const slug = downSite ? SLUG[downSite] : null;
  const src  = slug ? `/maps/map-${slug}-down.gif` : "/maps/map-all-up.gif";

  return (
    <img
      src={src}
      alt="Network topology mesh"
      data-testid="map-embed"
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        display: "block",
      }}
    />
  );
}
