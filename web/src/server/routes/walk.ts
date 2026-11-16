import type { Hono } from "hono";
import { WALK_UNAVAILABLE, type WalkRequest } from "../../shared/domain/walk-route.js";
import type { DigitransitService } from "../services/digitransit/types.js";

interface RegisterWalkRouteOptions {
  digitransitService: DigitransitService;
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function readWalkRequest(url: URL): WalkRequest | null {
  const stopId = url.searchParams.get("stopId")?.trim() ?? "";
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  if (!stopId || !inRange(lat, -90, 90) || !inRange(lon, -180, 180)) {
    return null;
  }
  return { lat, lon, stopId };
}

export function registerWalkRoute(app: Hono, options: RegisterWalkRouteOptions): void {
  app.get("/api/v1/walk", async (context) => {
    const request = readWalkRequest(new URL(context.req.url));
    if (!request) {
      return context.json({ error: WALK_UNAVAILABLE }, 400);
    }
    const route = await options.digitransitService.planWalk?.(
      { lat: request.lat, lon: request.lon },
      request.stopId,
    );
    if (!route) {
      return context.json({ error: WALK_UNAVAILABLE }, 404);
    }
    return context.json(route, 200);
  });
}
