import { createStore, type Store } from "@client/lib/store/create-store";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
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
import type { StopStation } from "@shared/contracts/departures-contract";
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
  message: string | null;
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

export interface AppStore extends Store<AppState> {
  applyDeparturesResponse(response: DeparturesSuccessResponse): void;
  clearFilters(): void;
  clearVoiceChoices(): void;
  clearVoiceQuery(): void;
  setCoordinates(coords: Coordinates): void;
  setError(message: string): void;
  setLocationDenied(message: string): void;
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
    message: null,
    selectedStopId: null,
    station: null,
    statusMessage: null,
    stops: [],
    theme: "light",
    voice: {
      availability: "checking",
      choices: [],
      pendingQuery: null,
      phase: "idle",
    },
  };
}

export function createAppStore(initialState: Partial<AppState> = {}): AppStore {
  const store = createStore<AppState>({
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
        message: response.message || null,
        selectedStopId: response.selectedStopId,
        station: response.station,
        statusMessage: response.message || null,
        stops: response.stops,
      }));
    },
    clearFilters() {
      store.setState((state) => ({
        ...state,
        filters: {
          ...createEmptyFilterState(),
          stopId: state.filters.stopId,
        },
        selectedStopId: state.filters.stopId,
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
