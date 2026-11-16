import type {
  DeparturesRequest,
  DeparturesSuccessResponse,
  LaterDeparturesResponse,
  StopStation,
} from "../../../shared/contracts/departures-contract.js";
import { getNoNearbyStopsMessage, getUpstreamMode, type Mode } from "../../../shared/domain/mode.js";
import type { Stop } from "../../../shared/domain/stop.js";
import {
  buildFilterOptions,
  buildSelectableStops,
  filterDeparturesBySelections,
} from "./departures-normalizer.js";
import type { DigitransitService, NearbyStopNode } from "./types.js";
import type { Departure } from "../../../shared/domain/departure.js";
import type { BoardCursor } from "../../../shared/domain/board-rank.js";
import {
  continuationFetchWindow,
  departureFetchWindow,
  selectGlanceDepartures,
  selectLaterDepartures,
  type DepartureFetchWindow,
} from "../glance/glance-horizon.js";

const SEARCH_RADIUS_METERS = 1200;

function buildEmptyResponse(mode: Mode): DeparturesSuccessResponse {
  return {
    filterOptions: {
      destinations: [],
      lines: [],
    },
    message: getNoNearbyStopsMessage(mode),
    mode,
    selectedStopId: null,
    station: null,
    stops: [],
  };
}

function compareDeparturesByTime(left: Departure, right: Departure): number {
  return new Date(left.departureIso).getTime() - new Date(right.departureIso).getTime();
}

function filterModeStops(nearbyStops: NearbyStopNode[], upstreamMode: string): NearbyStopNode[] {
  return nearbyStops
    .filter((node) => (node.stop.vehicleMode || "").toUpperCase() === upstreamMode)
    .sort((left, right) => left.distance - right.distance);
}

function mergeDeparturesForStopIds(
  departuresByStopId: Map<string, Departure[]>,
  stopIds: string[]
): Departure[] {
  return stopIds.flatMap((stopId) => departuresByStopId.get(stopId) || []).sort(compareDeparturesByTime);
}

function selectStop(stops: Stop[], requestedStopId: string | null): Stop | null {
  if (!requestedStopId) {
    return stops[0] || null;
  }

  return (
    stops.find((stop) => stop.id === requestedStopId) ||
    stops.find((stop) => stop.memberStopIds.includes(requestedStopId)) ||
    stops[0] ||
    null
  );
}

function buildStation(stop: Stop, departures: Departure[]): StopStation {
  return {
    departures,
    distanceMeters: stop.distanceMeters,
    stopCode: stop.code,
    stopCodes: stop.stopCodes,
    stopName: stop.name,
    type: "stop",
  };
}

function readRequestOrigin(request: DeparturesRequest): { lat: number; lon: number } | null {
  if (request.lat == null || request.lon == null) {
    return null;
  }
  return { lat: request.lat, lon: request.lon };
}

async function resolveSearchOrigin(
  service: DigitransitService,
  request: DeparturesRequest,
): Promise<{ lat: number; lon: number } | null> {
  const requestOrigin = readRequestOrigin(request);
  if (requestOrigin) {
    return requestOrigin;
  }
  if (!request.stopId || !service.getStopPoint) {
    return null;
  }
  return service.getStopPoint(request.stopId);
}

interface LoadedDepartures {
  departures: Departure[];
  selectedStop: Stop;
  stops: Stop[];
}

function requestSelections(request: DeparturesRequest): { destinations: string[]; lines: string[] } {
  return {
    destinations: request.destinations,
    lines: request.lines,
  };
}

export class DeparturesService {
  constructor(
    private readonly digitransitService: DigitransitService,
    private readonly now: () => number = Date.now,
  ) {}

  async execute(request: DeparturesRequest): Promise<DeparturesSuccessResponse> {
    const nowMs = this.now();
    const loaded = await this.loadMergedDepartures(request, departureFetchWindow(request.mode, nowMs));
    if (!loaded) {
      return buildEmptyResponse(request.mode);
    }

    return {
      filterOptions: buildFilterOptions(loaded.departures),
      mode: request.mode,
      selectedStopId: loaded.selectedStop.id,
      station: buildStation(
        loaded.selectedStop,
        selectGlanceDepartures({
          departures: filterDeparturesBySelections(loaded.departures, requestSelections(request)),
          mode: request.mode,
          nowMs,
        })
      ),
      stops: loaded.stops,
    };
  }

  async executeLater(request: DeparturesRequest, after: BoardCursor): Promise<LaterDeparturesResponse> {
    const nowMs = this.now();
    const loaded = await this.loadMergedDepartures(
      request,
      continuationFetchWindow(request.mode, nowMs, after)
    );
    if (!loaded) {
      return { departures: [] };
    }

    return {
      departures: selectLaterDepartures({
        after,
        departures: filterDeparturesBySelections(loaded.departures, requestSelections(request)),
        mode: request.mode,
        nowMs,
      }),
    };
  }

  private async loadMergedDepartures(
    request: DeparturesRequest,
    fetchWindow: DepartureFetchWindow
  ): Promise<LoadedDepartures | null> {
    const origin = await resolveSearchOrigin(this.digitransitService, request);
    if (!origin) {
      return null;
    }

    const nearbyStops = await this.digitransitService.getNearbyStops({
      lat: origin.lat,
      lon: origin.lon,
      radius: SEARCH_RADIUS_METERS,
    });
    const modeStops = filterModeStops(nearbyStops, getUpstreamMode(request.mode));
    if (modeStops.length === 0) {
      return null;
    }

    const stops = buildSelectableStops(modeStops);
    const selectedStop = selectStop(stops, request.stopId);
    if (!selectedStop) {
      return null;
    }

    const departuresByStopId = await this.digitransitService.getDeparturesForStopIds(
      selectedStop.memberStopIds,
      {
        fetchWindow,
        mode: request.mode,
      }
    );
    return {
      departures: mergeDeparturesForStopIds(departuresByStopId, selectedStop.memberStopIds),
      selectedStop,
      stops,
    };
  }
}
