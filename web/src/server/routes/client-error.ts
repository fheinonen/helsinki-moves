import { Hono } from "hono";
import type {
  ClientErrorAcceptedResponse,
  ClientErrorPayload,
  ClientErrorRejectedResponse,
} from "../../shared/contracts/client-error-contract.js";
import { sanitizeClientErrorPayload } from "../services/telemetry/sanitize-client-error.js";
import { validateClientErrorPayload } from "../validation/client-error-schema.js";

interface ClientErrorRouteOptions {
  logPayload?: (payload: ClientErrorPayload) => void;
}

export function registerClientErrorRoute(app: Hono, options: ClientErrorRouteOptions = {}): void {
  app.post("/api/v1/client-error", async (context) => {
    let rawPayload: unknown;
    try {
      rawPayload = await context.req.json();
    } catch {
      const response: ClientErrorRejectedResponse = { error: "invalid payload" };
      return context.json(response, 400);
    }

    const validationResult = validateClientErrorPayload(rawPayload);
    if (!validationResult.ok) {
      const response: ClientErrorRejectedResponse = { error: validationResult.error };
      return context.json(response, 400);
    }

    const payload = sanitizeClientErrorPayload(validationResult.value as ClientErrorPayload);
    options.logPayload?.(payload);

    const response: ClientErrorAcceptedResponse = { accepted: true };
    return context.json(response, 202);
  });
}
