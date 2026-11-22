import { resolveRecordId } from "./catalog.js";

const storageKey = "cr-atlas-trips-v1";
const emptyDay = () => ({ note: "", entries: [] });

function read() {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey));
    if (!Array.isArray(data?.trips)) return null;
    const trips = data.trips.filter(trip => typeof trip?.id === "string" && typeof trip.name === "string"
      && typeof trip.startDate === "string" && trip.days?.length > 0 && Array.isArray(trip.days)
      && trip.days.every(day => typeof day?.note === "string" && Array.isArray(day.entries)
        && day.entries.every(entry => typeof entry?.key === "string" && typeof entry.recordId === "string")));
    return { trips, activeId: trips.some(trip => trip.id === data.activeId) ? data.activeId : trips[0]?.id || "" };
  } catch {
    return null;
  }
}

export function initialTripPlans() {
  return read() ?? { trips: [], activeId: "" };
}

export function resolveTripRoutes(state, aliases = {}) {
  if (!Object.keys(aliases).length) return state;
  return {
    ...state,
    trips: state.trips.map(trip => ({
      ...trip,
      sourceId: resolveRecordId(trip.sourceId, aliases),
      days: trip.days.map(day => ({
        ...day,
        entries: day.entries.map(stop => ({ ...stop, recordId: resolveRecordId(stop.recordId, aliases) })),
      })),
    })),
  };
}

export function saveTripPlans(fallback, change, useDisk) {
  const next = change(useDisk ? read() ?? fallback : fallback);
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
    return { plans: next, stored: true };
  } catch {
    return { plans: next, stored: false };
  }
}

function entry(recordId) {
  return { key: crypto.randomUUID(), recordId, visited: false };
}

export function newTrip(record) {
  const stages = record?.stages ?? [];
  return {
    id: crypto.randomUUID(),
    name: record?.title || "Новая поездка",
    startDate: "",
    sourceId: record?.id || "",
    days: stages.length ? stages.map(stage => ({
      note: [stage.title, stage.note].filter(Boolean).join("\n"),
      entries: stage.stops.map(entry),
    })) : [emptyDay()],
  };
}

export function selectNewTrip(state, trip) {
  return { activeId: trip.id, trips: [...state.trips, trip] };
}

export function editTrip(state, id, change) {
  return { ...state, trips: state.trips.map(trip => trip.id === id ? change(trip) : trip) };
}

export function addRouteToTrip(state, recordId) {
  const active = state.trips.find(trip => trip.id === state.activeId);
  const plan = active ? state : selectNewTrip(state, newTrip());
  return editTrip(plan, plan.activeId, trip => {
    if (trip.days.some(day => day.entries.some(stop => stop.recordId === recordId))) return trip;
    const [first, ...rest] = trip.days;
    return { ...trip, days: [{ ...first, entries: [...first.entries, entry(recordId)] }, ...rest] };
  });
}

export function appendTripDay(trip) {
  return { ...trip, days: [...trip.days, emptyDay()] };
}

export function dateForDay(startDate, index) {
  if (!startDate) return "";
  const date = new Date(startDate + "T00:00:00Z");
  if (Number.isNaN(date.valueOf())) return "";
  date.setUTCDate(date.getUTCDate() + index);
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short", day: "numeric", month: "long", timeZone: "UTC",
  }).format(date);
}
