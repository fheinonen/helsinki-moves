import type { Departure } from "../../../shared/domain/departure.js";
import type { Mode } from "../../../shared/domain/mode.js";
import type { AlertsRequest, NormalizedAlert } from "../../../shared/contracts/alerts-contract.js";
import type { RouteItinerary, RoutePlanRequest } from "../../../shared/contracts/routes-contract.js";

export interface NearbyStopNode {
  distance: number;
  stop: {
    code?: string;
    gtfsId: string;
    name: string;
    vehicleMode?: string;
  };
}

export interface DigitransitService {
  getDeparturesForStopIds(
    stopIds: string[],
    options: {
      mode: Mode;
      resultLimit: number;
    }
  ): Promise<Map<string, Departure[]>>;
  getNearbyStops(input: {
    lat: number;
    lon: number;
    radius: number;
  }): Promise<NearbyStopNode[]>;
  getAlerts?(input: AlertsRequest): Promise<NormalizedAlert[]>;
  getRoutes(input: RoutePlanRequest): Promise<RouteItinerary[]>;
}
