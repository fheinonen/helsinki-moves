import { type Mode } from "../domain/mode.js";
import { type Departure } from "../domain/departure.js";
import { type FilterOption } from "../domain/filter.js";
import { type Stop } from "../domain/stop.js";

export interface DeparturesRequest {
  destinations: string[];
  lat: number;
  lineIntentRequested: boolean;
  lines: string[];
  lon: number;
  mode: Mode;
  requestedResultLimit: number;
  stopId: string | null;
}

export interface DeparturesErrorResponse {
  error: string;
}

export interface StopStation {
  departures: Departure[];
  distanceMeters: number;
  stopCode: string | null;
  stopCodes: string[];
  stopName: string;
  type: "stop";
}

export interface DestinationResolution {
  confidence: number | null;
  input: string;
  resolved?: string;
  suggestions?: string[];
  type: "auto-corrected" | "needs-clarification";
}

export interface DeparturesSuccessResponse {
  destinationResolution?: DestinationResolution;
  filterOptions: {
    destinations: FilterOption[];
    lines: FilterOption[];
  };
  message?: string;
  mode: Mode;
  selectedStopId: string | null;
  station: StopStation | null;
  stops: Stop[];
}
