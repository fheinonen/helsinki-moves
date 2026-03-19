import { error, ok, type Result } from "../../shared/utils/result.js";
import type {
  RoutePlanRequest,
  RoutePlanningPolicy,
} from "../../shared/contracts/routes-contract.js";

type ValidationError = "invalid coordinates";

function parseCoordinate(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function coordinatesAreValid(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function parsePolicy(value: string | null): RoutePlanningPolicy {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "least_walking") {
    return "least_walking";
  }
  if (normalized === "fewest_transfers") {
    return "fewest_transfers";
  }
  return "fastest";
}

export function validateRoutesRequest(
  searchParams: URLSearchParams
): Result<RoutePlanRequest, ValidationError> {
  const fromLat = parseCoordinate(searchParams.get("fromLat"));
  const fromLon = parseCoordinate(searchParams.get("fromLon"));
  const toLat = parseCoordinate(searchParams.get("toLat"));
  const toLon = parseCoordinate(searchParams.get("toLon"));

  if (
    fromLat == null ||
    fromLon == null ||
    toLat == null ||
    toLon == null ||
    !coordinatesAreValid(fromLat, fromLon) ||
    !coordinatesAreValid(toLat, toLon)
  ) {
    return error("invalid coordinates");
  }

  return ok({
    fromLat,
    fromLon,
    policy: parsePolicy(searchParams.get("policy")),
    toLat,
    toLon,
  });
}
