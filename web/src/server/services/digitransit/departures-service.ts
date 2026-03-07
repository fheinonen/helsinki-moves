import type {
  DeparturesRequest,
  DeparturesSuccessResponse,
  StopStation,
} from "../../../shared/contracts/departures-contract.js";
import { getNoNearbyStopsMessage, getUpstreamMode } from "../../../shared/domain/mode.js";
import type { Stop } from "../../../shared/domain/stop.js";
import {
  buildFilterOptions,
  buildSelectableStops,
  filterDeparturesBySelections,
} from "./departures-normalizer.js";
import type { DigitransitService, NearbyStopNode } from "./types.js";
import type { Departure } from "../../../shared/domain/departure.js";

const SEARCH_RADIUS_METERS = 1200;

function filterModeStops(nearbyStops: NearbyStopNode[], upstreamMode: string): NearbyStopNode[] {
  return nearbyStops
    .filter((node) => (node.stop.vehicleMode || "").toUpperCase() === upstreamMode)
    .sort((left, right) => left.distance - right.distance);
}

function mergeDeparturesForStopIds(
  departuresByStopId: Map<string, Departure[]>,
  stopIds: string[]
): Departure[] {
  return stopIds.flatMap((stopId) => departuresByStopId.get(stopId) || []);
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
  constructor(private readonly digitransitService: DigitransitService) {}

  async execute(request: DeparturesRequest): Promise<DeparturesSuccessResponse> {
    const nearbyStops = await this.digitransitService.getNearbyStops({
      lat: request.lat,
      lon: request.lon,
      radius: SEARCH_RADIUS_METERS,
    });
    const modeStops = filterModeStops(nearbyStops, getUpstreamMode(request.mode));
    if (modeStops.length === 0) {
      return {
        filterOptions: {
          destinations: [],
          lines: [],
        },
        message: getNoNearbyStopsMessage(request.mode),
        mode: request.mode,
        selectedStopId: null,
        station: null,
        stops: [],
      };
    }

    const selectableStops = buildSelectableStops(modeStops);
    const selectedStop = selectStop(selectableStops, request.stopId);
    if (!selectedStop) {
      return {
        filterOptions: {
          destinations: [],
          lines: [],
        },
        message: getNoNearbyStopsMessage(request.mode),
        mode: request.mode,
        selectedStopId: null,
        station: null,
        stops: [],
      };
    }

    const departuresByStopId = await this.digitransitService.getDeparturesForStopIds(
      selectedStop.memberStopIds,
      {
        mode: request.mode,
        resultLimit: request.requestedResultLimit,
      }
    );
    const allDepartures = mergeDeparturesForStopIds(departuresByStopId, selectedStop.memberStopIds);
    const visibleDepartures = filterDeparturesBySelections(allDepartures, {
      destinations: request.destinations,
      lines: request.lines,
    }).slice(0, request.requestedResultLimit);

    return {
      filterOptions: buildFilterOptions(allDepartures),
      mode: request.mode,
      selectedStopId: selectedStop.id,
      station: buildStation(selectedStop, visibleDepartures),
      stops: selectableStops,
    };
  }
}
