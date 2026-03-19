export interface AlertsRequest {
  routeIds: string[];
  stopIds: string[];
}

export interface NormalizedAlertEntity {
  routeId?: string | null;
  routeShortName?: string | null;
  stopCode?: string | null;
  stopId?: string | null;
  stopName?: string | null;
  tripHeadsign?: string | null;
  tripId?: string | null;
  type:
    | "agency"
    | "pattern"
    | "route"
    | "route_type"
    | "stop"
    | "stop_on_route"
    | "stop_on_trip"
    | "trip"
    | "unknown";
}

export interface NormalizedAlert {
  cause: string | null;
  descriptionText: string;
  effect: string | null;
  effectiveEndDate: number | null;
  effectiveStartDate: number | null;
  entities: NormalizedAlertEntity[];
  headerText: string | null;
  id: string;
  severityLevel: string | null;
}

export interface AlertsSuccessResponse {
  alerts: NormalizedAlert[];
}

export interface AlertsErrorResponse {
  error: string;
}
