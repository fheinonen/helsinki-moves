import { Hono } from "hono";
import { validateRoutesRequest } from "../validation/routes-schema.js";
import type {
  RoutePlanErrorResponse,
  RoutePlanSuccessResponse,
} from "../../shared/contracts/routes-contract.js";
import type { DigitransitService } from "../services/digitransit/types.js";

interface RoutesRouteOptions {
  digitransitService: DigitransitService;
}

export function registerRoutesRoute(app: Hono, options: RoutesRouteOptions): void {
  app.get("/api/v1/routes", async (context) => {
    const validationResult = validateRoutesRequest(new URL(context.req.url).searchParams);
    if (!validationResult.ok) {
      const payload: RoutePlanErrorResponse = { error: validationResult.error };
      return context.json(payload, 400);
    }

    const itineraries = await options.digitransitService.getRoutes(validationResult.value);
    const payload: RoutePlanSuccessResponse = {
      itineraries,
      policy: validationResult.value.policy,
    };
    return context.json(payload, 200);
  });
}
