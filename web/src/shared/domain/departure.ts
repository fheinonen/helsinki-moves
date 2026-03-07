export interface Departure {
  departureIso: string;
  destination: string;
  line: string;
  stopCode?: string | null;
  stopId?: string | null;
  stopName?: string | null;
  track?: string | null;
}
