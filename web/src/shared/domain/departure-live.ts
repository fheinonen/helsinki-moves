import type { Departure } from "./departure.js";

export interface DepartureTimeUpdate {
  departureIso: string;
  stopId: string;
  tripId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  return text.length > 0 ? text : null;
}

export function parseDepartureTimeMessage(raw: string): DepartureTimeUpdate | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.type !== "departure-time") {
    return null;
  }
  const departureIso = readText(parsed.departureIso);
  const stopId = readText(parsed.stopId);
  const tripId = readText(parsed.tripId);
  if (!departureIso || !stopId || !tripId || Number.isNaN(Date.parse(departureIso))) {
    return null;
  }
  return { departureIso, stopId, tripId };
}

export function serializeDepartureTimeUpdate(update: DepartureTimeUpdate): string {
  return JSON.stringify({
    departureIso: update.departureIso,
    stopId: update.stopId,
    tripId: update.tripId,
    type: "departure-time",
  });
}

function liveDepartureKey(departure: Departure): string | null {
  const tripId = departure.tripId?.trim();
  const stopId = departure.stopId?.trim();
  if (!tripId || !stopId) {
    return null;
  }
  return `${tripId}\u001f${stopId}`;
}

export function departureTimeUpdates(
  previous: readonly Departure[],
  next: readonly Departure[],
): DepartureTimeUpdate[] {
  const priorTimes = new Map<string, string>();
  for (const departure of previous) {
    const key = liveDepartureKey(departure);
    if (key) {
      priorTimes.set(key, departure.departureIso);
    }
  }

  const updates: DepartureTimeUpdate[] = [];
  for (const departure of next) {
    const key = liveDepartureKey(departure);
    const tripId = departure.tripId?.trim();
    const stopId = departure.stopId?.trim();
    if (!key || !tripId || !stopId) {
      continue;
    }
    const before = priorTimes.get(key);
    if (!before || before === departure.departureIso) {
      continue;
    }
    updates.push({
      departureIso: departure.departureIso,
      stopId,
      tripId,
    });
  }
  return updates;
}
