import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { APICallError, streamText } from "ai";
import type { Spec } from "@json-render/core";
import { createRouteCatalog } from "../../../client/create/create-route-catalog.js";
import { defaultSpec } from "../../../client/create/default-spec.js";

const GOOGLE_MODEL_ID = "gemini-3.1-flash-lite-preview";

const SAMPLE_STATE = {
  departures: [
    {
      destination: "Lasipalatsi",
      id: "7-2026-03-21T10:05:00.000Z",
      line: "7",
      minutes: 5,
      mode: "TRAM",
    },
  ],
  stopCode: "H0401",
  stopName: "Rautatientori",
};

export class GenerateUiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export interface GenerateUiResult {
  toTextStreamResponse(init?: ResponseInit): Response;
}

export interface GenerateUiService {
  generate(input: { apiKey?: string; currentTree?: Spec; prompt: string }): Promise<GenerateUiResult>;
}

export function buildGenerateUiSystemPrompt(): string {
  return createRouteCatalog.prompt({
    customRules: [
      "Do not add a global StopHeader. Mixed-mode create boards use mode group headers and row-level stop labels instead.",
      'Only place DepartureRow inside a repeat with statePath "/departures" and bind its props with "$item" references.',
      'Preserve the mode group header inside the /departures repeat and bind it with "$item" references.',
      'Keep the default board root "board" unless the user explicitly asks for a different root id.',
      'When editing the current board, omit changes to "root" unless it must change. Never blank the root.',
      "Do not remove the departure list repeat or break the live departures state wiring.",
      "Do not return an empty patch. Change at least one field when the user asks for a different board.",
      "Prefer compact layouts that preserve the live departures runtime state.",
    ],
    editModes: ["patch"],
    mode: "standalone",
    system: "Generate a json-render patch stream for the /create transit board.",
  });
}

export function buildGenerateUiUserPrompt(prompt: string, currentTree: Spec = defaultSpec): string {
  return [
    `User request: ${prompt.trim()}`,
    "",
    "Current UI state:",
    JSON.stringify(currentTree, null, 2),
    "",
    "Available runtime state:",
    JSON.stringify(SAMPLE_STATE, null, 2),
    "",
    'Returning an empty patch is invalid. Emit JSONL patch lines only.',
    'At minimum, update "/elements/board/props/title" to a concise title derived from the user request.',
    'Example minimum valid patch line: {"op":"replace","path":"/elements/board/props/title","value":"Tram 6, 2 and Bus 67"}',
  ].join("\n");
}

function mapProviderError(error: unknown): GenerateUiError {
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401 || error.statusCode === 403) {
      return new GenerateUiError("Invalid Google API key", 401);
    }
    if (error.statusCode === 429) {
      return new GenerateUiError("Google rate limit reached", 429);
    }
    if (error.statusCode === 400) {
      return new GenerateUiError("Invalid generate-ui request", 400);
    }
  }

  return new GenerateUiError("Could not generate a board", 500);
}

function resolveGoogleApiKey(explicitApiKey: string | undefined): string | undefined {
  const apiKey = String(
    explicitApiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || ""
  ).trim();
  return apiKey || undefined;
}

export function createGenerateUiService(): GenerateUiService {
  return {
    async generate({ apiKey, currentTree, prompt }) {
      try {
        const google = createGoogleGenerativeAI({
          apiKey: resolveGoogleApiKey(apiKey),
        });

        return streamText({
          model: google(GOOGLE_MODEL_ID),
          prompt: buildGenerateUiUserPrompt(prompt, currentTree || defaultSpec),
          system: buildGenerateUiSystemPrompt(),
        });
      } catch (error) {
        throw mapProviderError(error);
      }
    },
  };
}
