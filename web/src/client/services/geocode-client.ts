import type {
  GeocodeErrorResponse,
  GeocodeRequest,
  GeocodeSuccessResponse,
} from "@shared/contracts/geocode-contract";

export interface GeocodeClient {
  resolve(input: GeocodeRequest): Promise<GeocodeSuccessResponse>;
}

function isErrorPayload(value: unknown): value is GeocodeErrorResponse {
  return typeof value === "object" && value !== null && "error" in value;
}

export function createBrowserGeocodeClient(input: {
  fetchImpl?: typeof fetch;
} = {}): GeocodeClient {
  const fetchImpl = input.fetchImpl || fetch;

  return {
    async resolve(request) {
      const searchParams = new URLSearchParams({
        q: request.query,
      });
      searchParams.set("lat", String(request.biasLat));
      searchParams.set("lon", String(request.biasLon));
      if (request.lang) {
        searchParams.set("lang", request.lang);
      }

      const response = await fetchImpl(`/api/v1/geocode?${searchParams.toString()}`, {
        method: "GET",
      });

      const payload = (await response.json()) as GeocodeSuccessResponse | GeocodeErrorResponse;
      if (!response.ok) {
        throw new Error(
          isErrorPayload(payload)
            ? payload.error || "Could not approximate location. Please try again."
            : "Could not approximate location. Please try again."
        );
      }

      return payload as GeocodeSuccessResponse;
    },
  };
}
