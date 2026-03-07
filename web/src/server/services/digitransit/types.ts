import type { Departure } from "../../../shared/domain/departure.js";
import type { Mode } from "../../../shared/domain/mode.js";

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
}
