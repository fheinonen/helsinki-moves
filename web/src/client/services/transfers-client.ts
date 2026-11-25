import type { Mode } from "@shared/domain/mode";
import type { TransfersResponse } from "@shared/domain/transfer";

export interface FetchTransfersInput {
  arrivalIso: string;
  fetchImpl?: typeof fetch;
  lat: number;
  lon: number;
  mode?: Mode | null;
  rideMode: Mode;
  signal?: AbortSignal;
}

export type TransfersFetcher = (input: {
  arrivalIso: string;
  lat: number;
  lon: number;
  mode?: Mode | null;
  rideMode: Mode;
  signal?: AbortSignal;
}) => Promise<TransfersResponse | null>;

export function transfersUrl(input: {
  arrivalIso: string;
  lat: number;
  lon: number;
  mode?: Mode | null;
  rideMode: Mode;
}): string {
  const params = new URLSearchParams({
    arrivalIso: input.arrivalIso,
    lat: String(input.lat),
    lon: String(input.lon),
    rideMode: input.rideMode,
  });
  if (input.mode) {
    params.set("mode", input.mode);
  }
  return `/api/v1/transfers?${params.toString()}`;
}

export async function fetchTransfers(input: FetchTransfersInput): Promise<TransfersResponse | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(transfersUrl(input), {
    headers: { accept: "application/json" },
    signal: input.signal,
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as TransfersResponse;
}
