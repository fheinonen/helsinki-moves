import type { AppState } from "@client/app/app-store";
import type { FilterState } from "@shared/domain/filter";
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
