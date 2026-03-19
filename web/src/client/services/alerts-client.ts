import type {
  AlertsErrorResponse,
  AlertsRequest,
  AlertsSuccessResponse,
} from "@shared/contracts/alerts-contract";

export interface AlertsClient {
  getAlerts(input: AlertsRequest & { signal?: AbortSignal }): Promise<AlertsSuccessResponse>;
}

function isErrorPayload(value: unknown): value is AlertsErrorResponse {
  return typeof value === "object" && value !== null && "error" in value;
}

export function createBrowserAlertsClient(input: {
  fetchImpl?: typeof fetch;
} = {}): AlertsClient {
  const fetchImpl = input.fetchImpl || fetch;

  return {
    async getAlerts({ routeIds, signal, stopIds }) {
      const searchParams = new URLSearchParams();
      for (const routeId of routeIds) {
        searchParams.append("route", routeId);
      }
      for (const stopId of stopIds) {
        searchParams.append("stop", stopId);
      }

      const response = await fetchImpl(`/api/v1/alerts?${searchParams.toString()}`, {
        method: "GET",
        signal,
      });

      const payload = (await response.json()) as AlertsSuccessResponse | AlertsErrorResponse;
      if (!response.ok) {
        throw new Error(
          isErrorPayload(payload) ? payload.error || "Could not load alerts." : "Could not load alerts."
        );
      }

      return payload as AlertsSuccessResponse;
    },
  };
}
