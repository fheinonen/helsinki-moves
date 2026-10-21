import type { DepartureFetchWindow } from "../glance/glance-horizon.js";
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
