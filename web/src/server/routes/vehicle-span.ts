import { streamSSE } from "hono/streaming";
import type { Hono } from "hono";
import type { GeoPoint } from "../../shared/domain/vehicle-span.js";
import { createLiveVehicleReader } from "../services/hsl-realtime/vehicle-feed.js";
import { readVehicleSpan } from "../services/vehicle-span/stream.js";
import type { DigitransitService } from "../services/digitransit/types.js";

const SPAN_POLL_MS = 3000;

interface VehicleSpanRouteOptions {
  digitransitService: DigitransitService;
  liveVehicleFetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

async function graphPoint(
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

async function readVehicleFix(
  readGraph: ((tripId: string) => Promise<GeoPoint | null>) | undefined,
  readLive: (tripId: string) => Promise<GeoPoint | null>,
  tripId: string,
): Promise<GeoPoint | null> {
  return (await graphPoint(readGraph, tripId)) ?? readLive(tripId);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function registerVehicleSpanRoute(app: Hono, options: VehicleSpanRouteOptions): void {
  const { digitransitService, sleep } = options;
  const readLive = createLiveVehicleReader({
    fetchImpl: options.liveVehicleFetch,
    now: options.now,
  });

  app.get("/api/v1/vehicle-span", (context) => {
    const readStop = digitransitService.getStopPoint;
    const readShape = digitransitService.getTripShape;
    const readVehicle = digitransitService.getVehicleFix;
    if (!readStop || !readVehicle) {
      return context.json({ error: "Vehicle position is not available." }, 404);
    }

    const url = new URL(context.req.url);
    const stopId = url.searchParams.get("stopId")?.trim() || "";
    const tripId = url.searchParams.get("tripId")?.trim() || "";
    if (!stopId || !tripId) {
      return context.json({ error: "Vehicle position is not available." }, 400);
    }

    let active = true;
    let polls = 0;
    const signal = context.req.raw.signal;
    return streamSSE(context, async (stream) => {
      const events = readVehicleSpan({
        intervalMs: SPAN_POLL_MS,
        isActive: () => active && !signal.aborted,
        readRoute: () => (readShape ? readShape(tripId) : Promise.resolve([])),
        readStop: () => readStop(stopId),
        readVehicle: () => readVehicleFix(readVehicle, readLive, tripId),
        sleep: async (ms) => {
          if (sleep) {
            polls += 1;
            if (polls > 1) {
              active = false;
            }
            await sleep(ms);
            return;
          }
          await delay(ms);
        },
      });
      const first = await events.next();
      if (!first.done) {
        await stream.writeSSE({
          data: JSON.stringify(first.value),
          event: first.value.type,
          retry: SPAN_POLL_MS,
        });
      }
      await events.return(undefined);
    });
  });
}
