import "@client/styles/main.css";
import { createAppStore } from "@client/app/app-store";
import { createAppController } from "@client/app/app-controller";
import { createBrowserVoiceRecorder } from "@client/features/voice/browser-voice-recorder";
import { detectVoiceCapability } from "@client/features/voice/voice-capability";
import { createBrowserVoiceTypedFallbackPrompt } from "@client/features/voice/voice-typed-fallback";
import { bootstrapApp } from "@client/app/bootstrap";
import { createBrowserDeparturesClient } from "@client/services/departures-client";
import { createBrowserGeocodeClient } from "@client/services/geocode-client";
import { createBrowserLocationService } from "@client/services/location-service";
import { createBrowserSpeechTranscribeClient } from "@client/services/speech-transcribe-client";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error('Could not find app root element "#app"');
}

const store = createAppStore();
const voiceCapability = detectVoiceCapability({
  mediaDevices: navigator.mediaDevices,
  MediaRecorderCtor: window.MediaRecorder,
});
const controller = createAppController({
  departuresClient: createBrowserDeparturesClient({
    fetchImpl: window.fetch.bind(window),
  }),
  geocodeClient: createBrowserGeocodeClient({
    fetchImpl: window.fetch.bind(window),
  }),
  locationService: createBrowserLocationService({
    geolocation: navigator.geolocation,
  }),
  speechTranscribeClient: voiceCapability.available
    ? createBrowserSpeechTranscribeClient({
        fetchImpl: window.fetch.bind(window),
      })
    : null,
  store,
  voiceAvailability: voiceCapability.available ? "available" : "unavailable",
  voiceRecorder: voiceCapability.available
    ? createBrowserVoiceRecorder({
        MediaRecorderCtor: window.MediaRecorder,
        mediaDevices: navigator.mediaDevices,
      })
    : null,
  voiceTypedFallbackPrompt: createBrowserVoiceTypedFallbackPrompt({
    promptImpl: typeof window.prompt === "function" ? window.prompt.bind(window) : null,
  }),
});

bootstrapApp({
  controller,
  documentRef: document,
  historyRef: window.history,
  locationRef: window.location,
  root,
  storage: window.localStorage,
  store,
});

controller.initializeVoice();
void controller.refreshNearbyDepartures();
