import { Hono } from "hono";
import { DeparturesService } from "../services/digitransit/departures-service.js";
import { validateDeparturesRequest } from "../validation/departures-schema.js";
import type {
  DeparturesErrorResponse,
  DeparturesSuccessResponse,
} from "../../shared/contracts/departures-contract.js";
import type { DigitransitService } from "../services/digitransit/types.js";

interface DeparturesRouteOptions {
  digitransitService: DigitransitService;
  now?: () => number;
}

export function registerDeparturesRoute(app: Hono, options: DeparturesRouteOptions): void {
  const departuresService = new DeparturesService(options.digitransitService, options.now);

  app.get("/api/v1/departures", async (context) => {
    const validationResult = validateDeparturesRequest(new URL(context.req.url).searchParams);
    if (!validationResult.ok) {
      const payload: DeparturesErrorResponse = { error: validationResult.error };
      return context.json(payload, 400);
    }

    const parsed = validationResult.value;
    switch (parsed.kind) {
      case "glance": {
        const payload: DeparturesSuccessResponse = await departuresService.execute(parsed.request);
        return context.json(payload, 200);
      }
      case "later": {
        const payload = await departuresService.executeLater(parsed.request, parsed.after);
        return context.json(payload, 200);
      }
      default: {
        const unreachable: never = parsed;
        return unreachable;
      }
    }
  });
}
