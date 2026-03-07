import type { Departure } from "../../../shared/domain/departure.js";
import type { FilterOption } from "../../../shared/domain/filter.js";
import type { Stop } from "../../../shared/domain/stop.js";
import type { NearbyStopNode } from "./types.js";

function countByValue(values: string[]): FilterOption[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([value, count]) => ({ count, value }));
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

export function buildSelectableStops(modeStops: NearbyStopNode[]): Stop[] {
  const stopGroups = new Map<
    string,
    {
      code: string | null;
      distanceMeters: number;
      id: string;
      memberStopIds: Set<string>;
      name: string;
      stopCodes: Set<string>;
    }
  >();

  for (const node of modeStops) {
    const stopId = node.stop.gtfsId;
    const stopName = node.stop.name.trim();
    const stopCode = node.stop.code?.trim() || null;
    if (!stopId || !stopName) {
      continue;
    }

    const groupKey = stopName.toLowerCase();
    const existingGroup = stopGroups.get(groupKey);
    if (!existingGroup) {
      stopGroups.set(groupKey, {
        code: stopCode,
        distanceMeters: Math.round(node.distance),
        id: stopId,
        memberStopIds: new Set([stopId]),
        name: stopName,
        stopCodes: new Set(stopCode ? [stopCode] : []),
      });
      continue;
    }

    existingGroup.memberStopIds.add(stopId);
    if (stopCode) {
      existingGroup.stopCodes.add(stopCode);
    }
    if (node.distance < existingGroup.distanceMeters) {
      existingGroup.id = stopId;
      existingGroup.code = stopCode || existingGroup.code;
      existingGroup.distanceMeters = Math.round(node.distance);
    }
  }

  return [...stopGroups.values()]
    .sort((left, right) => left.distanceMeters - right.distanceMeters)
    .slice(0, 8)
    .map((group) => ({
      code: group.code,
      distanceMeters: group.distanceMeters,
      id: group.id,
      memberStopIds: [...group.memberStopIds],
      name: group.name,
      stopCodes: [...group.stopCodes].sort((left, right) => left.localeCompare(right)),
    }));
}

export function filterDeparturesBySelections(
  departures: Departure[],
  input: {
    destinations: string[];
    lines: string[];
  }
): Departure[] {
  const destinationFilterSet = new Set(input.destinations);
  const lineFilterSet = new Set(input.lines);

  return departures
    .filter((departure) => {
      if (lineFilterSet.size === 0) {
        return true;
      }
      return lineFilterSet.has(departure.line.trim());
    })
    .filter((departure) => {
      if (destinationFilterSet.size === 0) {
        return true;
      }
      return destinationFilterSet.has(departure.destination.trim());
    });
}
