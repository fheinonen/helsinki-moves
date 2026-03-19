import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import type { Mode } from "../../../shared/domain/mode.js";

const GOOGLE_MODEL_ID = "gemini-3.1-flash-lite-preview";

const destinationCorrectionSchema = z.object({
  suggestions: z
    .array(
      z.object({
        candidate: z.string().min(1),
        confidence: z.number().min(0).max(1),
      })
    )
    .max(3),
});

export interface DestinationCorrectionInput {
  candidates: string[];
  destination: string;
  mode: Mode;
  nearbyStopNames: string[];
}

export interface DestinationCorrectionSuggestion {
  candidate: string;
  confidence: number;
}

export interface DestinationCorrectionService {
  suggest(input: DestinationCorrectionInput): Promise<DestinationCorrectionSuggestion[]>;
}

function resolveGoogleApiKey(): string | undefined {
  const apiKey = String(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || ""
  ).trim();
  return apiKey || undefined;
}

function buildPrompt(input: DestinationCorrectionInput): string {
  return [
    `User destination: ${input.destination}`,
    `Mode: ${input.mode}`,
    `Nearby stops: ${input.nearbyStopNames.join(", ") || "unknown"}`,
    "",
    "Choose only from these live destination candidates:",
    JSON.stringify(input.candidates, null, 2),
    "",
    "Return up to 3 ranked suggestions from the candidate list.",
    "Do not invent new destinations.",
    "Use high confidence only when the candidate is a very plausible correction.",
  ].join("\n");
}

export function createDestinationCorrectionService(): DestinationCorrectionService {
  return {
    async suggest(input) {
      const apiKey = resolveGoogleApiKey();
      if (!apiKey || input.candidates.length === 0) {
        return [];
      }

      const google = createGoogleGenerativeAI({ apiKey });
      const result = await generateObject({
        model: google(GOOGLE_MODEL_ID),
        output: "object",
        prompt: buildPrompt(input),
        schema: destinationCorrectionSchema,
        system:
          "You resolve transit destination phrases to the closest matching live candidate destination. Choose only from supplied candidates.",
      });

      const validCandidates = new Set(input.candidates);
      return result.object.suggestions.filter((suggestion) => validCandidates.has(suggestion.candidate));
    },
  };
}
