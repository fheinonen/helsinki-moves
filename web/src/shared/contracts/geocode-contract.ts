export interface GeocodeLocation {
  confidence: number | null;
  label: string;
  latitude: number;
  longitude: number;
}

export interface GeocodeRequest {
  biasLat: number;
  biasLon: number;
  lang: string | null;
  query: string;
}

export interface GeocodeErrorResponse {
  error: string;
}

export interface GeocodeSuccessResponse {
  ambiguous: boolean;
  choices: GeocodeLocation[];
  location: GeocodeLocation | null;
  message?: string;
  query: string;
}
