import { Hono } from "hono";
import { registerClientErrorRoute } from "./routes/client-error.js";
import { registerDeparturesRoute } from "./routes/departures.js";
import { registerGeocodeRoute } from "./routes/geocode.js";
import { registerSpeechTranscribeRoute } from "./routes/speech-transcribe.js";
import { createDigitransitService } from "./services/digitransit/client.js";
import type { DigitransitService } from "./services/digitransit/types.js";
import type { GeocodeService } from "./services/geocode/geocode-service.js";
import type { SpeechTranscriptionService } from "./services/voice/transcribe-service.js";
import type { ClientErrorPayload } from "../shared/contracts/client-error-contract.js";

interface AppOptions {
  digitransitService?: DigitransitService;
  geocodeService?: GeocodeService;
  logClientPayload?: (payload: ClientErrorPayload) => void;
  speechTranscriptionService?: SpeechTranscriptionService | null;
}

export function createApp(options: AppOptions = {}): Hono {
  const app = new Hono();
  const digitransitService = options.digitransitService || createDigitransitService();

  app.get("/api/health", (context) => context.json({ ok: true }, 200));

  registerDeparturesRoute(app, { digitransitService });
  registerClientErrorRoute(app, {
    logPayload: options.logClientPayload,
  });
  registerGeocodeRoute(app, {
    digitransitService,
    geocodeService: options.geocodeService,
  });
  registerSpeechTranscribeRoute(app, {
    speechTranscriptionService: options.speechTranscriptionService,
  });

  app.notFound((context) => context.json({ error: "not found" }, 404));
  return app;
}

export const app = createApp();
