import { downloadFile, escapeMarkup } from "./downloads.js";

const attribution = "https://www.openstreetmap.org/copyright";
const osmSource = /^https:\/\/(?:(?:www\.)?openstreetmap\.org|routing\.openstreetmap\.de)\//;
const xml = value => escapeMarkup(String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, ""));
const latLon = ([lat, lon]) => `lat="${lat}" lon="${lon}"`;
const label = (...parts) => parts.filter(Boolean).join(" · ");
const sourceLink = source => source ? `<link href="${xml(source.url)}"><text>${xml(source.title)}</text></link>` : "";

export function openMapLines(line, lines, sources) {
  const segments = line?.stages ? line.stages.map(id => lines[id]) : [line];
  return segments.filter(segment => segment?.coords?.length >= 2 && !segment.water && osmSource.test(sources[segment.source]?.url));
}

export function createGpx(name, routes, { lines, sources }) {
  const waypoints = [];
  const tracks = [];
  for (const route of routes) {
    for (const stop of route.stops) {
      const title = label(route.prefix, stop.name);
      const details = label(stop.role, stop.note);
      waypoints.push(`<wpt ${latLon(stop.coords)}><name>${xml(title)}</name><desc>${xml(details)}</desc>${sourceLink(sources[stop.source])}</wpt>`);
    }
    for (const segment of openMapLines(route.line, lines, sources)) {
      const trackPoints = segment.coords.map(point => `<trkpt ${latLon(point)}/>`);
      tracks.push(`<trk><name>${xml(label(route.prefix, segment.title || route.title))}</name><desc>${xml(segment.note)}</desc>`
        + `<src>OpenStreetMap contributors · ODbL</src>${sourceLink(sources[segment.source])}<trkseg>${trackPoints.join("")}</trkseg></trk>`);
    }
  }
  const disclosure = tracks.length
    ? `<desc>Координаты остановок и линии OpenStreetMap. Данные линий © OpenStreetMap contributors (ODbL).</desc><link href="${attribution}"><text>OpenStreetMap · ODbL</text></link>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="Атлас Коста-Рики">\n`
    + `<metadata><name>${xml(name)}</name>${disclosure}</metadata>\n${[...waypoints, ...tracks].join("\n")}\n</gpx>\n`;
}

export function downloadGpx(filename, name, routes, atlas) {
  downloadFile(filename, "application/gpx+xml;charset=utf-8", createGpx(name, routes, atlas));
}
