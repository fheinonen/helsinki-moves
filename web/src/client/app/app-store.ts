import type { DeparturesSuccessResponse, StopStation } from "@shared/contracts/departures-contract";
import type { GeocodeLocation } from "@shared/contracts/geocode-contract";
import type { Mode } from "@shared/domain/mode";
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

export interface AppState {
  activeMode: Mode;
  coords: Coordinates | null;
  filters: FilterState;
  filterOptions: {
    destinations: FilterOption[];
    lines: FilterOption[];
  };
  loadState: LoadState;
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
  applyDeparturesResponse(response: DeparturesSuccessResponse): void;
  clearVoiceChoices(): void;
  clearVoiceQuery(): void;
  setCoordinates(coords: Coordinates): void;
  setError(message: string): void;
  setLocationDenied(message: string): void;
  setLineAndDestinationFilters(lines: string[], destinations: string[]): void;
  setLocationUnavailable(message: string): void;
  setMode(mode: Mode): void;
  setSelectedStop(stopId: string | null): void;
  setStatus(message: string | null): void;
  startLoading(message: string): void;
  setTheme(theme: ThemeMode): void;
  setVoiceAvailability(availability: VoiceAvailability): void;
  setVoiceChoices(choices: GeocodeLocation[]): void;
  setVoicePhase(phase: VoicePhase): void;
  setVoiceQuery(query: string | null): void;
  toggleDestinationFilter(destination: string): void;
  toggleLineFilter(line: string): void;
}

function createInitialState(): AppState {
  return {
    activeMode: "RAIL",
    coords: null,
    filters: createEmptyFilterState(),
    filterOptions: {
      destinations: [],
      lines: [],
    },
    loadState: "idle",
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
    applyDeparturesResponse(response) {
      store.setState((state) => ({
        ...state,
        activeMode: response.mode,
        filters: sanitizeFilterState(state.filters, {
          allowedDestinations: response.filterOptions.destinations.map((option) => option.value),
          allowedLines: response.filterOptions.lines.map((option) => option.value),
          availableStopIds: response.stops.map((stop) => stop.id),
          selectedStopId: response.selectedStopId,
        }),
        filterOptions: response.filterOptions,
        loadState: "ready",
        selectedStopId: response.selectedStopId,
        station: response.station,
        statusMessage: response.message || null,
        stops: response.stops,
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
