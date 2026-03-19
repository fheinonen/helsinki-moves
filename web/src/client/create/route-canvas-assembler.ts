import type { NormalizedAlert } from "@shared/contracts/alerts-contract";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { RouteItinerary } from "@shared/contracts/routes-contract";
import type { RoutePolicy } from "./intent-session";
import type {
  ItineraryLegViewModel,
  NoRouteReason,
  RouteCanvasViewModel,
  RouteRecommendationViewModel,
  ViableAlternativeViewModel,
} from "./canvas-view-model";

interface AssembleRouteCanvasInput {
  alerts?: NormalizedAlert[];
  disruptionConfidenceAvailable?: boolean;
  nowMs: number;
  policy: RoutePolicy;
  responses: DeparturesSuccessResponse[];
  title: string;
}

interface AssemblePlannedRouteCanvasInput {
  alerts?: NormalizedAlert[];
  canvasType: "destination_route" | "home_fast";
  disruptionConfidenceAvailable?: boolean;
  itineraries: RouteItinerary[];
  nowMs: number;
  policy: RoutePolicy;
  supportingResponses?: DeparturesSuccessResponse[];
  title: string;
}

interface CandidateRoute {
  departureIso: string;
  destination: string;
  line: string;
  minutes: number;
  sortKey: number;
  stopCode: string | null;
  stopName: string;
  walkingMeters: number;
}

function toMinutes(departureIso: string, nowMs: number): number {
  return Math.max(0, Math.floor((Date.parse(departureIso) - nowMs) / 60_000));
}

function toTimeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(11, 16);
}

function toSortKey(candidate: CandidateRoute, policy: RoutePolicy): number {
  if (policy === "least_walking") {
    return candidate.walkingMeters * 10_000 + candidate.minutes;
  }
  if (policy === "fewest_transfers") {
    return candidate.minutes;
  }
  return candidate.minutes;
}

function collectCandidates(input: {
  nowMs: number;
  policy: RoutePolicy;
  responses: DeparturesSuccessResponse[];
}): CandidateRoute[] {
  return input.responses.flatMap((response) => {
    const station = response.station;
    if (!station) {
      return [];
    }
    return station.departures.map((departure): CandidateRoute => {
      const minutes = toMinutes(departure.departureIso, input.nowMs);
      const candidate: CandidateRoute = {
        departureIso: departure.departureIso,
        destination: departure.destination,
        line: departure.line,
        minutes,
        sortKey: 0,
        stopCode: departure.stopCode ?? station.stopCode ?? null,
        stopName: departure.stopName ?? station.stopName,
        walkingMeters: station.distanceMeters,
      };
      return {
        ...candidate,
        sortKey: toSortKey(candidate, input.policy),
      };
    });
  });
}

function compareCandidates(left: CandidateRoute, right: CandidateRoute): number {
  return (
    left.sortKey - right.sortKey ||
    left.minutes - right.minutes ||
    left.walkingMeters - right.walkingMeters ||
    left.line.localeCompare(right.line) ||
    left.departureIso.localeCompare(right.departureIso)
  );
}

function toRecommendation(candidate: CandidateRoute): RouteRecommendationViewModel {
  return {
    destination: candidate.destination,
    line: candidate.line,
    minutes: candidate.minutes,
    routeId: null,
    stopCode: candidate.stopCode,
    stopName: candidate.stopName,
    walkingMeters: candidate.walkingMeters,
  };
}

function toItinerarySortKey(itinerary: RouteItinerary, policy: RoutePolicy): number {
  if (policy === "least_walking") {
    return itinerary.walkDistanceMeters * 10_000 + itinerary.durationSeconds;
  }
  if (policy === "fewest_transfers") {
    return itinerary.transfers * 10_000 + itinerary.durationSeconds;
  }
  return itinerary.durationSeconds;
}

function compareItineraries(left: RouteItinerary, right: RouteItinerary, policy: RoutePolicy): number {
  return (
    toItinerarySortKey(left, policy) - toItinerarySortKey(right, policy) ||
    Date.parse(left.startTimeIso) - Date.parse(right.startTimeIso) ||
    left.walkDistanceMeters - right.walkDistanceMeters ||
    left.id.localeCompare(right.id)
  );
}

function toRecommendationFromItinerary(
  itinerary: RouteItinerary,
  input: { nowMs: number; title: string }
): RouteRecommendationViewModel {
  const transitLeg =
    itinerary.legs.find((leg) => leg.mode !== "WALK" && leg.line) || itinerary.legs[0];
  const transitLines = itinerary.legs
    .filter((leg) => leg.mode !== "WALK" && leg.line)
    .map((leg) => leg.line as string);
  const itineraryLegs: ItineraryLegViewModel[] = itinerary.legs
    .filter((leg) => leg.mode !== "WALK" && leg.line)
    .map((leg) => ({
      destination: leg.headsign || leg.arrivalStopName || input.title,
      from: leg.departureStopName || "Current location",
      line: leg.line || leg.mode,
      mode: leg.mode,
      timeRangeLabel: `${toTimeLabel(leg.startTimeIso)} to ${toTimeLabel(leg.endTimeIso)}`,
      to: leg.arrivalStopName || input.title,
    }));

  return {
    destination: transitLeg?.headsign || input.title,
    interchangeStopName: itineraryLegs.length > 1 ? itineraryLegs[0]?.to : undefined,
    itineraryLegs: itineraryLegs.length > 0 ? itineraryLegs : undefined,
    itinerarySummary: transitLines.length > 1 ? transitLines.join(" to ") : undefined,
    line: transitLeg?.line || transitLeg?.mode || "Walk",
    minutes: toMinutes(itinerary.startTimeIso, input.nowMs),
    routeId: transitLeg?.routeId || null,
    stopCode: null,
    stopName: transitLeg?.departureStopName || "Current location",
    transfers: itinerary.transfers,
    walkingMeters: itinerary.walkDistanceMeters,
  };
}

function collectAlternatives(responses: DeparturesSuccessResponse[]): ViableAlternativeViewModel[] {
  const seen = new Set<string>();
  const alternatives: ViableAlternativeViewModel[] = [];

  for (const response of responses) {
    for (const stop of response.stops) {
      const key = `${stop.id}:${stop.code || ""}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      alternatives.push({
        distanceMeters: stop.distanceMeters,
        stopCode: stop.code,
        stopName: stop.name,
      });
    }
  }

  return alternatives.sort(
    (left, right) =>
      left.distanceMeters - right.distanceMeters ||
      left.stopName.localeCompare(right.stopName)
  );
}

function hasDisruptiveNoRouteAlert(alerts?: NormalizedAlert[]): boolean {
  if (!alerts || alerts.length === 0) {
    return false;
  }

  return alerts.some(
    (alert) =>
      alert.effect === "NO_SERVICE" ||
      alert.effect === "SIGNIFICANT_DELAYS" ||
      (alert.severityLevel === "SEVERE" && alert.effect !== "REDUCED_SERVICE")
  );
}

function toNoRouteReason(input: {
  alerts?: NormalizedAlert[];
  policy: RoutePolicy;
}): NoRouteReason {
  if (input.policy !== "fastest") {
    return "policy_restricted";
  }
  if (hasDisruptiveNoRouteAlert(input.alerts)) {
    return "service_disruption";
  }
  return "generic";
}

function assembleRouteCanvas(
  input: AssembleRouteCanvasInput & { canvasType: "destination_route" | "home_fast" }
): RouteCanvasViewModel {
  const candidates = collectCandidates({
    nowMs: input.nowMs,
    policy: input.policy,
    responses: input.responses,
  }).sort(compareCandidates);

  if (candidates.length === 0) {
    return {
      alternatives: collectAlternatives(input.responses),
      alerts: input.alerts,
      canvasType: input.canvasType,
      degraded: input.disruptionConfidenceAvailable === false,
      policy: input.policy,
      reason: toNoRouteReason({
        alerts: input.alerts,
        policy: input.policy,
      }),
      state: "no_route",
      title: input.title,
    };
  }

  return {
    backup: candidates[1] ? toRecommendation(candidates[1]) : null,
    alerts: input.alerts,
    canvasType: input.canvasType,
    degraded: input.disruptionConfidenceAvailable === false,
    policy: input.policy,
    primary: toRecommendation(candidates[0]),
    state: "ready",
    title: input.title,
  };
}

export type { RouteCanvasViewModel } from "./canvas-view-model";

export function assembleHomeRouteCanvas(
  input: Omit<AssembleRouteCanvasInput, "title">
): RouteCanvasViewModel {
  return assembleRouteCanvas({
    ...input,
    canvasType: "home_fast",
    title: "Home",
  });
}

export function assembleDestinationRouteCanvas(
  input: AssembleRouteCanvasInput
): RouteCanvasViewModel {
  return assembleRouteCanvas({
    ...input,
    canvasType: "destination_route",
  });
}

export function assemblePlannedRouteCanvas(
  input: AssemblePlannedRouteCanvasInput
): RouteCanvasViewModel {
  const itineraries = [...input.itineraries].sort((left, right) =>
    compareItineraries(left, right, input.policy)
  );

  if (itineraries.length === 0) {
    return {
      alternatives: collectAlternatives(input.supportingResponses || []),
      alerts: input.alerts,
      canvasType: input.canvasType,
      degraded: input.disruptionConfidenceAvailable === false,
      policy: input.policy,
      reason: toNoRouteReason({
        alerts: input.alerts,
        policy: input.policy,
      }),
      state: "no_route",
      title: input.title,
    };
  }

  return {
    backup: itineraries[1]
      ? toRecommendationFromItinerary(itineraries[1], {
          nowMs: input.nowMs,
          title: input.title,
        })
      : null,
    alerts: input.alerts,
    canvasType: input.canvasType,
    degraded: input.disruptionConfidenceAvailable === false,
    policy: input.policy,
    primary: toRecommendationFromItinerary(itineraries[0], {
      nowMs: input.nowMs,
      title: input.title,
    }),
    state: "ready",
    title: input.title,
  };
}
