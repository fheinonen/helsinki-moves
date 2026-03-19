import type {
  TravelIntentErrorResponse,
  TravelIntentSuccessResponse,
} from "@shared/contracts/travel-intent-contract";

export interface TravelIntentClient {
  parse(input: { prompt: string }): Promise<TravelIntentSuccessResponse>;
}

function isErrorPayload(value: unknown): value is TravelIntentErrorResponse {
  return typeof value === "object" && value !== null && "error" in value;
}

export function createBrowserTravelIntentClient(input: {
  fetchImpl?: typeof fetch;
} = {}): TravelIntentClient {
  const fetchImpl = input.fetchImpl || fetch;

  return {
    async parse({ prompt }) {
      const response = await fetchImpl("/api/v1/travel-intent", {
        body: JSON.stringify({ prompt }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json()) as TravelIntentSuccessResponse | TravelIntentErrorResponse;
      if (!response.ok) {
        throw new Error(
          isErrorPayload(payload) ? payload.error || "Could not parse travel intent" : "Could not parse travel intent"
        );
      }
      return payload as TravelIntentSuccessResponse;
    },
  };
}
