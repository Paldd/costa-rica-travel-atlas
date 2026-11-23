import React from "react";
import ActivityIcon, { mainActivity } from "./ActivityIcon.jsx";
import { regions } from "./catalog.js";

const width = 480;
const height = 180;
const padding = 28;

function sample(coords) {
  if (coords.length <= 80) return coords;
  return Array.from({ length: 80 }, (_, index) => coords[Math.round(index * (coords.length - 1) / 79)]);
}

function plot(stops, line, lines) {
  const paths = (line?.stages ? line.stages.map(id => lines[id]) : [line])
    .flatMap(stage => stage?.coords?.length ? [sample(stage.coords)] : []);
  const markers = [...new Map(stops.map(stop => [stop.coords.join(","), stop.coords])).values()];
  const coords = [...markers, ...paths.flat()];
  const latitude = coords.map(point => point[0]);
  const longitude = coords.map(point => point[1]);
  const south = Math.min(...latitude);
  const north = Math.max(...latitude);
  const west = Math.min(...longitude);
  const east = Math.max(...longitude);
  const latCenter = (north + south) / 2;
  const lonCenter = (east + west) / 2;
  const lonScale = Math.cos(latCenter * Math.PI / 180);
  const scale = Math.min(
    (width - 2 * padding) / Math.max((east - west) * lonScale, 0.0005),
    (height - 2 * padding) / Math.max(north - south, 0.0005),
  );
  const project = ([lat, lon]) => [width / 2 + (lon - lonCenter) * lonScale * scale, height / 2 - (lat - latCenter) * scale];
  return { paths: paths.map(path => path.map(project)), markers: markers.map(project) };
}

export default function RoutePreview({ row, lines }) {
  const stops = row.dossier?.stops ?? [];
  const { paths, markers } = stops.length ? plot(stops, lines[row.dossier.line], lines) : { paths: [], markers: [] };
  const label = paths.length ? "Схема маршрута" : stops.length ? "Схема точек" : "Активность";
  return <div className={"route-preview region-" + row.region}>
    <div className="preview-activity" aria-hidden="true">
      <ActivityIcon activity={mainActivity(row)} size={36} />
    </div>
    {markers.length > 0 && <svg className="preview-plot" viewBox={"0 0 " + width + " " + height}
      role="img" aria-label={label + " · " + regions[row.region]}>
      {paths.map((path, index) => <polyline key={index} points={path.map(point => point.join(",")).join(" ")} />)}
      {markers.map(([x, y], index) => <circle key={index} cx={x} cy={y} r={index === 0 ? 7 : 4.5} />)}
    </svg>}
    <span className="preview-label">{label}</span>
  </div>;
}
