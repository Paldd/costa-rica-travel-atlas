import L from "leaflet";
import "leaflet/dist/leaflet.css";

export function createOsmMap(container) {
  // Animated zoom can finish after a card or the catalog map unmounts.
  const map = L.map(container, { scrollWheelZoom: false, maxZoom: 19, zoomAnimation: false, fadeAnimation: false });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://www.openstreetmap.org/fixthemap">Исправить карту</a>',
    maxZoom: 19,
  }).addTo(map);
  return map;
}

export const routePathStyle = water => ({
  color: water ? "#26648e" : "#216e57",
  weight: 4,
  dashArray: water ? "6 7" : null,
  interactive: false,
});
