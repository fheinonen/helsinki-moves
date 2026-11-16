import { parseWalkRoute, type WalkRequest, type WalkRoute } from "@shared/domain/walk-route";

export function walkUrl(request: WalkRequest): string {
  const params = new URLSearchParams({
    lat: String(request.lat),
    lon: String(request.lon),
    stopId: request.stopId,
  });
  return `/api/v1/walk?${params.toString()}`;
}

export async function fetchWalkRoute(
  request: WalkRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<WalkRoute | null> {
  try {
    const response = await fetchImpl(walkUrl(request));
    if (!response.ok) {
      return null;
    }
    return parseWalkRoute(await response.json());
  } catch {
    return null;
  }
}
