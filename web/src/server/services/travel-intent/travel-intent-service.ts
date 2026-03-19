import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject, APICallError } from "ai";
import { z } from "zod";
import type {
  TravelIntentSuccessResponse,
} from "../../../shared/contracts/travel-intent-contract.js";

const GOOGLE_MODEL_ID = "gemini-3.1-flash-lite-preview";

const travelIntentSchema = z.object({
  locationQuery: z.string().nullable(),
  requests: z.array(
    z.object({
      destinations: z.array(z.string()),
      lines: z.array(z.string()),
      mode: z.enum(["TRAM", "BUS", "RAIL", "METRO"]),
    })
  ),
});

export class TravelIntentError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export interface TravelIntentService {
  parse(input: { prompt: string }): Promise<TravelIntentSuccessResponse>;
}

function resolveGoogleApiKey(): string | undefined {
  const apiKey = String(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || ""
  ).trim();
  return apiKey || undefined;
}

function mapProviderError(error: unknown): TravelIntentError {
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401 || error.statusCode === 403) {
      return new TravelIntentError("Invalid Google API key", 401);
    }
    if (error.statusCode === 429) {
      return new TravelIntentError("Google rate limit reached", 429);
    }
    if (error.statusCode === 400) {
      return new TravelIntentError("Invalid travel intent request", 400);
    }
  }
  return new TravelIntentError("Could not parse travel intent", 500);
}

export function createTravelIntentService(): TravelIntentService {
  return {
    async parse({ prompt }) {
      try {
        const google = createGoogleGenerativeAI({
          apiKey: resolveGoogleApiKey(),
        });
        const result = await generateObject({
          model: google(GOOGLE_MODEL_ID),
          output: "object",
          prompt: [
            `User prompt: ${prompt.trim()}`,
            "",
            "Extract transit travel intent for Helsinki transit requests.",
            "Return structured requests with mode, line numbers if explicit, destination names, and explicit origin/location query if provided.",
            'Interpret natural phrasings like "go to Tripla by bus" as a BUS request to destination "Tripla".',
            "Do not invent line numbers or origins.",
          ].join("\n"),
          schema: travelIntentSchema,
          system:
            "You extract structured transit intent from user prompts. Return only the schema fields and keep text concise.",
        });
        return {
          locationQuery: result.object.locationQuery,
          requests: result.object.requests.map((request) => ({
            destinations: request.destinations.map((value) => value.trim()).filter(Boolean),
            lines: request.lines.map((value) => value.trim()).filter(Boolean),
            mode: request.mode,
          })),
        };
      } catch (error) {
        throw mapProviderError(error);
      }
    },
  };
}
