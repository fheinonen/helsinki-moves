import { error, ok, type Result } from "../../shared/utils/result.js";
import type { AlertsRequest } from "../../shared/contracts/alerts-contract.js";

type ValidationError = "missing filters";

function parseFilters(searchParams: URLSearchParams, key: "route" | "stop"): string[] {
  return [...new Set(
    searchParams
      .getAll(key)
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean)
  )];
}

export function validateAlertsRequest(
  searchParams: URLSearchParams
): Result<AlertsRequest, ValidationError> {
  const routeIds = parseFilters(searchParams, "route");
  const stopIds = parseFilters(searchParams, "stop");
  if (routeIds.length === 0 && stopIds.length === 0) {
    return error("missing filters");
  }
  return ok({ routeIds, stopIds });
}
