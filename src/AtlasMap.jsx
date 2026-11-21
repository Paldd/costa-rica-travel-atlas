import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { regions } from "./catalog.js";
import { createOsmMap, routePathStyle } from "./osmMap.js";

const mapCenter = [9.94, -84.12];
const cellSize = 45;
const groupUntilZoom = 15;
const outlineUrl = import.meta.env.BASE_URL + "maps/costa-rica.json";

function pointGroups(records) {
  const byCoordinates = new Map();
  for (const record of records) {
    const stop = record.dossier?.stops[0];
    if (!stop) continue;
    const key = stop.coords.join(",");
    const group = byCoordinates.get(key) ?? { coords: stop.coords, entries: [] };
    group.entries.push({ record, stop });
    byCoordinates.set(key, group);
  }
  return [...byCoordinates.values()];
}

function groupNearbyPoints(map, points) {
  if (map.getZoom() > groupUntilZoom) return points.map(point => [point]);
  const cells = new Map();
  for (const point of points) {
    const { x, y } = map.project(point.coords);
    const key = `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
    const cell = cells.get(key) ?? [];
    cell.push(point);
    cells.set(key, cell);
  }
  return [...cells.values()];
}

function markerIcon(count, clustered) {
  return L.divIcon({
    className: `atlas-map-marker${clustered ? " atlas-map-cluster" : ""}`,
    html: count > 1 ? String(count) : '<span aria-hidden="true"></span>',
    iconSize: count > 1 ? [32, 32] : [25, 25],
  });
}

function markerPopup(entries, linkTo, selectRoute) {
  const popup = document.createElement("ul");
  popup.className = "atlas-map-popup";
  for (const { record, stop } of entries) {
    const item = document.createElement("li");
    const title = document.createElement("a");
    title.href = linkTo(record.id);
    title.textContent = record.title;
    const location = document.createElement("small");
    location.textContent = stop.name;
    item.append(title, location);
    if (record.dossier.line || record.dossier.stops.length > 1) {
      const showRoute = document.createElement("button");
      showRoute.type = "button";
      showRoute.textContent = "Показать на карте";
      showRoute.addEventListener("click", () => selectRoute(record));
      item.append(showRoute);
    }
    popup.append(item);
  }
  return popup;
}

export default function AtlasMap({ records, lines, sources, current, onSelect, linkTo }) {
  const container = useRef(null);
  const view = useRef(null);
  const previewLink = useRef(null);
  const [selection, setSelection] = useState(null);
  const selected = selection?.records === records ? selection.record : null;
  const points = useMemo(() => pointGroups(records), [records]);
  const route = lines[selected?.dossier.line];

  useEffect(() => {
    const map = createOsmMap(container.current);
    map.setView(mapCenter, 7);
    view.current = { map, pins: L.layerGroup().addTo(map), preview: L.layerGroup().addTo(map) };
    const pane = map.createPane("countryOutline");
    pane.style.zIndex = "190";
    const controller = new AbortController();
    fetch(outlineUrl, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(geometry => {
        if (!geometry || controller.signal.aborted) return;
        L.geoJSON(geometry, { pane: "countryOutline", interactive: false,
          style: { color: "#7eaa90", weight: 1, fillColor: "#cbdcc5", fillOpacity: 0.85 } }).addTo(map);
      })
      .catch(() => {});
    return () => {
      controller.abort();
      view.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const { map, pins } = view.current;
    function drawPins() {
      pins.clearLayers();
      for (const cell of groupNearbyPoints(map, points)) {
        if (cell.length > 1) {
          const bounds = L.latLngBounds(cell.map(point => point.coords));
          const count = cell.reduce((total, point) => total + point.entries.length, 0);
          L.marker(bounds.getCenter(), { icon: markerIcon(count, true), title: `Увеличить область, карточек: ${count}` })
            .on("click", () => map.fitBounds(bounds, { padding: [44, 44], maxZoom: groupUntilZoom + 1 }))
            .addTo(pins);
          continue;
        }
        const { coords, entries } = cell[0];
        const title = entries.length === 1 ? entries[0].record.title : `Карточек у этой точки: ${entries.length}`;
        L.marker(coords, { title, icon: markerIcon(entries.length, false) })
          .bindPopup(() => markerPopup(entries, linkTo, record => setSelection({ record, records })), { maxHeight: 225 })
          .addTo(pins);
      }
    }

    if (points.length) map.fitBounds(points.map(point => point.coords), { padding: [40, 38], maxZoom: 13 });
    drawPins();
    map.on("zoomend", drawPins);
    return () => {
      map.off("zoomend", drawPins);
      map.closePopup();
      pins.clearLayers();
    };
  }, [points, records, linkTo]);

  useEffect(() => {
    const { map, preview } = view.current;
    preview.clearLayers();
    if (!selected) return;
    map.closePopup();
    const stops = selected.dossier.stops;
    const bounds = L.latLngBounds(stops.map(stop => stop.coords));
    for (const path of route?.stages?.map(id => lines[id]) ?? (route ? [route] : [])) {
      const layer = L.polyline(path.coords, routePathStyle(path.water)).addTo(preview);
      bounds.extend(layer.getBounds());
    }
    for (const stop of stops) {
      L.circleMarker(stop.coords, { radius: 6, weight: 2, color: "#fff", fillColor: "#874916", fillOpacity: 1 })
        .bindTooltip(() => {
          const label = document.createElement("span");
          label.textContent = stop.name;
          return label;
        })
        .addTo(preview);
    }
    map.fitBounds(bounds, { padding: [34, 34], maxZoom: 15 });
    previewLink.current?.focus({ preventScroll: true });
  }, [selected, route, lines]);

  const counts = Object.fromEntries(Object.keys(regions).map(key =>
    [key, records.filter(row => row.region === key || row.regions?.includes(key)).length]));
  return <section className="map-panel" aria-label="Карта маршрутов и мест">
    <div ref={container} className="atlas-map-canvas" aria-label="Интерактивная карта каталога" />
    <div className="map-legend">
      {selected && <div className="atlas-map-preview">
        <strong>{selected.title}</strong>
        {route?.note && <p>{route.note}</p>}
        {!route && <p>На карте отмечены остановки этой карточки.</p>}
        {route && <a href={sources[route.source].url} target="_blank" rel="noopener noreferrer">Источник линии ↗</a>}
        <a ref={previewLink} href={linkTo(selected.id)}>Открыть карточку</a>
        <button type="button" onClick={() => setSelection(null)}>Убрать с карты</button>
      </div>}
      <h3>Районы</h3>
      <p>{points.length ? "Приблизьте карту или выберите точку, чтобы открыть карточку." : "В этой подборке пока нет точек на карте."}</p>
      {Object.entries(regions).map(([key, label]) => <button key={key} type="button"
        onClick={() => onSelect(key)} aria-pressed={current === key}><span>{label}</span><strong>{counts[key]}</strong></button>)}
    </div>
  </section>;
}
