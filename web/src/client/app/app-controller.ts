import type { AppStore } from "@client/app/app-store";
import type { DeparturesClient } from "@client/services/departures-client";
import {
  getSoonestMatchingDepartureMs,
  hasMatchingLineDeparture,
  parseVoiceLineIntent,
  normalizeVoiceLineToken,
  type VoiceLineIntent,
} from "@client/features/voice/voice-line-intent";
import type { GeocodeClient } from "@client/services/geocode-client";
import type { LocationService } from "@client/services/location-service";
import type { SpeechTranscribeClient } from "@client/services/speech-transcribe-client";
import type { VoiceRecorder } from "@client/features/voice/browser-voice-recorder";
import type { VoiceAvailability } from "@client/features/voice/voice-capability";
import type { VoiceTypedFallbackPrompt } from "@client/features/voice/voice-typed-fallback";
import type { GeocodeLocation } from "@shared/contracts/geocode-contract";
import type { Mode } from "@shared/domain/mode";

interface CreateAppControllerOptions {
  departuresClient: DeparturesClient;
  geocodeClient?: GeocodeClient | null;
  locationService: LocationService;
  speechTranscribeClient?: SpeechTranscribeClient | null;
  store: AppStore;
  voiceAvailability?: VoiceAvailability;
  voiceRecorder?: VoiceRecorder | null;
  voiceTypedFallbackPrompt?: VoiceTypedFallbackPrompt | null;
}

export interface AppController {
  chooseVoiceLocation(index: number): Promise<void>;
  getActiveMode(): Mode;
  getVoiceAvailability(): VoiceAvailability;
  initializeVoice(): void;
  refreshNearbyDepartures(): Promise<void>;
  setMode(mode: Mode): void;
  setSelectedStop(stopId: string | null): Promise<void>;
  startVoiceSearch(): Promise<void>;
  store: AppStore;
  subscribe(listener: (mode: Mode) => void): () => void;
  toggleDestinationFilter(destination: string): Promise<void>;
  toggleLineFilter(line: string): Promise<void>;
}

const LOADING_MESSAGE = "Loading nearby departures...";
const LOCATION_DENIED_MESSAGE = "Location access denied.";
const LOCATION_UNAVAILABLE_MESSAGE = "Location is unavailable.";
const LOAD_ERROR_MESSAGE = "Could not load departures.";
const MAX_DEPARTURES_ATTEMPTS = 2;
const MAX_GEOCODE_ATTEMPTS = 2;
const LINE_INTENT_FALLBACK_COORDS = {
  lat: 60.1699,
  lon: 24.9384,
};
const VOICE_LISTENING_MESSAGE = "Listening... speak now.";
const VOICE_PROCESSING_MESSAGE = "Transcribing voice query...";
const VOICE_RESOLVING_MESSAGE = "Finding matching location...";
const VOICE_UNAVAILABLE_MESSAGE = "Voice recognition is unavailable right now.";
const VOICE_GEOCODE_ERROR_MESSAGE = "Could not approximate location. Please try again.";
const VOICE_NO_MATCH_MESSAGE = "No matching location found in HSL area.";
const VOICE_AMBIGUOUS_MESSAGE = "Multiple matches found. Choose one below.";

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function createAppController(options: CreateAppControllerOptions): AppController {
  const {
    departuresClient,
    geocodeClient = null,
    locationService,
    speechTranscribeClient = null,
    store,
    voiceAvailability = "checking",
    voiceRecorder = null,
    voiceTypedFallbackPrompt = null,
  } = options;
  let activeRequestId = 0;
  let activeAbortController: AbortController | null = null;

  if (options.voiceAvailability) {
    store.setVoiceAvailability(voiceAvailability);
  }

  function createRequestToken(): { abortController: AbortController; requestId: number } {
    activeAbortController?.abort();
    activeAbortController = new AbortController();
    return {
      abortController: activeAbortController,
      requestId: ++activeRequestId,
    };
  }

  function buildCurrentRequestInput(signal: AbortSignal) {
    const state = store.getState();
    if (!state.coords) {
      return null;
    }

    return {
      coords: state.coords,
      destinations: state.filters.destinations,
      lines: state.filters.lines,
      mode: state.activeMode,
      signal,
      stopId: state.filters.stopId,
    };
  }

  async function applyDeparturesRequest(requestId: number, signal: AbortSignal): Promise<void> {
    const requestInput = buildCurrentRequestInput(signal);
    if (!requestInput) {
      return;
    }

    let response = null;

    for (let attempt = 0; attempt < MAX_DEPARTURES_ATTEMPTS; attempt += 1) {
      if (requestId !== activeRequestId || signal.aborted) {
        return;
      }

      try {
        response = await departuresClient.getDepartures(requestInput);
        break;
      } catch (error) {
        if (
          attempt >= MAX_DEPARTURES_ATTEMPTS - 1 ||
          requestId !== activeRequestId ||
          signal.aborted ||
          isAbortError(error)
        ) {
          throw error;
        }
      }
    }

    if (!response) {
      return;
    }
    if (requestId !== activeRequestId) {
      return;
    }
    store.applyDeparturesResponse(response);
  }

  async function loadDeparturesForCurrentState(): Promise<void> {
    if (!store.getState().coords) {
      await refreshNearbyDepartures();
      return;
    }

    const { abortController, requestId } = createRequestToken();
    store.startLoading(LOADING_MESSAGE);

    try {
      await applyDeparturesRequest(requestId, abortController.signal);
    } catch {
      if (requestId !== activeRequestId) {
        return;
      }
      store.setError(LOAD_ERROR_MESSAGE);
    }
  }

  async function loadDeparturesForCoordinates(coords: { lat: number; lon: number }): Promise<void> {
    const { abortController, requestId } = createRequestToken();
    store.setCoordinates(coords);
    store.startLoading(LOADING_MESSAGE);

    try {
      await applyDeparturesRequest(requestId, abortController.signal);
    } catch {
      if (requestId !== activeRequestId) {
        return;
      }
      store.setError(LOAD_ERROR_MESSAGE);
    }
  }

  async function refreshNearbyDepartures(): Promise<void> {
    const { abortController, requestId } = createRequestToken();
    store.startLoading(LOADING_MESSAGE);
    let locationResult = await locationService.getCurrentPosition();

    if (!locationResult.ok && locationResult.code === "unavailable") {
      locationResult = await locationService.getCurrentPosition({
        enableHighAccuracy: true,
      });
    }

    if (!locationResult.ok) {
      if (requestId !== activeRequestId) {
        return;
      }
      if (locationResult.code === "permission-denied") {
        store.setLocationDenied(LOCATION_DENIED_MESSAGE);
        return;
      }
      if (store.getState().coords) {
        try {
          await applyDeparturesRequest(requestId, abortController.signal);
        } catch {
          if (requestId !== activeRequestId) {
            return;
          }
          store.setError(LOAD_ERROR_MESSAGE);
        }
        return;
      }
      store.setLocationUnavailable(LOCATION_UNAVAILABLE_MESSAGE);
      return;
    }

    store.setCoordinates(locationResult.value);

    try {
      await applyDeparturesRequest(requestId, abortController.signal);
    } catch {
      if (requestId !== activeRequestId) {
        return;
      }
      store.setError(LOAD_ERROR_MESSAGE);
    }
  }

  function buildVoiceBias(): { biasLat: number; biasLon: number } {
    const coords = store.getState().coords;
    return {
      biasLat: coords?.lat ?? 60.1699,
      biasLon: coords?.lon ?? 24.9384,
    };
  }

  function buildVoiceLineIntentCoords(): { lat: number; lon: number } {
    const coords = store.getState().coords;
    if (coords) {
      return coords;
    }

    return {
      lat: LINE_INTENT_FALLBACK_COORDS.lat,
      lon: LINE_INTENT_FALLBACK_COORDS.lon,
    };
  }

  function getVoiceLineIntentModes(intentMode: Mode | null): Mode[] {
    if (intentMode) {
      return [intentMode];
    }

    const candidates: Mode[] = [];
    const currentMode = store.getState().activeMode;
    if (currentMode) {
      candidates.push(currentMode);
    }
    candidates.push("BUS", "TRAM", "RAIL");

    return candidates.filter((mode, index) => candidates.indexOf(mode) === index);
  }

  function buildLineIntentNoMatchStatus(mode: Mode | null, line: string): string {
    const normalizedLine = normalizeVoiceLineToken(line);
    if (!mode) {
      return `No nearby departures found for line ${normalizedLine}.`;
    }

    return `No nearby departures found for ${mode.toLowerCase()} ${normalizedLine}.`;
  }

  async function resolveVoiceLineIntent(intent: VoiceLineIntent): Promise<boolean> {
    const requestedLine = normalizeVoiceLineToken(intent.line);
    const requestedModes = getVoiceLineIntentModes(intent.mode);
    if (!requestedLine || requestedModes.length === 0) {
      return false;
    }

    const coords = buildVoiceLineIntentCoords();
    const currentMode = store.getState().activeMode;
    let firstFailure: Error | null = null;
    let upstreamFailureCount = 0;

    const candidates = await Promise.all(
      requestedModes.map(async (mode) => {
        try {
          const response = await departuresClient.getDepartures({
            coords,
            destinations: [],
            lineIntent: true,
            lines: [requestedLine],
            mode,
            stopId: null,
          });
          if (!hasMatchingLineDeparture(response.station, requestedLine)) {
            return null;
          }

          return {
            departureTimeMs: getSoonestMatchingDepartureMs(response.station, requestedLine),
            distanceMeters: Number(response.station?.distanceMeters) || Number.POSITIVE_INFINITY,
            mode,
            response,
          };
        } catch (error) {
          upstreamFailureCount += 1;
          firstFailure ||= error instanceof Error ? error : new Error(String(error));
          return null;
        }
      })
    );

    const validCandidates = candidates
      .filter((candidate): candidate is NonNullable<(typeof candidates)[number]> => candidate != null)
      .sort((left, right) => {
        if (left.departureTimeMs !== right.departureTimeMs) {
          return left.departureTimeMs - right.departureTimeMs;
        }

        const leftIsCurrentMode = left.mode === currentMode ? 1 : 0;
        const rightIsCurrentMode = right.mode === currentMode ? 1 : 0;
        if (leftIsCurrentMode !== rightIsCurrentMode) {
          return rightIsCurrentMode - leftIsCurrentMode;
        }

        return left.distanceMeters - right.distanceMeters;
      });

    const winner = validCandidates[0] || null;
    if (!winner) {
      if (upstreamFailureCount === requestedModes.length && firstFailure) {
        throw firstFailure;
      }
      store.setStatus(buildLineIntentNoMatchStatus(intent.mode, requestedLine));
      return false;
    }

    store.setMode(winner.mode);
    if (!store.getState().coords) {
      store.setCoordinates(coords);
    }
    store.applyDeparturesResponse(winner.response);
    store.toggleLineFilter(requestedLine);
    store.setStatus(null);
    return true;
  }

  async function loadResolvedVoiceLocation(location: GeocodeLocation): Promise<void> {
    store.clearVoiceChoices();
    await loadDeparturesForCoordinates({
      lat: location.latitude,
      lon: location.longitude,
    });
  }

  async function resolveVoiceTranscript(transcript: string): Promise<void> {
    const lineIntent = parseVoiceLineIntent(transcript);
    if (lineIntent) {
      await resolveVoiceLineIntent(lineIntent);
      return;
    }

    if (!geocodeClient) {
      store.setStatus(`Captured voice query: ${transcript}`);
      return;
    }

    store.setStatus(VOICE_RESOLVING_MESSAGE);
    let response = null;

    for (let attempt = 0; attempt < MAX_GEOCODE_ATTEMPTS; attempt += 1) {
      try {
        response = await geocodeClient.resolve({
          lang: "fi",
          query: transcript,
          ...buildVoiceBias(),
        });
        break;
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        if (attempt >= MAX_GEOCODE_ATTEMPTS - 1) {
          throw new Error(VOICE_GEOCODE_ERROR_MESSAGE);
        }
      }
    }

    if (!response) {
      return;
    }

    if (response.ambiguous && response.choices.length > 0) {
      store.setVoiceChoices(response.choices);
      store.setStatus(response.message || VOICE_AMBIGUOUS_MESSAGE);
      return;
    }

    const location = response.location || response.choices[0] || null;
    if (!location) {
      store.clearVoiceChoices();
      store.setStatus(response.message || VOICE_NO_MATCH_MESSAGE);
      return;
    }

    await loadResolvedVoiceLocation(location);
  }

  async function tryTypedVoiceFallback(error: unknown): Promise<boolean> {
    const typedQuery = voiceTypedFallbackPrompt?.request(error) || null;
    if (!typedQuery) {
      return false;
    }

    store.setVoiceQuery(typedQuery);
    await resolveVoiceTranscript(typedQuery);
    return true;
  }

  return {
    async chooseVoiceLocation(index) {
      const choice = store.getState().voice.choices[index];
      if (!choice) {
        return;
      }
      await loadResolvedVoiceLocation(choice);
    },
    getActiveMode() {
      return store.getState().activeMode;
    },
    getVoiceAvailability() {
      return store.getState().voice.availability;
    },
    initializeVoice() {
      if (options.voiceAvailability) {
        store.setVoiceAvailability(voiceAvailability);
      }
    },
    async refreshNearbyDepartures() {
      await refreshNearbyDepartures();
    },
    setMode(mode) {
      store.setMode(mode);
      if (store.getState().coords) {
        void loadDeparturesForCurrentState();
      }
    },
    async setSelectedStop(stopId) {
      store.setSelectedStop(stopId);
      if (store.getState().coords) {
        await loadDeparturesForCurrentState();
      }
    },
    async startVoiceSearch() {
      if (store.getState().voice.phase !== "idle") {
        return;
      }

      if (
        store.getState().voice.availability !== "available" ||
        !voiceRecorder ||
        !speechTranscribeClient
      ) {
        store.setVoiceAvailability("unavailable");
        store.setStatus(VOICE_UNAVAILABLE_MESSAGE);
        return;
      }

      store.clearVoiceQuery();
      store.clearVoiceChoices();
      store.setVoicePhase("listening");
      store.setStatus(VOICE_LISTENING_MESSAGE);

      try {
        const recording = await voiceRecorder.capture();
        store.setVoicePhase("processing");
        store.setStatus(VOICE_PROCESSING_MESSAGE);
        const transcript = await speechTranscribeClient.transcribe(recording);
        store.setVoiceQuery(transcript);
        await resolveVoiceTranscript(transcript);
      } catch (error) {
        if (await tryTypedVoiceFallback(error)) {
          return;
        }
        const message = error instanceof Error ? error.message : VOICE_UNAVAILABLE_MESSAGE;
        store.setStatus(message);
      } finally {
        store.setVoicePhase("idle");
      }
    },
    store,
    subscribe(listener) {
      return store.subscribe((state) => {
        listener(state.activeMode);
      });
    },
    async toggleDestinationFilter(destination) {
      store.toggleDestinationFilter(destination);
      if (store.getState().coords) {
        await loadDeparturesForCurrentState();
      }
    },
    async toggleLineFilter(line) {
      store.toggleLineFilter(line);
      if (store.getState().coords) {
        await loadDeparturesForCurrentState();
      }
    },
  };
}
