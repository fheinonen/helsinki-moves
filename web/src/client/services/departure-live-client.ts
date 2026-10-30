import type { AppState, AppStore } from "@client/app/app-store";
import { buildDeparturesSearchParams } from "@client/services/departures-client";
import { selectGlanceDepartures } from "@server/services/glance/glance-horizon";
import type { Departure } from "@shared/domain/departure";
import {
  parseDepartureTimeMessage,
  type DepartureTimeUpdate,
} from "@shared/domain/departure-live";
import type { Mode } from "@shared/domain/mode";

const RECONNECT_MS = 2_000;

export interface DepartureLiveQuery {
  coords: { lat: number; lon: number } | null;
  destinations: readonly string[];
  lines: readonly string[];
  mode: Mode;
  stopId: string | null;
}

export interface DepartureLiveSocket {
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void;
  close(): void;
}

export interface DepartureLiveSocketConstructor {
  new (url: string): DepartureLiveSocket;
}

export function departureLiveWebSocketUrl(query: DepartureLiveQuery, origin: string): string {
  const url = new URL(
    `/api/v1/departures-live?${buildDeparturesSearchParams(query).toString()}`,
    origin,
  );
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function departuresAfterTimeUpdate(state: AppState, update: DepartureTimeUpdate): Departure[] {
  const current = state.station?.departures ?? [];
  let changed = false;
  const next = current.map((departure) => {
    if (departure.tripId !== update.tripId || departure.stopId !== update.stopId) {
      return departure;
    }
    if (departure.departureIso === update.departureIso) {
      return departure;
    }
    changed = true;
    return { ...departure, departureIso: update.departureIso };
  });
  if (!changed || !state.station) {
    return current;
  }
  return selectGlanceDepartures({
    departures: next,
    mode: state.activeMode,
    nowMs: Date.now(),
  });
}

function liveQueryKey(state: AppState): string | null {
  if (state.loadState !== "ready" || !state.station) {
    return null;
  }
  if (!state.coords && !state.filters.stopId) {
    return null;
  }
  return JSON.stringify({
    destinations: state.filters.destinations,
    lat: state.coords?.lat ?? null,
    lines: state.filters.lines,
    lon: state.coords?.lon ?? null,
    mode: state.activeMode,
    stopId: state.filters.stopId,
  });
}

function queryFromState(state: AppState): DepartureLiveQuery {
  return {
    coords: state.coords,
    destinations: state.filters.destinations,
    lines: state.filters.lines,
    mode: state.activeMode,
    stopId: state.filters.stopId,
  };
}

function pageOrigin(): string {
  if (typeof location === "undefined" || !location.origin || location.origin === "null") {
    return "http://localhost";
  }
  return location.origin;
}

function applyLiveUpdate(store: AppStore, raw: string): void {
  const update = parseDepartureTimeMessage(raw);
  if (!update) {
    return;
  }
  store.setState((state) => {
    if (!state.station) {
      return state;
    }
    const departures = departuresAfterTimeUpdate(state, update);
    if (departures === state.station.departures) {
      return state;
    }
    return {
      ...state,
      station: {
        ...state.station,
        departures,
      },
    };
  });
}

export function watchDepartureTimes(input: {
  store: AppStore;
  WebSocketCtor?: DepartureLiveSocketConstructor;
}): () => void {
  const SocketCtor = input.WebSocketCtor ?? (WebSocket as unknown as DepartureLiveSocketConstructor);
  let generation = 0;
  let activeKey: string | null = null;
  let socket: DepartureLiveSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;

  function closeSocket(): void {
    generation += 1;
    if (retry) {
      clearTimeout(retry);
      retry = null;
    }
    socket?.close();
    socket = null;
  }

  function openSocket(state: AppState, key: string): void {
    const current = generation;
    const nextSocket = new SocketCtor(departureLiveWebSocketUrl(queryFromState(state), pageOrigin()));
    socket = nextSocket;
    nextSocket.addEventListener("message", (event) => {
      if (current !== generation) {
        return;
      }
      applyLiveUpdate(input.store, String(event.data ?? ""));
    });
    nextSocket.addEventListener("close", () => {
      if (current !== generation) {
        return;
      }
      if (socket === nextSocket) {
        socket = null;
      }
      activeKey = null;
      retry = setTimeout(() => {
        if (current !== generation) {
          return;
        }
        ensureSocket(input.store.getState());
      }, RECONNECT_MS);
    });
    activeKey = key;
  }

  function ensureSocket(state: AppState): void {
    const key = liveQueryKey(state);
    if (key === activeKey) {
      return;
    }
    closeSocket();
    if (!key) {
      activeKey = null;
      return;
    }
    openSocket(state, key);
  }

  ensureSocket(input.store.getState());
  const unsubscribe = input.store.subscribe((state) => {
    ensureSocket(state);
  });

  return () => {
    unsubscribe();
    closeSocket();
    activeKey = null;
  };
}
