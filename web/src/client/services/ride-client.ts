import type { RideSnapshot } from "@shared/domain/ride";

export interface FetchRideInput {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  tripId: string;
}

export type RideFetcher = (input: {
  signal?: AbortSignal;
  tripId: string;
}) => Promise<RideSnapshot | null>;

export function rideSnapshotUrl(tripId: string): string {
  const params = new URLSearchParams({ tripId });
  return `/api/v1/ride?${params.toString()}`;
}

export async function fetchRideSnapshot(input: FetchRideInput): Promise<RideSnapshot | null> {
  const tripId = input.tripId.trim();
  if (!tripId) {
    return null;
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(rideSnapshotUrl(tripId), {
    headers: { accept: "application/json" },
    signal: input.signal,
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as RideSnapshot;
}
