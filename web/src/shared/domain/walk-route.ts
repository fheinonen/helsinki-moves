import type { GeoPoint } from "./vehicle-span.js";

export const WALK_UNAVAILABLE = "No walking route.";

export interface WalkRequest {
  readonly lat: number;
  readonly lon: number;
  readonly stopId: string;
}

export interface WalkRoute {
  readonly points: readonly [GeoPoint, GeoPoint, ...GeoPoint[]];
  readonly seconds: number;
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function pointInRange(point: GeoPoint): boolean {
  return inRange(point.lat, -90, 90) && inRange(point.lon, -180, 180);
}

function validSeconds(seconds: number): boolean {
  return Number.isFinite(seconds) && seconds >= 0;
}

export function toWalkRoute(points: readonly GeoPoint[], seconds: number): WalkRoute | null {
  const [first, second, ...rest] = points;
  if (!first || !second || !validSeconds(seconds) || points.some((point) => !pointInRange(point))) {
    return null;
  }
  return { points: [first, second, ...rest], seconds };
}

function segmentLength(start: GeoPoint, end: GeoPoint): number {
  const latitude = ((start.lat + end.lat) / 2) * (Math.PI / 180);
  const north = (end.lat - start.lat) * 111_320;
  const east = (end.lon - start.lon) * 111_320 * Math.cos(latitude);
  return Math.hypot(north, east);
}

function pointBetween(start: GeoPoint, end: GeoPoint, fraction: number): GeoPoint {
  return {
    lat: start.lat + (end.lat - start.lat) * fraction,
    lon: start.lon + (end.lon - start.lon) * fraction,
  };
}

export function walkMidpoint(points: readonly GeoPoint[]): GeoPoint {
  const lengths = points.slice(1).map((point, index) => segmentLength(points[index], point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total === 0) {
    return points[0];
  }
  let remaining = total / 2;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index];
    if (remaining <= length || index === lengths.length - 1) {
      const fraction = length === 0 ? 0 : remaining / length;
      return pointBetween(points[index], points[index + 1], fraction);
    }
    remaining -= length;
  }
  return points[0];
}

export function formatWalkMinutes(seconds: number): string {
  const minutes = seconds <= 0 ? 0 : Math.ceil(seconds / 60);
  return `${minutes} min`;
}

export function canMakeDeparture(input: { departureMs: number; now: number; seconds: number }): boolean {
  if (!Number.isFinite(input.departureMs)) {
    return false;
  }
  return input.departureMs - input.now >= input.seconds * 1000;
}

function readPoint(value: unknown): GeoPoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as { lat?: unknown; lon?: unknown };
  if (typeof record.lat !== "number" || typeof record.lon !== "number") {
    return null;
  }
  return { lat: record.lat, lon: record.lon };
}

export function parseWalkRoute(body: unknown): WalkRoute | null {
  if (!body || typeof body !== "object") {
    return null;
  }
  const record = body as { points?: unknown; seconds?: unknown };
  if (!Array.isArray(record.points) || typeof record.seconds !== "number") {
    return null;
  }
  const parsed: GeoPoint[] = [];
  for (const point of record.points) {
    const next = readPoint(point);
    if (!next) {
      return null;
    }
    parsed.push(next);
  }
  return toWalkRoute(parsed, record.seconds);
}
