import {
  error,
  ok,
  type Result,
} from "../../shared/utils/result.js";
import type {
  GeocodeErrorResponse,
  GeocodeRequest,
} from "../../shared/contracts/geocode-contract.js";

const DEFAULT_BIAS_LAT = 60.1699;
const DEFAULT_BIAS_LON = 24.9384;
const MAX_LANG_LENGTH = 12;
const MAX_QUERY_LENGTH = 140;
const MIN_QUERY_LENGTH = 3;

type GeocodeValidationError = GeocodeErrorResponse["error"];

function parseCoordinate(raw: string | null): number | null {
  if (raw == null) {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidLatLon(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function normalizeLanguage(raw: string | null): string | null {
  const value = String(raw || "").trim().slice(0, MAX_LANG_LENGTH);
  if (!value) {
    return null;
  }

  return /^[a-z]{2,3}(?:-[A-Za-z]{2})?$/.test(value) ? value : null;
}

export function validateGeocodeRequest(
  searchParams: URLSearchParams
): Result<GeocodeRequest, GeocodeValidationError> {
  const query = String(searchParams.get("q") || "")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
  if (query.length < MIN_QUERY_LENGTH) {
    return error("invalid query");
  }

  const rawLat = parseCoordinate(searchParams.get("lat"));
  const rawLon = parseCoordinate(searchParams.get("lon"));
  const hasBiasInput = searchParams.has("lat") || searchParams.has("lon");
  if (hasBiasInput && (rawLat == null || rawLon == null || !isValidLatLon(rawLat, rawLon))) {
    return error("invalid coordinates");
  }

  const lang = normalizeLanguage(searchParams.get("lang"));
  if (searchParams.has("lang") && !lang) {
    return error("invalid language");
  }

  return ok({
    biasLat: hasBiasInput ? (rawLat as number) : DEFAULT_BIAS_LAT,
    biasLon: hasBiasInput ? (rawLon as number) : DEFAULT_BIAS_LON,
    lang,
    query,
  });
}
