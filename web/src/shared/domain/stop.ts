export interface Stop {
  code: string | null;
  distanceMeters: number;
  id: string;
  memberStopIds: string[];
  name: string;
  stopCodes: string[];
}
