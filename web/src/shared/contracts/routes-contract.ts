export type RoutePlanningPolicy = "fastest" | "fewest_transfers" | "least_walking";

export interface RoutePlanRequest {
  fromLat: number;
  fromLon: number;
  policy: RoutePlanningPolicy;
  toLat: number;
  toLon: number;
}

export interface RouteLeg {
  arrivalPlatform: string | null;
  arrivalStopName: string | null;
  departurePlatform: string | null;
  departureStopName: string | null;
  endTimeIso: string;
  headsign: string | null;
  line: string | null;
  mode: string;
  routeId?: string | null;
  startTimeIso: string;
}

export interface RouteItinerary {
  durationSeconds: number;
  endTimeIso: string;
  id: string;
  legs: RouteLeg[];
  startTimeIso: string;
  transfers: number;
  walkDistanceMeters: number;
}

export interface RoutePlanSuccessResponse {
  itineraries: RouteItinerary[];
  policy: RoutePlanningPolicy;
}

export interface RoutePlanErrorResponse {
  error: string;
}
