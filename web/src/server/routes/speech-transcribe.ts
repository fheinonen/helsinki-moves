import { Hono } from "hono";
import { validateSpeechTranscribePayload } from "../validation/speech-schema.js";
import {
  createSpeechTranscriptionService,
  type SpeechTranscriptionService,
} from "../services/voice/transcribe-service.js";
import type {
  SpeechTranscribeErrorResponse,
  SpeechTranscribeSuccessResponse,
} from "../../shared/contracts/speech-contract.js";

interface SpeechTranscribeRouteOptions {
  speechTranscriptionService?: SpeechTranscriptionService | null;
}

export function registerSpeechTranscribeRoute(
  app: Hono,
  options: SpeechTranscribeRouteOptions = {}
): void {
  const speechTranscriptionService =
    options.speechTranscriptionService === undefined
      ? createSpeechTranscriptionService()
      : options.speechTranscriptionService;

  app.post("/api/v1/speech-transcribe", async (context) => {
    if (!speechTranscriptionService) {
      const payload: SpeechTranscribeErrorResponse = {
        error: "Speech transcription is not configured",
      };
      return context.json(payload, 503);
    }

    const requestPayload = await context.req.json().catch(() => null);
    const validationResult = validateSpeechTranscribePayload(requestPayload);
    if (!validationResult.ok) {
      const payload: SpeechTranscribeErrorResponse = {
        error: validationResult.error,
      };
      return context.json(payload, 400);
    }

    try {
      const transcript = await speechTranscriptionService.transcribe(validationResult.value);
      if (!transcript) {
        const payload: SpeechTranscribeErrorResponse = {
          error: "No speech detected",
        };
        return context.json(payload, 422);
      }

      const payload: SpeechTranscribeSuccessResponse = {
        transcript,
      };
      return context.json(payload, 200);
    } catch {
      const payload: SpeechTranscribeErrorResponse = {
        error: "Could not transcribe speech",
      };
      return context.json(payload, 502);
    }
  });
}
