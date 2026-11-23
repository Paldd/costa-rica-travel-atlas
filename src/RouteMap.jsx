import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { Download } from "lucide-react";
import { createOsmMap, routePathStyle } from "./osmMap.js";
import { downloadGpx, openMapLines } from "./gpx.js";
import ActivityIcon from "./ActivityIcon.jsx";

const mapUrl = ([lat, lon]) => `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
const osmPointUrl = ([lat, lon]) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;

export default function RouteMap({ record, stops, track, line, lines, sources, connectStops = true }) {
  const container = useRef(null);
  const markers = useRef([]);
  const mapView = useRef(null);
  const [selected, setSelected] = useState(null);
  const [stageId, setStageId] = useState("");
  const stages = useMemo(() => {
    if (line) return (line.stages || []).map(id => ({ id, ...lines[id] }));
    return (record.stages || []).filter(stage => stage.points?.length).map(stage => ({
      id: `day-${stage.day}`,
      title: `День ${stage.day} · ${stage.title}`,
      points: stage.points,
      stageSource: stage.sources?.[0],
    }));
  }, [line, lines, record.stages]);
  const activeStage = stages.find(stage => stage.id === stageId);
  const numberedStops = stops.map((stop, index) => ({ stop, index }));
  const stopsForStage = stage => stage
    ? stage.points.flatMap(point => numberedStops.filter(({ stop }) => stop.point === point))
    : numberedStops;
  const visibleStops = stopsForStage(activeStage);
  const lineSource = sources[activeStage?.source || line?.source];
  const stageSource = sources[activeStage?.stageSource];
  const exportLine = activeStage?.coords ? activeStage : line;
  const exportTitle = activeStage?.title || record.title;
  const hasTracks = openMapLines(exportLine, lines, sources).length > 0;

  useEffect(() => {
    const map = createOsmMap(container.current);

    const positions = stops.map(stop => stop.coords);
    const bounds = L.latLngBounds(positions);
    const paths = (line?.stages ? stages : line ? [line] : []).map(stage => {
      const layer = L.polyline(stage.coords, routePathStyle(stage.water)).addTo(map);
      bounds.extend(layer.getBounds());
      return { id: stage.id, layer };
    });
    mapView.current = { map, paths, bounds };
    if (line) {
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
    const dayStops = stopsForStage(stage);
    const bounds = stage ? L.latLngBounds(dayStops.map(({ stop }) => stop.coords)) : view.bounds;
    for (const path of view.paths) {
      path.layer.setStyle({ opacity: !id || path.id === id ? 1 : 0.28 });
      if (id && path.id === id) {
        path.layer.bringToFront();
        bounds.extend(path.layer.getBounds());
      }
    }
    if (!line) {
      const dayMarkers = new Set(dayStops.map(({ index }) => markers.current[index]));
      for (const marker of new Set(markers.current)) {
        if (dayMarkers.has(marker)) marker.addTo(view.map);
        else marker.remove();
      }
    }
    view.map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
  }

  return <section className="route-map" aria-label="Карта маршрута">
    <div className="route-map-heading">
      <h2>{stops.length === 1 ? "Точка на карте" : line || connectStops ? "Карта маршрута" : "Ориентиры на карте"}</h2>
      <button type="button" className="button secondary" onClick={() => {
        const suffix = activeStage ? `-${activeStage.id}` : "";
        downloadGpx(`${record.id}${suffix}.gpx`, exportTitle,
          [{ title: exportTitle, line: exportLine, stops: visibleStops.map(({ stop }) => stop),
            accessNote: record.dossier.accessNotice?.title }], { lines, sources });
      }}><Download size={16} aria-hidden="true" /> {hasTracks ? "Скачать GPX" : "Скачать точки GPX"}</button>
    </div>
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
            {stop.activity && <ActivityIcon activity={stop.activity} size={15} />}
            <span><strong>{stop.name}</strong><small>{stop.role}</small></span>
          </button>
          {stop.note && <p>{stop.note}</p>}
          <div className="point-links">
            <a href={mapUrl(stop.coords)} target="_blank" rel="noopener noreferrer">Открыть точку</a>
            <a href={stop.source === "osm-cr-points" ? osmPointUrl(stop.coords) : sources[stop.source].url}
              target="_blank" rel="noopener noreferrer">Источник координат</a>
          </div>
        </li>)}
      </ol>
    </div>
    <div className="route-map-links">
      {line ? <span>{activeStage?.note || line.note} <a href={lineSource.url} target="_blank" rel="noopener noreferrer">
        {line.source === "osm-cr-points" ? "Данные маршрута © OpenStreetMap" : lineSource.title} ↗
      </a></span>
        : stops.length > 1 && connectStops && <span>Пунктир показывает порядок остановок.{record.dossier?.trackKind && " По ссылке открывается трек или схема у источника."}</span>}
      {track && track.url !== lineSource?.url && <a href={track.url} target="_blank" rel="noopener noreferrer">{track.title} ↗</a>}
    </div>
  </section>;
}
