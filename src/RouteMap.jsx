import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const mapUrl = ([lat, lon]) => `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

export default function RouteMap({ stops, track, line, lineSource }) {
  const container = useRef(null);
  const markers = useRef([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const map = L.map(container.current, { scrollWheelZoom: false, maxZoom: 19 });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://www.openstreetmap.org/fixthemap">Исправить карту</a>',
      maxZoom: 19,
    }).addTo(map);

    const positions = stops.map(stop => stop.coords);
    if (line) {
      const path = L.polyline(line.coords, { color: "#216e57", weight: 4, interactive: false }).addTo(map);
      map.fitBounds(path.getBounds().extend(L.latLngBounds(positions)), { padding: [30, 30], maxZoom: 15 });
    } else if (positions.length > 1) {
      L.polyline(positions, { color: "#874916", weight: 3, dashArray: "6 8", interactive: false }).addTo(map);
      map.fitBounds(positions, { padding: [30, 30], maxZoom: 14 });
    } else {
      map.setView(positions[0], 15);
    }

    const groups = new Map();
    stops.forEach((stop, index) => {
      const key = stop.coords.join(",");
      const group = groups.get(key) || [];
      group.push(index);
      groups.set(key, group);
    });
    const mappedMarkers = Array(stops.length);
    for (const group of groups.values()) {
      const index = group[0];
      const stop = stops[index];
      const popup = document.createElement("span");
      popup.textContent = stop.name;
      const marker = L.marker(stop.coords, {
        icon: L.divIcon({ className: "route-map-marker", html: group.map(i => i + 1).join("·"), iconSize: [group.length > 1 ? 39 : 27, 27] }),
        title: stop.name,
      }).addTo(map).bindPopup(popup);
      marker.on("popupopen", () => setSelected(index));
      group.forEach(i => { mappedMarkers[i] = marker; });
    }
    markers.current = mappedMarkers;

    return () => {
      markers.current = [];
      map.remove();
    };
  }, [stops, line]);

  return <section className="route-map" aria-label="Карта маршрута">
    <h2>{stops.length > 1 ? "Карта маршрута" : "Точка на карте"}</h2>
    <div className="route-map-layout">
      <div ref={container} className="route-map-canvas" aria-label="Интерактивная карта" />
      <ol className="route-map-stops">
        {stops.map((stop, index) => <li key={`${stop.point}-${index}`}>
          <button type="button" aria-pressed={selected === index} onClick={() => {
            markers.current[index]?.openPopup();
            setSelected(index);
          }}>
            <span className="stop-number" aria-hidden="true">{index + 1}</span>
            <span><strong>{stop.name}</strong><small>{stop.role}</small></span>
          </button>
          {stop.note && <p>{stop.note}</p>}
          <a href={mapUrl(stop.coords)} target="_blank" rel="noopener noreferrer">Открыть точку</a>
        </li>)}
      </ol>
    </div>
    <div className="route-map-links">
      {line ? <span>{line.note} <a href={lineSource.url} target="_blank" rel="noopener noreferrer">Данные маршрута © OpenStreetMap ↗</a></span>
        : stops.length > 1 && <span>Пунктир показывает порядок остановок.{track && " Для навигации откройте карту или трек по ссылке."}</span>}
      {track && <a href={track.url} target="_blank" rel="noopener noreferrer">{track.title} ↗</a>}
    </div>
  </section>;
}
