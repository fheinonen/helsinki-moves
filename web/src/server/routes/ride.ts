import type { Hono } from "hono";
import type { RideSnapshot } from "../../shared/domain/ride.js";
import type { GeoPoint } from "../../shared/domain/vehicle-span.js";
import { createLiveVehicleReader } from "../services/hsl-realtime/vehicle-feed.js";
import type { DigitransitService } from "../services/digitransit/types.js";

interface RideRouteOptions {
  digitransitService: DigitransitService;
  liveVehicleFetch?: typeof fetch;
  now?: () => number;
}

async function readGraphVehicle(
  readGraph: ((tripId: string) => Promise<GeoPoint | null>) | undefined,
  tripId: string,
): Promise<GeoPoint | null> {
  if (!readGraph) {
    return null;
  }
  try {
    return await readGraph(tripId);
  } catch {
    return null;
  }
}

export function registerRideRoute(app: Hono, options: RideRouteOptions): void {
  const { digitransitService } = options;
  const readLive = createLiveVehicleReader({
    fetchImpl: options.liveVehicleFetch,
    now: options.now,
  });

  app.get("/api/v1/ride", async (context) => {
    const readRide = digitransitService.getTripRide;
    if (!readRide) {
      return context.json({ error: "Ride tracking is not available." }, 404);
    }

    const url = new URL(context.req.url);
    const tripId = url.searchParams.get("tripId")?.trim() || "";
    if (!tripId) {
      return context.json({ error: "Missing tripId." }, 400);
    }

    const ride = await readRide(tripId);
    if (!ride) {
      return context.json({ error: "Trip not found." }, 404);
    }

    const vehicle =
      (await readGraphVehicle(digitransitService.getVehicleFix, tripId)) ??
      (await readLive(tripId));
    const snapshot: RideSnapshot = { ...ride, vehicle };
    context.header("Cache-Control", "no-store");
    return context.json(snapshot, 200);
  });
}
