import { Hono } from "hono";
import { validateAlertsRequest } from "../validation/alerts-schema.js";
import type {
  AlertsErrorResponse,
  AlertsSuccessResponse,
} from "../../shared/contracts/alerts-contract.js";
import type { DigitransitService } from "../services/digitransit/types.js";

interface AlertsRouteOptions {
  digitransitService: DigitransitService;
}

export function registerAlertsRoute(app: Hono, options: AlertsRouteOptions): void {
  app.get("/api/v1/alerts", async (context) => {
    const validationResult = validateAlertsRequest(new URL(context.req.url).searchParams);
    if (!validationResult.ok) {
      const payload: AlertsErrorResponse = { error: validationResult.error };
      return context.json(payload, 400);
    }

    const alerts = (await options.digitransitService.getAlerts?.(validationResult.value)) || [];
    const payload: AlertsSuccessResponse = { alerts };
    return context.json(payload, 200);
  });
}
