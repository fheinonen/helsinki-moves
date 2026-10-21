import type { Departure } from "../../../shared/domain/departure.js";
import type { Mode } from "../../../shared/domain/mode.js";

const STRETCH_MINUTES = 15;
const MINUTE_MS = 60_000;

interface GlancePolicy {
  readonly horizonMinutes: number;
  readonly maxHorizonMinutes: number;
  readonly maxRows: number;
  readonly minRows: number;
  readonly perLineFirst: true;
}

const GLANCE_POLICIES = {
  BUS: { horizonMinutes: 45, maxHorizonMinutes: 75, maxRows: 12, minRows: 4, perLineFirst: true },
  METRO: { horizonMinutes: 25, maxHorizonMinutes: 45, maxRows: 10, minRows: 3, perLineFirst: true },
  RAIL: { horizonMinutes: 40, maxHorizonMinutes: 75, maxRows: 10, minRows: 4, perLineFirst: true },
  TRAM: { horizonMinutes: 35, maxHorizonMinutes: 60, maxRows: 10, minRows: 3, perLineFirst: true },
} as const satisfies Record<Mode, GlancePolicy>;

const departureFetchWindowBrand = Symbol("DepartureFetchWindow");

export type DepartureFetchWindow = {
  readonly [departureFetchWindowBrand]: "DepartureFetchWindow";
  readonly nowMs: number;
  readonly startTimeUnixSeconds: number;
  readonly timeRangeSeconds: number;
};

interface GlanceSelections {
  readonly destinations: readonly string[];
  readonly lines: readonly string[];
}

export function departureFetchWindow(mode: Mode, nowMs: number): DepartureFetchWindow {
  return {
    [departureFetchWindowBrand]: "DepartureFetchWindow",
    nowMs,
    startTimeUnixSeconds: Math.floor(nowMs / 1000),
    timeRangeSeconds: GLANCE_POLICIES[mode].maxHorizonMinutes * 60,
  };
}

export function selectGlanceDepartures(input: {
  departures: readonly Departure[];
  mode: Mode;
  nowMs: number;
  selections: GlanceSelections;
}): Departure[] {
  const policy = GLANCE_POLICIES[input.mode];
  const sorted = [...input.departures].sort(compareDeparturesByTime);
  const horizonMinutes = resolveHorizonMinutes(policy, sorted, input.nowMs);
  const windowed = departuresInHorizon(sorted, input.nowMs, horizonMinutes, policy.maxHorizonMinutes);
  if (!usePerLineFirst(policy, input.selections)) {
    return windowed.slice(0, policy.maxRows);
  }
  return appendUnlistedUntilMaxRows(earliestDeparturePerLine(windowed), windowed, policy.maxRows);
}

function compareDeparturesByTime(left: Departure, right: Departure): number {
  return departureTimeMs(left) - departureTimeMs(right);
}

function departureTimeMs(departure: Departure): number {
  return new Date(departure.departureIso).getTime();
}

function departuresInHorizon(
  sorted: readonly Departure[],
  nowMs: number,
  horizonMinutes: number,
  maxHorizonMinutes: number,
): Departure[] {
  const endMs = nowMs + Math.min(horizonMinutes, maxHorizonMinutes) * MINUTE_MS;
  return sorted.filter((departure) => isInsideHorizon(departureTimeMs(departure), nowMs, endMs));
}

function isInsideHorizon(timeMs: number, nowMs: number, endMs: number): boolean {
  return timeMs > nowMs && timeMs <= endMs;
}

function resolveHorizonMinutes(
  policy: GlancePolicy,
  departures: readonly Departure[],
  nowMs: number,
): number {
  let horizonMinutes = policy.horizonMinutes;
  while (shouldStretch(policy, departures, nowMs, horizonMinutes)) {
    horizonMinutes = Math.min(horizonMinutes + STRETCH_MINUTES, policy.maxHorizonMinutes);
  }
  return horizonMinutes;
}

function shouldStretch(
  policy: GlancePolicy,
  departures: readonly Departure[],
  nowMs: number,
  horizonMinutes: number,
): boolean {
  if (horizonMinutes >= policy.maxHorizonMinutes) {
    return false;
  }
  const inside = departuresInHorizon(departures, nowMs, horizonMinutes, policy.maxHorizonMinutes);
  return inside.length < policy.minRows;
}

function usePerLineFirst(policy: GlancePolicy, selections: GlanceSelections): boolean {
  if (selections.lines.length > 0) {
    return false;
  }
  if (selections.destinations.length > 0) {
    return false;
  }
  return policy.perLineFirst;
}

function earliestDeparturePerLine(windowed: readonly Departure[]): Departure[] {
  const seen = new Set<string>();
  const picks: Departure[] = [];
  for (const departure of windowed) {
    if (seen.has(departure.line)) {
      continue;
    }
    seen.add(departure.line);
    picks.push(departure);
  }
  return picks;
}

function appendUnlistedUntilMaxRows(
  picks: readonly Departure[],
  windowed: readonly Departure[],
  maxRows: number,
): Departure[] {
  if (picks.length >= maxRows) {
    return picks.slice(0, maxRows);
  }
  const listed = new Set(picks);
  const filled = picks.slice();
  for (const departure of windowed) {
    if (filled.length >= maxRows) {
      break;
    }
    if (listed.has(departure)) {
      continue;
    }
    listed.add(departure);
    filled.push(departure);
  }
  return filled;
}
