import React, { useEffect, useState } from "react";
import { regions } from "./catalog.js";

const anchors = {
  guanacaste: [-85.38, 10.73], nicoya: [-85.22, 9.94], north: [-84.56, 10.59],
  centralpac: [-84.61, 9.62], central: [-84.05, 10.02], mountains: [-83.67, 9.48],
  south: [-83.22, 8.63], caribbean: [-83.13, 10.30],
};
const bounds = { west: -86.03, east: -82.32, south: 7.98, north: 11.30 };
const size = { x: 780, y: 620 };

function project([lon, lat]) {
  return [
    ((lon - bounds.west) / (bounds.east - bounds.west)) * size.x,
    ((bounds.north - lat) / (bounds.north - bounds.south)) * size.y,
  ];
}

function outline(geometry) {
  const polygons = geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  return polygons.flatMap(poly => poly.map(ring =>
    ring.map((coordinate, index) => {
      const point = project(coordinate).map(value => value.toFixed(2)).join(" ");
      return (index ? "L" : "M") + point;
    }).join(" ") + " Z"
  )).join(" ");
}

export default function AtlasMap({ records, current, onSelect }) {
  const [geometry, setGeometry] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(import.meta.env.BASE_URL + "maps/costa-rica.json")
      .then(response => {
        if (!response.ok) throw new Error("map");
        return response.json();
      })
      .then(setGeometry).catch(() => setFailed(true));
  }, []);
  const counts = Object.fromEntries(Object.keys(regions).map(key =>
    [key, records.filter(row => row.region === key || row.regions?.includes(key)).length]));
  return <section className="map-panel" aria-label="Карта регионов Коста-Рики">
    <div className="map-art">
      {geometry ? <svg viewBox={`0 0 ${size.x} ${size.y}`} aria-hidden="true">
        <defs>
          <pattern id="sea-grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M60 0H0V60" stroke="#b8d8d9" strokeWidth="1" fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#sea-grid)" />
        <path d={outline(geometry)} fill="#cee3c4" stroke="#326b56" strokeWidth="2" strokeLinejoin="round" />
        <text x="80" y="360" className="map-water">Тихий океан</text>
        <text x="520" y="120" className="map-water">Карибское море</text>
      </svg> : <div className="map-status" role="status">{failed ? "Контур не загрузился. Выберите регион справа." : "Загружаем карту…"}</div>}
      {geometry && Object.entries(anchors).map(([key, coords]) => {
        const [left, top] = project(coords);
        return <button key={key} type="button" className="map-dot"
          style={{ left: `${100 * left / size.x}%`, top: `${100 * top / size.y}%` }}
          aria-pressed={current === key} onClick={() => onSelect(key)}
          title={regions[key]} aria-label={regions[key] + ", " + counts[key]}>{counts[key]}</button>;
      })}
    </div>
    <div className="map-legend">
      <h3>Районы</h3>
      <p>Точки показывают районы. Карты подъезда и детали — в карточках.</p>
      {Object.entries(regions).map(([key, label]) => <button key={key} type="button"
        onClick={() => onSelect(key)} aria-pressed={current === key}><span>{label}</span><strong>{counts[key]}</strong></button>)}
    </div>
  </section>;
}
