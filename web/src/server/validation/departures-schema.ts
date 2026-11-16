import { error, ok, type Result } from "../../shared/utils/result.js";
import { isMode, parseMode, type Mode } from "../../shared/domain/mode.js";
import { parseBoardCursor, type BoardCursor } from "../../shared/domain/board-rank.js";
import type { DeparturesRequest } from "../../shared/contracts/departures-contract.js";

export type DeparturesQuery =
  | { readonly kind: "glance"; readonly request: DeparturesRequest }
  | { readonly kind: "later"; readonly request: DeparturesRequest; readonly after: BoardCursor };

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

function classifyDeparturesQuery(
  searchParams: URLSearchParams,
  request: DeparturesRequest
): Result<DeparturesQuery, ValidationError> {
  if (!searchParams.has("after")) {
    return ok({ kind: "glance", request });
  }
  const after = parseBoardCursor(searchParams.get("after") ?? "");
  if (!after) {
    return error("invalid coordinates");
  }
  return ok({ kind: "later", request, after });
}

export function validateDeparturesRequest(
  searchParams: URLSearchParams
): Result<DeparturesQuery, ValidationError> {
  const stopId = searchParams.get("stopId")?.trim() || null;
  const hasLat = searchParams.has("lat");
  const hasLon = searchParams.has("lon");
  const lat = parseCoordinate(searchParams.get("lat"));
  const lon = parseCoordinate(searchParams.get("lon"));
  if (hasLat || hasLon) {
    if (lat == null || lon == null || !coordinatesAreValid(lat, lon)) {
      return error("invalid coordinates");
    }
  } else if (!stopId) {
    return error("invalid coordinates");
  }

  const rawMode = searchParams.get("mode");
  if (!isMode(rawMode)) {
    return error("invalid coordinates");
  }

  const mode: Mode = parseMode(rawMode);
  if (parseResultLimit(searchParams.get("results"), MIN_RESULT_LIMIT) == null) {
    return error("invalid coordinates");
  }

  return classifyDeparturesQuery(searchParams, {
    destinations: parseMultiValue(searchParams.get("dest")),
    lat,
    lines: parseMultiValue(searchParams.get("line")),
    lon,
    mode,
    stopId,
  });
}
