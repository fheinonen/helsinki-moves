import type { GeoPoint } from "./vehicle-span.js";

export const WALK_UNAVAILABLE = "No walking route.";

export interface WalkRequest {
  readonly lat: number;
  readonly lon: number;
  readonly stopId: string;
}

export interface WalkRoute {
  readonly points: readonly [GeoPoint, GeoPoint, ...GeoPoint[]];
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function pointInRange(point: GeoPoint): boolean {
  return inRange(point.lat, -90, 90) && inRange(point.lon, -180, 180);
}

export function toWalkRoute(points: readonly GeoPoint[]): WalkRoute | null {
  const [first, second, ...rest] = points;
  if (!first || !second || points.some((point) => !pointInRange(point))) {
    return null;
  }
  return { points: [first, second, ...rest] };
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
  const points = (body as { points?: unknown }).points;
  if (!Array.isArray(points)) {
    return null;
  }
  const parsed: GeoPoint[] = [];
  for (const point of points) {
    const next = readPoint(point);
    if (!next) {
      return null;
    }
    parsed.push(next);
  }
  return toWalkRoute(parsed);
}
