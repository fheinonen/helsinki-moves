import { Hono } from "hono";
import { DeparturesService } from "../services/digitransit/departures-service.js";
import { validateDeparturesRequest } from "../validation/departures-schema.js";
import type {
  DeparturesErrorResponse,
  DeparturesSuccessResponse,
} from "../../shared/contracts/departures-contract.js";
import type { DestinationCorrectionService } from "../services/digitransit/destination-correction-service.js";
import type { DigitransitService } from "../services/digitransit/types.js";

interface DeparturesRouteOptions {
  destinationCorrectionService?: DestinationCorrectionService;
  digitransitService: DigitransitService;
}

export function registerDeparturesRoute(app: Hono, options: DeparturesRouteOptions): void {
  const departuresService = new DeparturesService(
    options.digitransitService,
    options.destinationCorrectionService
  );

  app.get("/api/v1/departures", async (context) => {
    const validationResult = validateDeparturesRequest(new URL(context.req.url).searchParams);
    if (!validationResult.ok) {
      const payload: DeparturesErrorResponse = { error: validationResult.error };
      return context.json(payload, 400);
    }

    const payload: DeparturesSuccessResponse = await departuresService.execute(validationResult.value);
    return context.json(payload, 200);
  });
}
