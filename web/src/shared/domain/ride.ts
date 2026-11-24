import type { Mode } from "./mode.js";
import type { MapExtent } from "./street-map.js";
import type { GeoPoint } from "./vehicle-span.js";

export type AppView = "wait" | "ride";
export type RideTelemetry = "live" | "timetable";
export type RideStatus = "active" | "arrived";
export type RideStopState = "past" | "next" | "upcoming" | "beyond-exit";
export type RideExitUrgency = "calm" | "approaching" | "exit-next" | "arrived";

export interface RideStop {
  readonly arrivalIso: string;
  readonly code: string | null;
  readonly lat: number;
  readonly lon: number;
  readonly name: string;
  readonly platform: string | null;
  readonly realtime: boolean;
  readonly stopId: string;
}

export interface RideSnapshot {
  readonly destination: string;
  readonly line: string;
  readonly mode: Mode;
  readonly route: readonly GeoPoint[];
  readonly stops: readonly RideStop[];
  readonly tripId: string;
  readonly vehicle: GeoPoint | null;
}

export interface RideProgressStop {
  readonly isExit: boolean;
  readonly minutesUntil: number;
  readonly state: RideStopState;
  readonly stop: RideStop;
}

export interface RideExitSummary {
  readonly minutesRemaining: number;
  readonly stop: RideStop;
  readonly stopsRemaining: number;
  readonly urgency: RideExitUrgency;
}

export interface RideProgress {
  readonly exit: RideExitSummary | null;
  readonly finalStop: RideStop | null;
  readonly nextMinutes: number | null;
  readonly nextStop: RideStop | null;
  readonly nextStopIndex: number;
  readonly pastCount: number;
  readonly status: RideStatus;
  readonly stops: readonly RideProgressStop[];
  readonly telemetry: RideTelemetry;
}

export interface ComputeRideProgressOptions {
  readonly boardedStopId?: string | null;
  readonly exitStopId?: string | null;
}

const PASS_EPSILON = 1e-6;
const MIN_EXTENT_SPAN = 0.002;

export function parseAppView(value: unknown): AppView {
  return String(value ?? "").trim().toLowerCase() === "ride" ? "ride" : "wait";
}

function segmentLength(from: GeoPoint, to: GeoPoint): number {
  return Math.hypot(to.lat - from.lat, to.lon - from.lon);
}

function projectOntoSegment(
  point: GeoPoint,
  from: GeoPoint,
  to: GeoPoint,
): { distSq: number; t: number } {
  const dLat = to.lat - from.lat;
  const dLon = to.lon - from.lon;
  const lenSq = dLat * dLat + dLon * dLon;
  if (lenSq <= 0) {
    const eLat = point.lat - from.lat;
    const eLon = point.lon - from.lon;
    return { distSq: eLat * eLat + eLon * eLon, t: 0 };
  }
  const rawT = ((point.lat - from.lat) * dLat + (point.lon - from.lon) * dLon) / lenSq;
  const t = Math.max(0, Math.min(1, rawT));
  const eLat = point.lat - (from.lat + dLat * t);
  const eLon = point.lon - (from.lon + dLon * t);
  return { distSq: eLat * eLat + eLon * eLon, t };
}

function progressAlongLine(line: readonly GeoPoint[], point: GeoPoint): number {
  let cumulative = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestProgress = 0;

  for (let index = 0; index < line.length - 1; index += 1) {
    const from = line[index];
    const to = line[index + 1];
    const length = segmentLength(from, to);
    const projected = projectOntoSegment(point, from, to);
    if (projected.distSq < bestDistance) {
      bestDistance = projected.distSq;
      bestProgress = cumulative + length * projected.t;
    }
    cumulative += length;
  }
  return bestProgress;
}

function resolveLine(snapshot: RideSnapshot): readonly GeoPoint[] {
  return snapshot.route.length >= 2 ? snapshot.route : snapshot.stops;
}

function findStopIndex(stops: readonly RideStop[], stopId: string | null | undefined): number {
  if (!stopId) {
    return -1;
  }
  return stops.findIndex((stop) => stop.stopId === stopId);
}

function findTimetableNextIndex(stops: readonly RideStop[], nowMs: number, floorIndex: number): number {
  for (let index = floorIndex; index < stops.length; index += 1) {
    if (Date.parse(stops[index].arrivalIso) >= nowMs) {
      return index;
    }
  }
  return stops.length;
}

function findVehicleNextIndex(snapshot: RideSnapshot, vehicle: GeoPoint, floorIndex: number): number {
  const line = resolveLine(snapshot);
  if (line.length < 2) {
    return floorIndex;
  }
  const vehicleProgress = progressAlongLine(line, vehicle);
  for (let index = floorIndex; index < snapshot.stops.length; index += 1) {
    const stopProgress = progressAlongLine(line, snapshot.stops[index]);
    if (stopProgress > vehicleProgress + PASS_EPSILON) {
      return index;
    }
  }
  return snapshot.stops.length;
}

function minutesUntilIso(iso: string, nowMs: number): number {
  return Math.max(0, Math.floor((Date.parse(iso) - nowMs) / 60_000));
}

function resolveExitUrgency(stopsRemaining: number): RideExitUrgency {
  if (stopsRemaining <= 0) {
    return "arrived";
  }
  if (stopsRemaining === 1) {
    return "exit-next";
  }
  if (stopsRemaining === 2) {
    return "approaching";
  }
  return "calm";
}

function buildExitSummary(
  stops: readonly RideStop[],
  exitIndex: number,
  nextStopIndex: number,
  nowMs: number,
): RideExitSummary | null {
  if (exitIndex < 0 || exitIndex >= stops.length) {
    return null;
  }
  const stop = stops[exitIndex];
  const stopsRemaining = exitIndex < nextStopIndex ? 0 : exitIndex - nextStopIndex + 1;
  const minutesRemaining = stopsRemaining === 0 ? 0 : minutesUntilIso(stop.arrivalIso, nowMs);
  return {
    minutesRemaining,
    stop,
    stopsRemaining,
    urgency: resolveExitUrgency(stopsRemaining),
  };
}

function classifyStopState(index: number, nextStopIndex: number, exitIndex: number): RideStopState {
  if (index < nextStopIndex) {
    return "past";
  }
  if (index === nextStopIndex) {
    return "next";
  }
  if (exitIndex >= 0 && index > exitIndex) {
    return "beyond-exit";
  }
  return "upcoming";
}

export function computeRideProgress(
  snapshot: RideSnapshot,
  nowMs: number,
  options: ComputeRideProgressOptions = {},
): RideProgress {
  const { stops, vehicle } = snapshot;
  const telemetry: RideTelemetry = vehicle ? "live" : "timetable";
  const boardedIndex = Math.max(0, findStopIndex(stops, options.boardedStopId));
  const nextStopIndex = vehicle
    ? findVehicleNextIndex(snapshot, vehicle, boardedIndex)
    : findTimetableNextIndex(stops, nowMs, boardedIndex);
  const status: RideStatus = nextStopIndex >= stops.length ? "arrived" : "active";
  const exitIndex = findStopIndex(stops, options.exitStopId);
  const nextStop = status === "active" ? stops[nextStopIndex] : null;

  return {
    exit: buildExitSummary(stops, exitIndex, nextStopIndex, nowMs),
    finalStop: stops[stops.length - 1] ?? null,
    nextMinutes: nextStop ? minutesUntilIso(nextStop.arrivalIso, nowMs) : null,
    nextStop,
    nextStopIndex,
    pastCount: Math.min(nextStopIndex, stops.length),
    status,
    stops: stops.map((stop, index) => ({
      isExit: index === exitIndex,
      minutesUntil: minutesUntilIso(stop.arrivalIso, nowMs),
      state: classifyStopState(index, nextStopIndex, exitIndex),
      stop,
    })),
    telemetry,
  };
}

export function frameRideRoute(snapshot: RideSnapshot): MapExtent | null {
  const points: GeoPoint[] = [
    ...(snapshot.route.length > 0 ? snapshot.route : snapshot.stops),
    ...(snapshot.vehicle ? [snapshot.vehicle] : []),
  ];
  if (points.length === 0) {
    return null;
  }

  let east = points[0].lon;
  let north = points[0].lat;
  let south = points[0].lat;
  let west = points[0].lon;
  for (const point of points) {
    east = Math.max(east, point.lon);
    north = Math.max(north, point.lat);
    south = Math.min(south, point.lat);
    west = Math.min(west, point.lon);
  }
  const padLat = Math.max((north - south) * 0.08, MIN_EXTENT_SPAN * 0.25);
  const padLon = Math.max((east - west) * 0.08, MIN_EXTENT_SPAN * 0.25);
  return {
    east: east + padLon,
    north: north + padLat,
    south: south - padLat,
    west: west - padLon,
  };
}
