import type { Mode } from "../domain/mode.js";

export interface TravelIntentRequest {
  destinations: string[];
  lines: string[];
  mode: Mode;
}

export interface TravelIntentSuccessResponse {
  locationQuery: string | null;
  requests: TravelIntentRequest[];
}

export interface TravelIntentErrorResponse {
  error: string;
}
