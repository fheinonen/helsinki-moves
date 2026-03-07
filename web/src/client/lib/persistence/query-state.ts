import type { AppState } from "@client/app/app-store";
import { parseMode } from "@shared/domain/mode";

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

function appendValues(params: URLSearchParams, key: string, values: string[]): void {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized) {
      continue;
    }
    params.append(key, normalized);
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
