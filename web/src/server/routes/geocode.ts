import { Hono } from "hono";
import type {
  GeocodeErrorResponse,
  GeocodeSuccessResponse,
} from "../../shared/contracts/geocode-contract.js";
import { validateGeocodeRequest } from "../validation/geocode-schema.js";
import {
  createGeocodeService,
  type GeocodeService,
} from "../services/geocode/geocode-service.js";
import type { DigitransitService } from "../services/digitransit/types.js";

interface GeocodeRouteOptions {
  digitransitService: DigitransitService;
  geocodeService?: GeocodeService;
}

export function registerGeocodeRoute(app: Hono, options: GeocodeRouteOptions): void {
  const geocodeService =
    options.geocodeService || createGeocodeService({ digitransitService: options.digitransitService });

  app.get("/api/v1/geocode", async (context) => {
    const validationResult = validateGeocodeRequest(new URL(context.req.url).searchParams);
    if (!validationResult.ok) {
      const response: GeocodeErrorResponse = { error: validationResult.error };
      return context.json(response, 400);
    }

    try {
      const response: GeocodeSuccessResponse = await geocodeService.resolve(validationResult.value);
      return context.json(response, 200);
    } catch {
      const response: GeocodeErrorResponse = {
        error: "Could not approximate location. Please try again.",
      };
      return context.json(response, 500);
    }
  });
}
