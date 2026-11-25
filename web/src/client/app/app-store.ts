import type { DeparturesSuccessResponse, StopStation } from "@shared/contracts/departures-contract";
import type { Departure } from "@shared/domain/departure";
import { mergeLaterDepartures } from "@shared/domain/board-rank";
import type { GeocodeLocation } from "@shared/contracts/geocode-contract";
import type { Mode } from "@shared/domain/mode";
import type { AppView } from "@shared/domain/ride";
import type { Stop } from "@shared/domain/stop";
import {
  createEmptyFilterState,
  sanitizeFilterState,
  toggleFilterValue,
  type FilterOption,
  type FilterState,
} from "@shared/domain/filter";
import type { VoiceAvailability, VoicePhase } from "@client/features/voice/voice-capability";

export type ThemeMode = "dark" | "light";
export type LoadState =
  | "error"
  | "idle"
  | "loading"
  | "location-denied"
  | "location-unavailable"
  | "ready";

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface RideSelectionState {
  boardedStopId: string | null;
  destination: string | null;
  destinationColor: string | null;
  exitStopId: string | null;
  line: string | null;
  transferMode: Mode | null;
  transferTripId: string | null;
  tripId: string | null;
}

export interface StartRideInput {
  boardedStopId?: string | null;
  destination?: string | null;
  destinationColor?: string | null;
  exitStopId?: string | null;
  line?: string | null;
  tripId: string;
}

export interface AppState {
  activeMode: Mode;
  activeView: AppView;
  coords: Coordinates | null;
  dataReceivedAtIso: string | null;
  filters: FilterState;
  filterOptions: {
    destinations: FilterOption[];
    lines: FilterOption[];
  };
  loadState: LoadState;
  ride: RideSelectionState;
  selectedStopId: string | null;
  station: StopStation | null;
  statusMessage: string | null;
  stops: Stop[];
  theme: ThemeMode;
  voice: {
    availability: VoiceAvailability;
    choices: GeocodeLocation[];
    pendingQuery: string | null;
    phase: VoicePhase;
  };
}

interface AppStateStore {
  getState(): AppState;
  setState(updater: AppState | ((state: AppState) => AppState)): void;
  subscribe(listener: (state: AppState) => void): () => void;
}

export interface AppStore extends AppStateStore {
  appendLaterDepartures(suffix: readonly Departure[]): void;
  applyDeparturesResponse(response: DeparturesSuccessResponse): void;
  clearRide(): void;
  clearVoiceChoices(): void;
  clearVoiceQuery(): void;
  restoreRideSelection(input: {
    boardedStopId: string | null;
    exitStopId: string | null;
    transferMode?: Mode | null;
    transferTripId?: string | null;
    tripId: string | null;
  }): void;
  setActiveView(view: AppView): void;
  setCoordinates(coords: Coordinates): void;
  setError(message: string): void;
  setLocationDenied(message: string): void;
  setLineAndDestinationFilters(lines: string[], destinations: string[]): void;
  setLocationUnavailable(message: string): void;
  setMode(mode: Mode): void;
  setRideExitStop(stopId: string | null): void;
  setRideTransfer(input: { mode: Mode | null; tripId: string | null }): void;
  setSelectedStop(stopId: string | null): void;
  setStopAnchor(stopId: string | null): void;
  setStatus(message: string | null): void;
  startLoading(message: string): void;
  startRide(input: StartRideInput): void;
  setTheme(theme: ThemeMode): void;
  setVoiceAvailability(availability: VoiceAvailability): void;
  setVoiceChoices(choices: GeocodeLocation[]): void;
  setVoicePhase(phase: VoicePhase): void;
  setVoiceQuery(query: string | null): void;
  toggleDestinationFilter(destination: string): void;
  toggleLineFilter(line: string): void;
}

function createEmptyRideSelection(): RideSelectionState {
  return {
    boardedStopId: null,
    destination: null,
    destinationColor: null,
    exitStopId: null,
    line: null,
    transferMode: null,
    transferTripId: null,
    tripId: null,
  };
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function readStopAnchor(stops: Stop[], selectedStopId: string | null): Coordinates | null {
  const selected = stops.find((stop) => stop.id === selectedStopId);
  if (!selected || selected.lat == null || selected.lon == null) {
    return null;
  }
  if (!Number.isFinite(selected.lat) || !Number.isFinite(selected.lon)) {
    return null;
  }
  return { lat: selected.lat, lon: selected.lon };
}

function createInitialState(): AppState {
  return {
    activeMode: "RAIL",
    activeView: "wait",
    coords: null,
    dataReceivedAtIso: null,
    filters: createEmptyFilterState(),
    filterOptions: {
      destinations: [],
      lines: [],
    },
    loadState: "idle",
    ride: createEmptyRideSelection(),
    selectedStopId: null,
    station: null,
    statusMessage: null,
    stops: [],
    theme: "dark",
    voice: {
      availability: "checking",
      choices: [],
      pendingQuery: null,
      phase: "idle",
    },
  };
}

function createStore(initialState: AppState): AppStateStore {
  let state = initialState;
  const listeners = new Set<(nextState: AppState) => void>();

  function getState(): AppState {
    return state;
  }

  function setState(updater: AppState | ((currentState: AppState) => AppState)): void {
    state = typeof updater === "function" ? updater(state) : updater;
    for (const listener of listeners) {
      listener(state);
    }
  }

  function subscribe(listener: (nextState: AppState) => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    getState,
    setState,
    subscribe,
  };
}

export function createAppStore(initialState: Partial<AppState> = {}): AppStore {
  const store = createStore({
    ...createInitialState(),
    ...initialState,
  });

  return {
    ...store,
    appendLaterDepartures(suffix) {
      store.setState((state) => {
        if (!state.station) {
          return state;
        }
        return {
          ...state,
          station: {
            ...state.station,
            departures: [...mergeLaterDepartures(state.station.departures, suffix)],
          },
        };
      });
    },
    applyDeparturesResponse(response) {
      store.setState((state) => ({
        ...state,
        activeMode: response.mode,
        coords: state.coords ?? readStopAnchor(response.stops, response.selectedStopId),
        filters: sanitizeFilterState(state.filters, {
          allowedDestinations: response.filterOptions.destinations.map((option) => option.value),
          allowedLines: response.filterOptions.lines.map((option) => option.value),
          availableStopIds: response.stops.map((stop) => stop.id),
          selectedStopId: response.selectedStopId,
        }),
        dataReceivedAtIso: new Date(Date.now()).toISOString(),
        filterOptions: response.filterOptions,
        loadState: "ready",
        selectedStopId: response.selectedStopId,
        station: response.station,
        statusMessage: response.message || null,
        stops: response.stops,
      }));
    },
    clearRide() {
      store.setState((state) => ({
        ...state,
        ride: createEmptyRideSelection(),
      }));
    },
    clearVoiceChoices() {
      store.setState((state) => ({
        ...state,
        voice: {
          ...state.voice,
          choices: [],
        },
      }));
    },
    clearVoiceQuery() {
      store.setState((state) => ({
        ...state,
        voice: {
          ...state.voice,
          pendingQuery: null,
        },
      }));
    },
    restoreRideSelection(input) {
      const tripId = normalizeOptionalId(input.tripId);
      const exitStopId = normalizeOptionalId(input.exitStopId);
      const transferTripId = exitStopId ? normalizeOptionalId(input.transferTripId) : null;
      store.setState((state) => ({
        ...state,
        ride: tripId
          ? {
              boardedStopId: normalizeOptionalId(input.boardedStopId),
              destination: null,
              destinationColor: null,
              exitStopId,
              line: null,
              transferMode: transferTripId ? (input.transferMode ?? null) : null,
              transferTripId,
              tripId,
            }
          : createEmptyRideSelection(),
      }));
    },
    setActiveView(view) {
      store.setState((state) => (state.activeView === view ? state : { ...state, activeView: view }));
    },
    setCoordinates(coords) {
      store.setState((state) => ({
        ...state,
        coords,
      }));
    },
    setError(message) {
      store.setState((state) => ({
        ...state,
        loadState: "error",
        statusMessage: message,
      }));
    },
    setLocationDenied(message) {
      store.setState((state) => ({
        ...state,
        loadState: "location-denied",
        statusMessage: message,
      }));
    },
    setLineAndDestinationFilters(lines, destinations) {
      store.setState((state) => ({
        ...state,
        filters: {
          ...state.filters,
          destinations: [...destinations],
          lines: [...lines],
        },
      }));
    },
    setLocationUnavailable(message) {
      store.setState((state) => ({
        ...state,
        loadState: "location-unavailable",
        statusMessage: message,
      }));
    },
    setMode(mode) {
      store.setState((state) => ({
        ...state,
        activeMode: mode,
        filters: createEmptyFilterState(),
        selectedStopId: null,
      }));
    },
    setRideExitStop(stopId) {
      const normalizedStopId = normalizeOptionalId(stopId);
      store.setState((state) => {
        const unchanged = state.ride.exitStopId === normalizedStopId;
        return {
          ...state,
          ride: {
            ...state.ride,
            exitStopId: normalizedStopId,
            transferMode: unchanged ? state.ride.transferMode : null,
            transferTripId: unchanged ? state.ride.transferTripId : null,
          },
        };
      });
    },
    setRideTransfer(input) {
      const transferTripId = normalizeOptionalId(input.tripId);
      store.setState((state) => ({
        ...state,
        ride: {
          ...state.ride,
          transferMode: transferTripId ? input.mode : null,
          transferTripId,
        },
      }));
    },
    setSelectedStop(stopId) {
      const normalizedStopId = String(stopId || "").trim() || null;
      store.setState((state) => ({
        ...state,
        filters: {
          destinations: [],
          lines: [],
          stopId: normalizedStopId,
        },
        selectedStopId: normalizedStopId,
      }));
    },
    setStopAnchor(stopId) {
      const normalizedStopId = String(stopId || "").trim() || null;
      store.setState((state) => ({
        ...state,
        filters: {
          ...state.filters,
          stopId: normalizedStopId,
        },
        selectedStopId: normalizedStopId,
      }));
    },
    setStatus(message) {
      store.setState((state) => ({
        ...state,
        statusMessage: message,
      }));
    },
    startLoading(message) {
      store.setState((state) => ({
        ...state,
        loadState: "loading",
        statusMessage: message,
      }));
    },
    startRide(input) {
      const tripId = normalizeOptionalId(input.tripId);
      if (!tripId) {
        return;
      }
      store.setState((state) => ({
        ...state,
        activeView: "ride",
        ride: {
          boardedStopId: normalizeOptionalId(input.boardedStopId),
          destination: normalizeOptionalId(input.destination),
          destinationColor: normalizeOptionalId(input.destinationColor),
          exitStopId: normalizeOptionalId(input.exitStopId),
          line: normalizeOptionalId(input.line),
          transferMode: null,
          transferTripId: null,
          tripId,
        },
      }));
    },
    setTheme(theme) {
      store.setState((state) => ({
        ...state,
        theme,
      }));
    },
    setVoiceAvailability(availability) {
      store.setState((state) => ({
        ...state,
        voice: {
          ...state.voice,
          availability,
        },
      }));
    },
    setVoiceChoices(choices) {
      store.setState((state) => ({
        ...state,
        voice: {
          ...state.voice,
          choices: [...choices],
        },
      }));
    },
    setVoicePhase(phase) {
      store.setState((state) => ({
        ...state,
        voice: {
          ...state.voice,
          phase,
        },
      }));
    },
    setVoiceQuery(query) {
      store.setState((state) => ({
        ...state,
        voice: {
          ...state.voice,
          pendingQuery: query,
        },
      }));
    },
    toggleDestinationFilter(destination) {
      store.setState((state) => ({
        ...state,
        filters: {
          ...state.filters,
          destinations: toggleFilterValue(state.filters.destinations, destination),
        },
      }));
    },
    toggleLineFilter(line) {
      store.setState((state) => ({
        ...state,
        filters: {
          ...state.filters,
          lines: toggleFilterValue(state.filters.lines, line),
        },
      }));
    },
  };
}
