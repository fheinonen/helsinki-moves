import type { AlertsSuccessResponse } from "@shared/contracts/alerts-contract";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { RouteItinerary, RoutePlanRequest } from "@shared/contracts/routes-contract";
import type { Coordinates } from "@client/app/app-store";
import type { RouteCanvasViewModel } from "./canvas-view-model";
import type { RoutePolicy } from "./intent-session";
import { preferredAlertDegradesConfidence } from "./route-alert-support";
import {
  assembleDestinationRouteCanvas,
  assemblePlannedRouteCanvas,
} from "./route-canvas-assembler";

export interface RouteCanvasDataState {
  alerts: AlertsSuccessResponse["alerts"];
  itineraries: RouteItinerary[] | null;
  responses: DeparturesSuccessResponse[];
  routeCanvas: RouteCanvasViewModel | null;
}

interface CreateRouteCanvasDataStateInput {
  alerts?: AlertsSuccessResponse["alerts"];
  itineraries?: RouteItinerary[] | null;
  nowMs: number;
  policy: RoutePolicy;
  responses: DeparturesSuccessResponse[];
  title: string;
}

interface ResolveRouteCanvasDataStateInput {
  fetchAlerts?: (input: { routeIds: string[]; stopIds: string[] }) => Promise<AlertsSuccessResponse>;
  fetchRoutes?: (input: RoutePlanRequest) => Promise<RouteItinerary[]>;
  nowMs: number;
  policy: RoutePolicy;
  responses: DeparturesSuccessResponse[];
  routeContext: {
    fromCoords: Coordinates;
    toCoords: Coordinates;
  } | null;
  title: string;
}

function isIntentCanvasPrompt(prompt: string): boolean {
  return /\b(?:let'?s go|get me|go to|take .* to|i want to go)\b/i.test(prompt);
}

function toRouteCanvasViewModel(input: CreateRouteCanvasDataStateInput): RouteCanvasViewModel | null {
  if (!isIntentCanvasPrompt(input.title) || input.responses.length === 0) {
    return null;
  }

  const routeCanvas =
    input.itineraries != null
      ? assemblePlannedRouteCanvas({
          alerts: input.alerts,
          canvasType: "destination_route",
          itineraries: input.itineraries,
          nowMs: input.nowMs,
          policy: input.policy,
          supportingResponses: input.responses,
          title: input.title,
        })
      : assembleDestinationRouteCanvas({
          alerts: input.alerts,
          nowMs: input.nowMs,
          policy: input.policy,
          responses: input.responses,
          title: input.title,
        });

  if (!preferredAlertDegradesConfidence(routeCanvas)) {
    return routeCanvas;
  }

  return {
    ...routeCanvas,
    degraded: true,
  };
}

function collectAlertLookupIds(input: {
  itineraries: RouteItinerary[];
  responses: DeparturesSuccessResponse[];
}): { routeIds: string[]; stopIds: string[] } {
  return {
    routeIds: [
      ...new Set(
        input.itineraries
          .flatMap((itinerary) => itinerary.legs)
          .map((leg) => leg.routeId)
          .filter((routeId): routeId is string => Boolean(routeId))
      ),
    ],
    stopIds: [
      ...new Set(
        input.responses
          .flatMap((response) => [
            response.selectedStopId,
            ...response.stops.map((stop) => stop.id),
          ])
          .filter((stopId): stopId is string => Boolean(stopId))
      ),
    ],
  };
}

export function createRouteCanvasEmptyState(): RouteCanvasDataState {
  return {
    alerts: [],
    itineraries: null,
    responses: [],
    routeCanvas: null,
  };
}

export function createRouteCanvasDataState(
  input: CreateRouteCanvasDataStateInput
): RouteCanvasDataState {
  const alerts = input.alerts || [];
  const itineraries = input.itineraries ?? null;
  return {
    alerts,
    itineraries,
    responses: input.responses,
    routeCanvas: toRouteCanvasViewModel({
      alerts,
      itineraries,
      nowMs: input.nowMs,
      policy: input.policy,
      responses: input.responses,
      title: input.title,
    }),
  };
}

export async function resolveRouteCanvasDataState(
  input: ResolveRouteCanvasDataStateInput
): Promise<RouteCanvasDataState> {
  let alerts: AlertsSuccessResponse["alerts"] = [];
  let itineraries: RouteItinerary[] | null = null;

  if (input.fetchRoutes && input.routeContext) {
    itineraries = await input.fetchRoutes({
      fromLat: input.routeContext.fromCoords.lat,
      fromLon: input.routeContext.fromCoords.lon,
      policy: input.policy,
      toLat: input.routeContext.toCoords.lat,
      toLon: input.routeContext.toCoords.lon,
    });

    if (input.fetchAlerts) {
      const lookup = collectAlertLookupIds({
        itineraries,
        responses: input.responses,
      });
      if (lookup.routeIds.length > 0 || lookup.stopIds.length > 0) {
        alerts = (await input.fetchAlerts(lookup)).alerts;
      }
    }
  }

  return createRouteCanvasDataState({
    alerts,
    itineraries,
    nowMs: input.nowMs,
    policy: input.policy,
    responses: input.responses,
    title: input.title,
  });
}
