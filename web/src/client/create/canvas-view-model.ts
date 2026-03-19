import type { NormalizedAlert } from "@shared/contracts/alerts-contract";
import type { CanvasType } from "./canvas-types";
import type { RoutePolicy } from "./intent-session";

export interface ItineraryLegViewModel {
  destination: string;
  from: string;
  line: string;
  mode: string;
  timeRangeLabel?: string;
  to: string;
}

export interface RouteRecommendationViewModel {
  destination: string;
  interchangeStopName?: string;
  itineraryLegs?: ItineraryLegViewModel[];
  itinerarySummary?: string;
  line: string;
  minutes: number;
  routeId?: string | null;
  stopCode: string | null;
  stopName: string;
  transfers?: number;
  walkingMeters: number;
}

export interface ViableAlternativeViewModel {
  distanceMeters: number;
  stopCode: string | null;
  stopName: string;
}

export type NoRouteReason = "generic" | "policy_restricted" | "service_disruption";

interface BaseRouteCanvasViewModel {
  alerts?: NormalizedAlert[];
  canvasType: CanvasType;
  degraded: boolean;
  policy: RoutePolicy;
  title: string;
}

export interface ReadyRouteCanvasViewModel extends BaseRouteCanvasViewModel {
  backup: RouteRecommendationViewModel | null;
  primary: RouteRecommendationViewModel;
  state: "ready";
}

export interface NoRouteCanvasViewModel extends BaseRouteCanvasViewModel {
  alternatives: ViableAlternativeViewModel[];
  reason: NoRouteReason;
  state: "no_route";
}

export type RouteCanvasViewModel = NoRouteCanvasViewModel | ReadyRouteCanvasViewModel;
