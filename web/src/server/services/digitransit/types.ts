import type { DepartureFetchWindow } from "../glance/glance-horizon.js";
import type { Departure } from "../../../shared/domain/departure.js";
import type { Mode } from "../../../shared/domain/mode.js";
import type { GeoPoint } from "../../../shared/domain/vehicle-span.js";
import type { WalkRoute } from "../../../shared/domain/walk-route.js";

export interface NearbyStopNode {
  distance: number;
  stop: {
    code?: string;
    gtfsId: string;
    lat?: number;
    lon?: number;
    name: string;
    vehicleMode?: string;
  };
}

export interface DigitransitService {
  getStopPoint?(stopId: string): Promise<{ lat: number; lon: number } | null>;
  planWalk?(origin: GeoPoint, stopId: string): Promise<WalkRoute | null>;
  getTripShape?(tripId: string): Promise<Array<{ lat: number; lon: number }>>;
  getVehicleFix?(tripId: string): Promise<{ lat: number; lon: number } | null>;
  getDeparturesForStopIds(
    stopIds: string[],
    options: {
      fetchWindow: DepartureFetchWindow;
      mode: Mode;
    }
  ): Promise<Map<string, Departure[]>>;
  getNearbyStops(input: {
    lat: number;
    lon: number;
    radius: number;
  }): Promise<NearbyStopNode[]>;
}
