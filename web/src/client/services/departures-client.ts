import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { Coordinates } from "@client/app/app-store";
import type { Mode } from "@shared/domain/mode";

export interface DeparturesClient {
  getDepartures(input: {
    coords: Coordinates;
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

export function createBrowserDeparturesClient(input: {
  fetchImpl?: typeof fetch;
} = {}): DeparturesClient {
  const fetchImpl = input.fetchImpl || fetch;

  return {
    async getDepartures({ coords, destinations, lineIntent = false, lines, mode, signal, stopId }) {
      const searchParams = new URLSearchParams({
        lat: String(coords.lat),
        lon: String(coords.lon),
        mode,
      });
      if (stopId) {
        searchParams.set("stopId", stopId);
      }
      if (lines.length > 0) {
        searchParams.set("line", lines.join(","));
      }
      if (destinations.length > 0) {
        searchParams.set("dest", destinations.join(","));
      }
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
