import { Hono } from "hono";
import { registerAlertsRoute } from "./routes/alerts.js";
import { registerClientErrorRoute } from "./routes/client-error.js";
import { registerDeparturesRoute } from "./routes/departures.js";
import { registerGenerateUiRoute } from "./routes/generate-ui.js";
import { registerGeocodeRoute } from "./routes/geocode.js";
import { registerRoutesRoute } from "./routes/routes.js";
import { registerSpeechTranscribeRoute } from "./routes/speech-transcribe.js";
import { registerTravelIntentRoute } from "./routes/travel-intent.js";
import { createDigitransitService } from "./services/digitransit/client.js";
import { createDestinationCorrectionService } from "./services/digitransit/destination-correction-service.js";
import type { DestinationCorrectionService } from "./services/digitransit/destination-correction-service.js";
import type { DigitransitService } from "./services/digitransit/types.js";
import type { GenerateUiService } from "./services/generate-ui/generate-ui-service.js";
import type { GeocodeService } from "./services/geocode/geocode-service.js";
import type { TravelIntentService } from "./services/travel-intent/travel-intent-service.js";
import type { SpeechTranscriptionService } from "./services/voice/transcribe-service.js";
import type { ClientErrorPayload } from "../shared/contracts/client-error-contract.js";

interface AppOptions {
  destinationCorrectionService?: DestinationCorrectionService;
  digitransitService?: DigitransitService;
  generateUiService?: GenerateUiService;
  geocodeService?: GeocodeService;
  logClientPayload?: (payload: ClientErrorPayload) => void;
  speechTranscriptionService?: SpeechTranscriptionService | null;
  travelIntentService?: TravelIntentService;
}

export function createApp(options: AppOptions = {}): Hono {
  const app = new Hono();
  const digitransitService = options.digitransitService || createDigitransitService();
  const destinationCorrectionService =
    options.destinationCorrectionService || createDestinationCorrectionService();

  app.get("/api/health", (context) => context.json({ ok: true }, 200));

  registerAlertsRoute(app, { digitransitService });
  registerDeparturesRoute(app, { destinationCorrectionService, digitransitService });
  registerRoutesRoute(app, { digitransitService });
  registerGenerateUiRoute(app, {
    generateUiService: options.generateUiService,
  });
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
  registerTravelIntentRoute(app, {
    travelIntentService: options.travelIntentService,
  });

  app.notFound((context) => context.json({ error: "not found" }, 404));
  return app;
}

export const app = createApp();
