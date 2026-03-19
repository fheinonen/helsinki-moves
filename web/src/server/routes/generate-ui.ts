import { Hono } from "hono";
import type { Spec } from "@json-render/core";
import {
  createGenerateUiService,
  GenerateUiError,
  type GenerateUiService,
} from "../services/generate-ui/generate-ui-service.js";

interface GenerateUiRouteOptions {
  generateUiService?: GenerateUiService;
}

function getPrompt(value: unknown): string {
  return String(value || "").trim();
}

function hasServerGoogleApiKey(): boolean {
  return Boolean(
    getPrompt(process.env.GOOGLE_GENERATIVE_AI_API_KEY) || getPrompt(process.env.GEMINI_API_KEY)
  );
}

export function registerGenerateUiRoute(
  app: Hono,
  options: GenerateUiRouteOptions = {}
): void {
  const generateUiService = options.generateUiService || createGenerateUiService();

  app.post("/api/v1/generate-ui", async (context) => {
    const requestBody = await context.req.json().catch(() => null);
    const prompt = getPrompt(requestBody?.prompt);
    if (!prompt) {
      return context.json({ error: "prompt is required" }, 400);
    }
    if (prompt.length > 1_500) {
      return context.json({ error: "prompt is too long" }, 400);
    }

    const apiKey = getPrompt(context.req.header("x-api-key"));
    if (!apiKey && !hasServerGoogleApiKey()) {
      return context.json({ error: "api key is required" }, 400);
    }

    try {
      const result = await generateUiService.generate({
        apiKey,
        currentTree: (requestBody?.currentTree as Spec | undefined) || undefined,
        prompt,
      });
      return result.toTextStreamResponse();
    } catch (error) {
      if (error instanceof GenerateUiError) {
        return context.json({ error: error.message }, error.status as 400 | 401 | 429 | 500);
      }

      return context.json({ error: "Could not generate a board" }, 500);
    }
  });
}
