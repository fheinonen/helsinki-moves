import { Hono } from "hono";
import {
  createTravelIntentService,
  TravelIntentError,
  type TravelIntentService,
} from "../services/travel-intent/travel-intent-service.js";
import type {
  TravelIntentErrorResponse,
  TravelIntentSuccessResponse,
} from "../../shared/contracts/travel-intent-contract.js";

interface TravelIntentRouteOptions {
  travelIntentService?: TravelIntentService;
}

function getPrompt(value: unknown): string {
  return String(value || "").trim();
}

function hasServerGoogleApiKey(): boolean {
  return Boolean(
    getPrompt(process.env.GOOGLE_GENERATIVE_AI_API_KEY) || getPrompt(process.env.GEMINI_API_KEY)
  );
}

export function registerTravelIntentRoute(
  app: Hono,
  options: TravelIntentRouteOptions = {}
): void {
  const travelIntentService = options.travelIntentService || createTravelIntentService();
  const requiresServerApiKey = !options.travelIntentService;

  app.post("/api/v1/travel-intent", async (context) => {
    const requestBody = await context.req.json().catch(() => null);
    const prompt = getPrompt(requestBody?.prompt);
    if (!prompt) {
      const payload: TravelIntentErrorResponse = { error: "prompt is required" };
      return context.json(payload, 400);
    }
    if (prompt.length > 1_500) {
      const payload: TravelIntentErrorResponse = { error: "prompt is too long" };
      return context.json(payload, 400);
    }
    if (requiresServerApiKey && !hasServerGoogleApiKey()) {
      const payload: TravelIntentErrorResponse = { error: "api key is required" };
      return context.json(payload, 400);
    }

    try {
      const payload: TravelIntentSuccessResponse = await travelIntentService.parse({ prompt });
      return context.json(payload, 200);
    } catch (error) {
      if (error instanceof TravelIntentError) {
        const payload: TravelIntentErrorResponse = { error: error.message };
        return context.json(payload, error.status as 400 | 401 | 429 | 500);
      }
      const payload: TravelIntentErrorResponse = { error: "Could not parse travel intent" };
      return context.json(payload, 500);
    }
  });
}
