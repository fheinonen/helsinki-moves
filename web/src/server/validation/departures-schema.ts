import { error, ok, type Result } from "../../shared/utils/result.js";
import {
  getDefaultResultLimit,
  isMode,
  parseMode,
  type Mode,
} from "../../shared/domain/mode.js";
import type { DeparturesRequest } from "../../shared/contracts/departures-contract.js";

type ValidationError = "invalid coordinates";
const MAX_RESULT_LIMIT = 60;
const MIN_RESULT_LIMIT = 1;

function parseCoordinate(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function coordinatesAreValid(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function parseMultiValue(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function parseResultLimit(value: string | null, defaultValue: number): number | null {
  if (!value) {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return null;
  }
  if (parsed < MIN_RESULT_LIMIT || parsed > MAX_RESULT_LIMIT) {
    return null;
  }
  return parsed;
}

function parseLineIntentRequested(searchParams: URLSearchParams): boolean {
  const values = [searchParams.get("lineIntent"), searchParams.get("intent")];
  return values.some((value) => {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "line";
  });
}

export function validateDeparturesRequest(
  searchParams: URLSearchParams
): Result<DeparturesRequest, ValidationError> {
  const lat = parseCoordinate(searchParams.get("lat"));
  const lon = parseCoordinate(searchParams.get("lon"));
  if (lat == null || lon == null || !coordinatesAreValid(lat, lon)) {
    return error("invalid coordinates");
  }

  const rawMode = searchParams.get("mode");
  if (!isMode(rawMode)) {
    return error("invalid coordinates");
  }

  const mode: Mode = parseMode(rawMode);
  const requestedResultLimit = parseResultLimit(
    searchParams.get("results"),
    getDefaultResultLimit(mode)
  );
  if (requestedResultLimit == null) {
    return error("invalid coordinates");
  }

  return ok({
    destinations: parseMultiValue(searchParams.get("dest")),
    lat,
    lineIntentRequested: parseLineIntentRequested(searchParams),
    lines: parseMultiValue(searchParams.get("line")),
    lon,
    mode,
    requestedResultLimit,
    stopId: searchParams.get("stopId")?.trim() || null,
  });
}
