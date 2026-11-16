import type { DeparturesSuccessResponse, LaterDeparturesResponse } from "@shared/contracts/departures-contract";
import type { Coordinates } from "@client/app/app-store";
import type { Mode } from "@shared/domain/mode";
import { formatBoardCursor, type BoardCursor } from "@shared/domain/board-rank";

export interface LaterDeparturesQuery {
  after: BoardCursor;
  coords: Coordinates | null;
  destinations: string[];
  lines: string[];
  mode: Mode;
  signal?: AbortSignal;
  stopId: string | null;
}

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
  getLaterDepartures(input: LaterDeparturesQuery): Promise<LaterDeparturesResponse>;
}

interface ErrorPayload {
  error?: string;
}

function isErrorPayload(value: unknown): value is ErrorPayload {
  return typeof value === "object" && value !== null && "error" in value;
}

function departureFailure(payload: unknown): string {
  if (!isErrorPayload(payload)) {
    return "Could not load departures.";
  }
  return payload.error || "Could not load departures.";
}

function appendBoardQuery(
  searchParams: URLSearchParams,
  input: {
    coords: Coordinates | null;
    destinations: string[];
    lines: string[];
    mode: Mode;
    stopId: string | null;
  }
): void {
  searchParams.set("mode", input.mode);
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
}

export function createBrowserDeparturesClient(input: {
  fetchImpl?: typeof fetch;
} = {}): DeparturesClient {
  const fetchImpl = input.fetchImpl || fetch;

  return {
    async getDepartures({ coords, destinations, lineIntent = false, lines, mode, signal, stopId }) {
      const searchParams = new URLSearchParams();
      appendBoardQuery(searchParams, { coords, destinations, lines, mode, stopId });
      if (lineIntent) {
        searchParams.set("lineIntent", "1");
      }

      const response = await fetchImpl(`/api/v1/departures?${searchParams.toString()}`, {
        method: "GET",
        signal,
      });

      const payload = (await response.json()) as DeparturesSuccessResponse | ErrorPayload;
      if (!response.ok) {
        throw new Error(departureFailure(payload));
      }

      return payload as DeparturesSuccessResponse;
    },
    async getLaterDepartures({ after, coords, destinations, lines, mode, signal, stopId }) {
      const searchParams = new URLSearchParams();
      appendBoardQuery(searchParams, { coords, destinations, lines, mode, stopId });
      searchParams.set("after", formatBoardCursor(after));

      const response = await fetchImpl(`/api/v1/departures?${searchParams.toString()}`, {
        method: "GET",
        signal,
      });

      const payload = (await response.json()) as LaterDeparturesResponse | ErrorPayload;
      if (!response.ok) {
        throw new Error(departureFailure(payload));
      }

      return payload as LaterDeparturesResponse;
    },
  };
}
