import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { Coordinates } from "@client/app/app-store";
import type { Mode } from "@shared/domain/mode";

export interface DeparturesClient {
  getDepartures(input: {
    coords: Coordinates | null;
    destinations: string[];
    lineIntent?: boolean;
    lines: string[];
    mode: Mode;
    signal?: AbortSignal;
    stopId: string | null;
  }): Promise<DeparturesSuccessResponse>;
}

interface ErrorPayload {
  error?: string;
}

function isErrorPayload(value: unknown): value is ErrorPayload {
  return typeof value === "object" && value !== null && "error" in value;
}

export function buildDeparturesSearchParams(input: {
  coords: Coordinates | null;
  destinations: readonly string[];
  lines: readonly string[];
  mode: Mode;
  stopId: string | null;
}): URLSearchParams {
  const searchParams = new URLSearchParams({
    mode: input.mode,
  });
  if (input.coords) {
    searchParams.set("lat", String(input.coords.lat));
    searchParams.set("lon", String(input.coords.lon));
  }
  if (input.stopId) {
    searchParams.set("stopId", input.stopId);
  }
  if (input.lines.length > 0) {
    searchParams.set("line", input.lines.join(","));
  }
  if (input.destinations.length > 0) {
    searchParams.set("dest", input.destinations.join(","));
  }
  return searchParams;
}

export function createBrowserDeparturesClient(input: {
  fetchImpl?: typeof fetch;
} = {}): DeparturesClient {
  const fetchImpl = input.fetchImpl || fetch;

  return {
    async getDepartures({ coords, destinations, lineIntent = false, lines, mode, signal, stopId }) {
      const searchParams = buildDeparturesSearchParams({
        coords,
        destinations,
        lines,
        mode,
        stopId,
      });
      if (lineIntent) {
        searchParams.set("lineIntent", "1");
      }

      const response = await fetchImpl(`/api/v1/departures?${searchParams.toString()}`, {
        method: "GET",
        signal,
      });

      const payload = (await response.json()) as DeparturesSuccessResponse | ErrorPayload;
      if (!response.ok) {
        throw new Error(isErrorPayload(payload) ? (payload.error || "Could not load departures.") : "Could not load departures.");
      }

      return payload as DeparturesSuccessResponse;
    },
  };
}
