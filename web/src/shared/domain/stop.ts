export interface Stop {
  code: string | null;
  distanceMeters: number;
  id: string;
  lat?: number;
  lon?: number;
  memberStopIds: string[];
  name: string;
  stopCodes: string[];
}
