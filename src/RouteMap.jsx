import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { createOsmMap, routePathStyle } from "./osmMap.js";

const mapUrl = ([lat, lon]) => `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

export default function RouteMap({ stops, track, line, lines, sources, connectStops = true }) {
  const container = useRef(null);
  const markers = useRef([]);
  const mapView = useRef(null);
  const [selected, setSelected] = useState(null);
  const [stageId, setStageId] = useState("");
  const stages = useMemo(() => (line?.stages || []).map(id => ({ id, ...lines[id] })), [line, lines]);
  const activeStage = stages.find(stage => stage.id === stageId);
  const numberedStops = stops.map((stop, index) => ({ stop, index }));
  const visibleStops = activeStage
    ? activeStage.points.flatMap(point => numberedStops.filter(({ stop }) => stop.point === point))
    : numberedStops;
  const lineSource = sources[line?.source];
  const stageSource = sources[activeStage?.stageSource];

  useEffect(() => {
    const map = createOsmMap(container.current);

    const positions = stops.map(stop => stop.coords);
    if (line) {
      const bounds = L.latLngBounds(positions);
      const paths = (stages.length ? stages : [line]).map(stage => {
        const layer = L.polyline(stage.coords, routePathStyle(stage.water)).addTo(map);
        bounds.extend(layer.getBounds());
        return { id: stage.id, layer };
      });
      mapView.current = { map, paths, bounds };
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    } else if (positions.length > 1) {
      if (connectStops) L.polyline(positions, { color: "#874916", weight: 3, dashArray: "6 8", interactive: false }).addTo(map);
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
      mapView.current = null;
      map.remove();
    };
  }, [stops, line, stages, connectStops]);

  function focusStage(id) {
    setStageId(id);
    setSelected(null);
    const view = mapView.current;
    if (!view) return;
    const stage = stages.find(item => item.id === id);
    view.map.closePopup();
    let bounds = view.bounds;
    for (const path of view.paths) {
      path.layer.setStyle({ opacity: !id || path.id === id ? 1 : 0.28 });
      if (id && path.id === id) {
        path.layer.bringToFront();
        bounds = L.latLngBounds(path.layer.getBounds());
        for (const stop of stops) {
          if (stage.points.includes(stop.point)) bounds.extend(stop.coords);
        }
      }
    }
    view.map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
  }

  return <section className="route-map" aria-label="Карта маршрута">
    <h2>{stops.length === 1 ? "Точка на карте" : line || connectStops ? "Карта маршрута" : "Ориентиры на карте"}</h2>
    {stages.length > 0 && <div className="route-map-stage">
      <label>Участок на карте
        <select value={stageId} onChange={event => focusStage(event.target.value)}>
          <option value="">Весь маршрут</option>
          {stages.map(stage => <option key={stage.id} value={stage.id}>{stage.title}</option>)}
        </select>
      </label>
      {stageSource && <a href={stageSource.url} target="_blank" rel="noopener noreferrer">Описание этапа ↗</a>}
    </div>}
    <div className="route-map-layout">
      <div ref={container} className="route-map-canvas" aria-label="Интерактивная карта" />
      <ol className="route-map-stops">
        {visibleStops.map(({ stop, index }) => <li key={`${stop.point}-${index}`}>
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
      {line ? <span>{activeStage?.note || line.note} <a href={lineSource.url} target="_blank" rel="noopener noreferrer">
        {line.source === "osm-cr-points" ? "Данные маршрута © OpenStreetMap" : lineSource.title} ↗
      </a></span>
        : stops.length > 1 && connectStops && <span>Пунктир показывает порядок остановок.{track && " Для навигации откройте карту или трек по ссылке."}</span>}
      {track && track.url !== lineSource?.url && <a href={track.url} target="_blank" rel="noopener noreferrer">{track.title} ↗</a>}
    </div>
  </section>;
}
