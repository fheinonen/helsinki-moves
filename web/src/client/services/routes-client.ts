import type {
  RoutePlanErrorResponse,
  RoutePlanRequest,
  RoutePlanSuccessResponse,
} from "@shared/contracts/routes-contract";

export interface RoutesClient {
  getRoutes(input: RoutePlanRequest & { signal?: AbortSignal }): Promise<RoutePlanSuccessResponse>;
}

function isErrorPayload(value: unknown): value is RoutePlanErrorResponse {
  return typeof value === "object" && value !== null && "error" in value;
}

export function createBrowserRoutesClient(input: {
  fetchImpl?: typeof fetch;
} = {}): RoutesClient {
  const fetchImpl = input.fetchImpl || fetch;

  return {
    async getRoutes({ signal, ...request }) {
      const searchParams = new URLSearchParams({
        fromLat: String(request.fromLat),
        fromLon: String(request.fromLon),
        policy: request.policy,
        toLat: String(request.toLat),
        toLon: String(request.toLon),
      });

      const response = await fetchImpl(`/api/v1/routes?${searchParams.toString()}`, {
        method: "GET",
        signal,
      });

      const payload = (await response.json()) as RoutePlanSuccessResponse | RoutePlanErrorResponse;
      if (!response.ok) {
        throw new Error(
          isErrorPayload(payload)
            ? payload.error || "Could not load routes."
            : "Could not load routes."
        );
      }

      return payload as RoutePlanSuccessResponse;
    },
  };
}
