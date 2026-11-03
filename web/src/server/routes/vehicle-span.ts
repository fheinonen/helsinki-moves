import { streamSSE } from "hono/streaming";
import type { Hono } from "hono";
import { readVehicleSpan } from "../services/vehicle-span/stream.js";
import type { DigitransitService } from "../services/digitransit/types.js";

const SPAN_POLL_MS = 3000;

interface VehicleSpanRouteOptions {
  digitransitService: DigitransitService;
  sleep?: (ms: number) => Promise<void>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function registerVehicleSpanRoute(app: Hono, options: VehicleSpanRouteOptions): void {
  const { digitransitService, sleep } = options;

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
    const signal = context.req.raw.signal;
    return streamSSE(context, async (stream) => {
      const events = readVehicleSpan({
        intervalMs: SPAN_POLL_MS,
        isActive: () => active && !signal.aborted,
        readRoute: () => (readShape ? readShape(tripId) : Promise.resolve([])),
        readStop: () => readStop(stopId),
        readVehicle: () => readVehicle(tripId),
        sleep: async (ms) => {
          if (sleep) {
            active = false;
            await sleep(ms);
            return;
          }
          await delay(ms);
        },
      });
      for await (const event of events) {
        await stream.writeSSE({ data: JSON.stringify(event), event: event.type });
      }
    });
  });
}
