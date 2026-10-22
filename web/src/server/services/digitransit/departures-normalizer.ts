import type { Departure } from "../../../shared/domain/departure.js";
import type { FilterOption } from "../../../shared/domain/filter.js";
import type { Stop } from "../../../shared/domain/stop.js";
import type { NearbyStopNode } from "./types.js";

const FINNISH_LOCALE = "fi-FI";
const NON_ALPHANUMERIC_PATTERN = /[^\p{L}\p{N}]+/gu;

function normalizeDisplayValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").normalize("NFC");
}

function normalizeComparableValue(value: string): string {
  return normalizeDisplayValue(value)
    .toLocaleLowerCase(FINNISH_LOCALE)
    .replace(NON_ALPHANUMERIC_PATTERN, "");
}

function normalizeFilterSet(values: string[]): Set<string> {
  return new Set(values.map((value) => normalizeComparableValue(value)).filter(Boolean));
}

function matchesNormalizedFilter(value: string, filters: Set<string>): boolean {
  if (filters.size === 0) {
    return true;
  }

  return filters.has(normalizeComparableValue(value));
}

interface StopGroup {
  code: string | null;
  distanceMeters: number;
  id: string;
  lat: number | null;
  lon: number | null;
  memberStopIds: Set<string>;
  name: string;
  stopCodes: Set<string>;
}

function readFinitePoint(node: NearbyStopNode): { lat: number; lon: number } | null {
  const lat = node.stop.lat;
  const lon = node.stop.lon;
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return { lat, lon };
}

function createEmptyStopGroup(node: NearbyStopNode): StopGroup {
  const stopId = node.stop.gtfsId;
  const stopCode = node.stop.code?.trim() || null;
  const point = readFinitePoint(node);

  return {
    code: stopCode,
    distanceMeters: Math.round(node.distance),
    id: stopId,
    lat: point?.lat ?? null,
    lon: point?.lon ?? null,
    memberStopIds: new Set([stopId]),
    name: node.stop.name.trim(),
    stopCodes: new Set(stopCode ? [stopCode] : []),
  };
}

function updateStopGroup(group: StopGroup, node: NearbyStopNode): void {
  const stopId = node.stop.gtfsId;
  const stopCode = node.stop.code?.trim() || null;
  const roundedDistance = Math.round(node.distance);

  group.memberStopIds.add(stopId);
  if (stopCode) {
    group.stopCodes.add(stopCode);
  }
  if (roundedDistance >= group.distanceMeters) {
    return;
  }

  const point = readFinitePoint(node);
  group.id = stopId;
  group.code = stopCode || group.code;
  group.distanceMeters = roundedDistance;
  group.lat = point?.lat ?? null;
  group.lon = point?.lon ?? null;
}

function countByValue(values: string[]): FilterOption[] {
  const counts = new Map<string, { count: number; value: string }>();
  for (const value of values) {
    const normalizedValue = normalizeComparableValue(value);
    if (!normalizedValue) {
      continue;
    }
    const current = counts.get(normalizedValue);
    if (current) {
      current.count += 1;
      continue;
    }
    counts.set(normalizedValue, {
      count: 1,
      value: normalizeDisplayValue(value),
    });
  }

  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
    .map(({ count, value }) => ({ count, value }));
}

export function buildFilterOptions(departures: Departure[]): {
  destinations: FilterOption[];
  lines: FilterOption[];
} {
  const lines = departures.map((departure) => departure.line.trim()).filter(Boolean);
  const destinations = departures
    .map((departure) => departure.destination.trim())
    .filter(Boolean);

  return {
    destinations: countByValue(destinations),
    lines: countByValue(lines),
  };
}

function toSelectableStop(group: StopGroup): Stop {
  const stop: Stop = {
    code: group.code,
    distanceMeters: group.distanceMeters,
    id: group.id,
    memberStopIds: [...group.memberStopIds],
    name: group.name,
    stopCodes: [...group.stopCodes].sort((left, right) => left.localeCompare(right, FINNISH_LOCALE)),
  };
  if (group.lat == null || group.lon == null) {
    return stop;
  }
  return {
    ...stop,
    lat: group.lat,
    lon: group.lon,
  };
}

export function buildSelectableStops(modeStops: NearbyStopNode[]): Stop[] {
  const stopGroups = new Map<string, StopGroup>();

  for (const node of modeStops) {
    const stopId = node.stop.gtfsId;
    const stopName = node.stop.name.trim();
    if (!stopId || !stopName) {
      continue;
    }

    const groupKey = stopName.toLocaleLowerCase(FINNISH_LOCALE);
    const existingGroup = stopGroups.get(groupKey);
    if (!existingGroup) {
      stopGroups.set(groupKey, createEmptyStopGroup(node));
      continue;
    }

    updateStopGroup(existingGroup, node);
  }

  return [...stopGroups.values()]
    .sort((left, right) => left.distanceMeters - right.distanceMeters)
    .slice(0, 8)
    .map(toSelectableStop);
}

export function filterDeparturesBySelections(
  departures: Departure[],
  input: {
    destinations: string[];
    lines: string[];
  }
): Departure[] {
  const destinationFilterSet = normalizeFilterSet(input.destinations);
  const lineFilterSet = normalizeFilterSet(input.lines);

  return departures.filter(
    (departure) =>
      matchesNormalizedFilter(departure.line, lineFilterSet) &&
      matchesNormalizedFilter(departure.destination, destinationFilterSet)
  );
}
