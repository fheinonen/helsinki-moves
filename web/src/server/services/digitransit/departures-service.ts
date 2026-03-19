import type {
  DeparturesRequest,
  DeparturesSuccessResponse,
  DestinationResolution,
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
import type {
  DestinationCorrectionService,
  DestinationCorrectionSuggestion,
} from "./destination-correction-service.js";

const SEARCH_RADIUS_METERS = 1200;
const AUTO_CORRECT_CONFIDENCE_THRESHOLD = 0.9;
const AUTO_CORRECT_MARGIN_THRESHOLD = 0.15;

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

function hasActiveFilters(request: DeparturesRequest): boolean {
  return request.lines.length > 0 || request.destinations.length > 0;
}

function pickBestVisibleStop(
  stops: Stop[],
  departuresByStopId: Map<string, Departure[]>,
  request: DeparturesRequest
): Stop | null {
  for (const stop of stops) {
    const departures = mergeDeparturesForStopIds(departuresByStopId, stop.memberStopIds);
    const visibleDepartures = hasActiveFilters(request)
      ? filterDeparturesBySelections(departures, {
          destinations: request.destinations,
          lines: request.lines,
        })
      : departures;
    if (visibleDepartures.length > 0) {
      return stop;
    }
  }
  return stops[0] || null;
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
    private readonly destinationCorrectionService?: DestinationCorrectionService
  ) {}

  private async resolveDestinationCorrection(input: {
    allDepartures: Departure[];
    request: DeparturesRequest;
    selectableStops: Stop[];
  }): Promise<
    | { correctedDestination: string; resolution: DestinationResolution; type: "auto-corrected" }
    | { resolution: DestinationResolution; type: "needs-clarification" }
    | null
  > {
    if (!this.destinationCorrectionService || input.request.destinations.length !== 1) {
      return null;
    }

    const candidates = [...new Set(input.allDepartures.map((departure) => departure.destination).filter(Boolean))];
    if (candidates.length === 0) {
      return null;
    }

    let suggestions: DestinationCorrectionSuggestion[] = [];
    try {
      suggestions = await this.destinationCorrectionService.suggest({
        candidates,
        destination: input.request.destinations[0],
        mode: input.request.mode,
        nearbyStopNames: input.selectableStops.map((stop) => stop.name).slice(0, 5),
      });
    } catch {
      return null;
    }

    const [top, second] = suggestions;
    if (!top) {
      return null;
    }

    if (
      top.confidence >= AUTO_CORRECT_CONFIDENCE_THRESHOLD &&
      top.confidence - (second?.confidence || 0) >= AUTO_CORRECT_MARGIN_THRESHOLD
    ) {
      return {
        correctedDestination: top.candidate,
        resolution: {
          confidence: top.confidence,
          input: input.request.destinations[0],
          resolved: top.candidate,
          type: "auto-corrected",
        },
        type: "auto-corrected",
      };
    }

    return {
      resolution: {
        confidence: top.confidence,
        input: input.request.destinations[0],
        suggestions: suggestions.map((suggestion) => suggestion.candidate),
        type: "needs-clarification",
      },
      type: "needs-clarification",
    };
  }

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
    const initialSelectedStop = selectStop(selectableStops, request.stopId);
    if (!initialSelectedStop) {
      return buildEmptyResponse(request.mode);
    }

    const stopIdsToLoad =
      !request.stopId
        ? [...new Set(selectableStops.flatMap((stop) => stop.memberStopIds))]
        : initialSelectedStop.memberStopIds;
    const departuresByStopId = await this.digitransitService.getDeparturesForStopIds(
      stopIdsToLoad,
      {
        mode: request.mode,
        resultLimit: request.requestedResultLimit,
      }
    );

    let selectedStop =
      !request.stopId
        ? pickBestVisibleStop(selectableStops, departuresByStopId, request)
        : initialSelectedStop;
    if (!selectedStop) {
      return buildEmptyResponse(request.mode);
    }
    const allLoadedDepartures = mergeDeparturesForStopIds(
      departuresByStopId,
      [...new Set(selectableStops.flatMap((stop) => stop.memberStopIds))]
    );
    let allDepartures = mergeDeparturesForStopIds(departuresByStopId, selectedStop.memberStopIds);
    let visibleDepartures = filterDeparturesBySelections(allDepartures, {
      destinations: request.destinations,
      lines: request.lines,
    }).slice(0, request.requestedResultLimit);
    let destinationResolution: DestinationResolution | undefined;

    if (visibleDepartures.length === 0 && request.destinations.length > 0) {
      const correction = await this.resolveDestinationCorrection({
        allDepartures: allLoadedDepartures,
        request,
        selectableStops,
      });

      if (correction?.type === "auto-corrected") {
        destinationResolution = correction.resolution;
        const correctedRequest = {
          ...request,
          destinations: [correction.correctedDestination],
        };
        selectedStop = !request.stopId
          ? pickBestVisibleStop(selectableStops, departuresByStopId, correctedRequest)
          : selectedStop;
        if (selectedStop) {
          allDepartures = mergeDeparturesForStopIds(departuresByStopId, selectedStop.memberStopIds);
          visibleDepartures = filterDeparturesBySelections(allDepartures, {
            destinations: correctedRequest.destinations,
            lines: correctedRequest.lines,
          }).slice(0, correctedRequest.requestedResultLimit);
        }
      } else if (correction?.type === "needs-clarification") {
        destinationResolution = correction.resolution;
      }
    }

    if (!selectedStop) {
      return buildEmptyResponse(request.mode);
    }

    return {
      destinationResolution,
      filterOptions: buildFilterOptions(allDepartures),
      mode: request.mode,
      selectedStopId: selectedStop.id,
      station: buildStation(selectedStop, visibleDepartures),
      stops: selectableStops,
    };
  }
}
