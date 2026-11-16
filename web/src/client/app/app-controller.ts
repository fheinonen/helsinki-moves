import type { AppStore } from "@client/app/app-store";
import { createHoldSession, type PointerPush, type ScrollMetrics } from "@client/app/hold-scroll";
import type { DeparturesClient } from "@client/services/departures-client";
import {
  getSoonestMatchingDepartureMs,
  hasMatchingLineDeparture,
  parseVoiceLineIntent,
  normalizeVoiceLineToken,
  type VoiceLineIntent,
} from "@client/features/voice/voice-line-intent";
import type { GeocodeClient } from "@client/services/geocode-client";
import type { LocationResult, LocationService } from "@client/services/location-service";
import type { SpeechTranscribeClient } from "@client/services/speech-transcribe-client";
import type { VoiceRecorder } from "@client/features/voice/browser-voice-recorder";
import type { VoiceAvailability } from "@client/features/voice/voice-capability";
import type { VoiceTypedFallbackPrompt } from "@client/features/voice/voice-typed-fallback";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import { tailCursor, type BoardCursor } from "@shared/domain/board-rank";
import type { Departure } from "@shared/domain/departure";
import type { GeocodeLocation } from "@shared/contracts/geocode-contract";
import { sanitizeFilterState } from "@shared/domain/filter";
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

type DepartureLoadPresentation = "blank" | "keep";

type ExtendPermit = {
  readonly after: BoardCursor;
  readonly destinations: readonly string[];
  readonly lat: number | null;
  readonly lines: readonly string[];
  readonly lon: number | null;
  readonly mode: Mode;
  readonly requestId: number;
  readonly stopId: string | null;
};

export interface AppController {
  chooseVoiceLocation(index: number): Promise<void>;
  getActiveMode(): Mode;
  getVoiceAvailability(): VoiceAvailability;
  initializeVoice(): void;
  loadInitialDepartures(): Promise<void>;
  noteScrollPush(push: PointerPush, metrics: ScrollMetrics): void;
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

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
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
  let extendAbortController: AbortController | null = null;
  const holdSession = createHoldSession();

  if (options.voiceAvailability) {
    store.setVoiceAvailability(voiceAvailability);
  }

  function createRequestToken(): { abortController: AbortController; requestId: number } {
    activeAbortController?.abort();
    extendAbortController?.abort();
    holdSession.reset();
    activeAbortController = new AbortController();
    return {
      abortController: activeAbortController,
      requestId: ++activeRequestId,
    };
  }

  function buildCurrentRequestInput(signal: AbortSignal) {
    const state = store.getState();
    if (!state.coords && !state.filters.stopId) {
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
    const nextResponse = await reloadIfQueryFiltersWereRejected(response, requestId, signal);
    if (requestId !== activeRequestId) {
      return;
    }
    store.applyDeparturesResponse(nextResponse);
  }

  async function reloadIfQueryFiltersWereRejected(
    response: DeparturesSuccessResponse,
    requestId: number,
    signal: AbortSignal
  ): Promise<DeparturesSuccessResponse> {
    const state = store.getState();
    const retained = sanitizeFilterState(state.filters, {
      allowedDestinations: response.filterOptions.destinations.map((option) => option.value),
      allowedLines: response.filterOptions.lines.map((option) => option.value),
      availableStopIds: state.stops.map((stop) => stop.id),
      selectedStopId: state.filters.stopId,
    });
    if (
      sameValues(state.filters.lines, retained.lines) &&
      sameValues(state.filters.destinations, retained.destinations)
    ) {
      return response;
    }

    store.setLineAndDestinationFilters(retained.lines, retained.destinations);
    if (requestId !== activeRequestId || signal.aborted) {
      return response;
    }

    const requestInput = buildCurrentRequestInput(signal);
    if (!requestInput) {
      return response;
    }

    return departuresClient.getDepartures(requestInput);
  }

  function presentDepartureLoad(presentation: DepartureLoadPresentation): void {
    switch (presentation) {
      case "blank":
        store.startLoading(LOADING_MESSAGE);
        return;
      case "keep":
        return;
      default: {
        const unreachable: never = presentation;
        throw new Error(`Unexpected departure load presentation: ${String(unreachable)}`);
      }
    }
  }

  async function loadDeparturesForCurrentState(
    presentation: DepartureLoadPresentation = "blank"
  ): Promise<void> {
    const state = store.getState();
    if (!state.coords && !state.filters.stopId) {
      await loadNearbyFromDevice(readCoarseDevicePosition);
      return;
    }

    const { abortController, requestId } = createRequestToken();
    presentDepartureLoad(presentation);

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

  function readCoarseDevicePosition(): Promise<LocationResult> {
    return locationService.getCurrentPosition().then((coarse) => {
      if (coarse.ok || coarse.code !== "unavailable") {
        return coarse;
      }
      return locationService.getCurrentPosition({
        enableHighAccuracy: true,
      });
    });
  }

  function readFreshDevicePosition(): Promise<LocationResult> {
    return locationService.getCurrentPosition({
      enableHighAccuracy: true,
      maximumAge: 0,
    });
  }

  async function loadNearbyFromDevice(readPosition: () => Promise<LocationResult>): Promise<void> {
    const { abortController, requestId } = createRequestToken();
    store.startLoading(LOADING_MESSAGE);
    const locationResult = await readPosition();
    if (requestId !== activeRequestId) {
      return;
    }

    if (!locationResult.ok) {
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

    store.setStopAnchor(null);
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

  function capturePermit(after: BoardCursor): ExtendPermit {
    const state = store.getState();
    return {
      after,
      destinations: [...state.filters.destinations],
      lat: state.coords?.lat ?? null,
      lines: [...state.filters.lines],
      lon: state.coords?.lon ?? null,
      mode: state.activeMode,
      requestId: activeRequestId,
      stopId: state.filters.stopId,
    };
  }

  function sameCursor(left: BoardCursor, right: BoardCursor): boolean {
    return left.departureMs === right.departureMs && left.tie === right.tie;
  }

  function sameScope(permit: ExtendPermit, current: ExtendPermit): boolean {
    return (
      permit.mode === current.mode &&
      permit.stopId === current.stopId &&
      sameValues(permit.lines, current.lines) &&
      sameValues(permit.destinations, current.destinations)
    );
  }

  function samePlace(permit: ExtendPermit, current: ExtendPermit): boolean {
    return permit.lat === current.lat && permit.lon === current.lon && sameCursor(permit.after, current.after);
  }

  function extendPermitStillHolds(permit: ExtendPermit, current: ExtendPermit): boolean {
    return permit.requestId === current.requestId && sameScope(permit, current) && samePlace(permit, current);
  }

  function permitStillCurrent(permit: ExtendPermit): boolean {
    const tail = tailCursor(store.getState().station?.departures ?? []);
    if (!tail) {
      return false;
    }
    return extendPermitStillHolds(permit, capturePermit(tail));
  }

  function departureCount(): number {
    return store.getState().station?.departures.length ?? 0;
  }

  function replaceExtendSignal(): AbortSignal {
    extendAbortController?.abort();
    extendAbortController = new AbortController();
    return extendAbortController.signal;
  }

  function appendHeldSuffix(permit: ExtendPermit, suffix: readonly Departure[]): void {
    if (!permitStillCurrent(permit)) {
      return;
    }
    const before = departureCount();
    store.appendLaterDepartures(suffix);
    const grew = departureCount() > before;
    holdSession.settle(grew ? { type: "grew" } : { type: "empty" });
  }

  function failHeldSuffix(permit: ExtendPermit): void {
    if (!permitStillCurrent(permit)) {
      return;
    }
    holdSession.settle({ type: "failed" });
  }

  async function loadLaterDepartures(): Promise<void> {
    const state = store.getState();
    const tail = tailCursor(state.station?.departures ?? []);
    if (!tail) {
      holdSession.settle({ type: "failed" });
      return;
    }
    const permit = capturePermit(tail);
    try {
      const later = await departuresClient.getLaterDepartures({
        after: tail,
        coords: state.coords,
        destinations: [...permit.destinations],
        lines: [...permit.lines],
        mode: permit.mode,
        signal: replaceExtendSignal(),
        stopId: permit.stopId,
      });
      appendHeldSuffix(permit, later.departures);
    } catch {
      failHeldSuffix(permit);
    }
  }

  function noteScrollPush(push: PointerPush, metrics: ScrollMetrics): void {
    const step = holdSession.push(push, metrics);
    if (!step.extend) {
      return;
    }
    void loadLaterDepartures();
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
    async loadInitialDepartures() {
      if (store.getState().filters.stopId) {
        await loadDeparturesForCurrentState();
        return;
      }
      await loadNearbyFromDevice(readCoarseDevicePosition);
    },
    noteScrollPush,
    async refreshNearbyDepartures() {
      await loadNearbyFromDevice(readFreshDevicePosition);
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
        await loadDeparturesForCurrentState("keep");
      }
    },
    async toggleLineFilter(line) {
      store.toggleLineFilter(line);
      if (store.getState().coords) {
        await loadDeparturesForCurrentState("keep");
      }
    },
  };
}
