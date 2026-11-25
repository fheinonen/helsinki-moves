import type { AppState } from "@client/app/app-store";
import type { FilterState } from "@shared/domain/filter";
import { parseMode } from "@shared/domain/mode";
import { parseAppView, type AppView } from "@shared/domain/ride";

export interface HistoryLike {
  replaceState(
    data: unknown,
    unused: string,
    url?: string | URL | null
  ): void;
}

export interface LocationLike {
  hash?: string;
  pathname: string;
  search: string;
}

export function readModeFromSearch(search: string): AppState["activeMode"] {
  const searchParams = new URLSearchParams(search);
  const modeParam = String(searchParams.get("mode") || "").trim().toUpperCase();
  return parseMode(modeParam, "RAIL");
}

export function readViewFromSearch(search: string): AppView {
  const params = new URLSearchParams(search);
  return parseAppView(params.get("view"));
}

export function readRideFromSearch(search: string): {
  boardedStopId: string | null;
  exitStopId: string | null;
  transferMode: AppState["activeMode"] | null;
  transferTripId: string | null;
  tripId: string | null;
} {
  const params = new URLSearchParams(search);
  const tripId = params.get("trip")?.trim() || null;
  if (!tripId) {
    return {
      boardedStopId: null,
      exitStopId: null,
      transferMode: null,
      transferTripId: null,
      tripId: null,
    };
  }
  const exitStopId = params.get("exit")?.trim() || null;
  const transferTripId = exitStopId ? params.get("transferTrip")?.trim() || null : null;
  const rawTransferMode = params.get("transferMode")?.trim().toUpperCase() || "";
  const transferMode =
    transferTripId && rawTransferMode ? parseMode(rawTransferMode, "RAIL") : null;
  return {
    boardedStopId: params.get("boarded")?.trim() || null,
    exitStopId,
    transferMode,
    transferTripId,
    tripId,
  };
}

function readRepeatedValues(params: URLSearchParams, key: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const raw of params.getAll(key)) {
    const normalized = raw.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    values.push(normalized);
  }
  return values;
}

export function readLineAndDestinationFilters(
  search: string
): Pick<FilterState, "destinations" | "lines"> {
  const params = new URLSearchParams(search);
  return {
    destinations: readRepeatedValues(params, "dest"),
    lines: readRepeatedValues(params, "line"),
  };
}

export function readStopFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  const stopId = params.get("stop")?.trim() || params.get("stopId")?.trim() || "";
  return stopId || null;
}

function appendValues(params: URLSearchParams, key: string, values: string[]): void {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized) {
      continue;
    }
    params.append(key, normalized);
  }
}

function appendRideParams(params: URLSearchParams, state: AppState): void {
  if (state.activeView === "ride") {
    params.set("view", "ride");
  }
  const tripId = state.ride?.tripId?.trim();
  if (!tripId) {
    return;
  }
  params.set("trip", tripId);
  if (state.ride.boardedStopId?.trim()) {
    params.set("boarded", state.ride.boardedStopId.trim());
  }
  if (state.ride.exitStopId?.trim()) {
    params.set("exit", state.ride.exitStopId.trim());
    if (state.ride.transferTripId?.trim()) {
      if (state.ride.transferMode) {
        params.set("transferMode", state.ride.transferMode.toLowerCase());
      }
      params.set("transferTrip", state.ride.transferTripId.trim());
    }
  }
}

export function buildSearchFromState(state: AppState): string {
  const params = new URLSearchParams();
  params.set("mode", state.activeMode.toLowerCase());

  const selectedStopId = String(
    state.selectedStopId || state.filters.stopId || ""
  ).trim();
  if (selectedStopId) {
    params.set("stop", selectedStopId);
  }

  appendValues(params, "line", state.filters.lines);
  appendValues(params, "dest", state.filters.destinations);
  appendRideParams(params, state);

  const query = params.toString();
  return query ? `?${query}` : "";
}

export function syncUrlFromState(input: {
  historyRef: HistoryLike;
  locationRef: LocationLike;
  state: AppState;
}): void {
  const nextSearch = buildSearchFromState(input.state);
  if (nextSearch === input.locationRef.search) {
    return;
  }

  const nextUrl = `${input.locationRef.pathname}${nextSearch}${input.locationRef.hash || ""}`;
  input.historyRef.replaceState(null, "", nextUrl);
}
