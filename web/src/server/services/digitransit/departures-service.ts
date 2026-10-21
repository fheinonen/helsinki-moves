import type {
  DeparturesRequest,
  DeparturesSuccessResponse,
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
import { departureFetchWindow, selectGlanceDepartures } from "../glance/glance-horizon.js";

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

export class DeparturesService {
  constructor(
    private readonly digitransitService: DigitransitService,
    private readonly now: () => number = Date.now,
  ) {}

  async execute(request: DeparturesRequest): Promise<DeparturesSuccessResponse> {
    const nearbyStops = await this.digitransitService.getNearbyStops({
      lat: request.lat,
      lon: request.lon,
      radius: SEARCH_RADIUS_METERS,
    });
    const modeStops = filterModeStops(nearbyStops, getUpstreamMode(request.mode));
    if (modeStops.length === 0) {
      return buildEmptyResponse(request.mode);
    }

    const selectableStops = buildSelectableStops(modeStops);
    const selectedStop = selectStop(selectableStops, request.stopId);
    if (!selectedStop) {
      return buildEmptyResponse(request.mode);
    }

    const nowMs = this.now();
    const selections = {
      destinations: request.destinations,
      lines: request.lines,
    };
    const departuresByStopId = await this.digitransitService.getDeparturesForStopIds(
      selectedStop.memberStopIds,
      {
        fetchWindow: departureFetchWindow(request.mode, nowMs),
        mode: request.mode,
      }
    );
    const allDepartures = mergeDeparturesForStopIds(departuresByStopId, selectedStop.memberStopIds);
    const visibleDepartures = selectGlanceDepartures({
      departures: filterDeparturesBySelections(allDepartures, selections),
      mode: request.mode,
      nowMs,
    });

    return {
      filterOptions: buildFilterOptions(allDepartures),
      mode: request.mode,
      selectedStopId: selectedStop.id,
      station: buildStation(selectedStop, visibleDepartures),
      stops: selectableStops,
    };
  }
}
