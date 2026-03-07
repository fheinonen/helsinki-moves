import type { DigitransitService } from "../digitransit/types.js";
import type { GeocodeLocation } from "../../../shared/contracts/geocode-contract.js";

const DIGITRANSIT_GEOCODING_ENDPOINT = "https://api.digitransit.fi/geocoding/v1/search";
const HSL_STOP_VALIDATION_RADIUS_METERS = 2500;
const REQUEST_TIMEOUT_MS = 7000;

export interface RawGeocodeCandidate extends GeocodeLocation {
  queryVariant?: string;
  variantIndex?: number;
}

function isValidLatLon(lat: number, lon: number): boolean {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function buildGeocodingUrl(input: {
  biasLat: number;
  biasLon: number;
  lang: string | null;
  query: string;
}): string {
  const params = new URLSearchParams();
  params.set("text", input.query);
  params.set("size", "5");
  params.set("boundary.country", "FI");
  params.set("focus.point.lat", String(input.biasLat));
  params.set("focus.point.lon", String(input.biasLon));
  if (input.lang) {
    params.set("lang", input.lang);
  }
  return `${DIGITRANSIT_GEOCODING_ENDPOINT}?${params.toString()}`;
}

function parseFeature(feature: unknown): GeocodeLocation | null {
  const coordinates = (feature as { geometry?: { coordinates?: unknown[] } })?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (!isValidLatLon(latitude, longitude)) {
    return null;
  }

  const properties = (feature as { properties?: Record<string, unknown> })?.properties || {};
  const label = String(
    properties.label ||
      properties.name ||
      [properties.locality, properties.region].filter(Boolean).join(", ")
  ).trim();
  const confidenceRaw = Number(properties.confidence);

  return {
    confidence: Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : null,
    label,
    latitude,
    longitude,
  };
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    throw new Error(`Digitransit geocoding invalid response (HTTP ${response.status})`);
  }
}

export async function geocode(input: {
  biasLat: number;
  biasLon: number;
  fetchImpl?: typeof fetch;
  getApiKey?: () => string | undefined;
  lang: string | null;
  query: string;
  timeoutMs?: number;
}): Promise<GeocodeLocation[]> {
  const fetchImpl = input.fetchImpl || fetch;
  const getApiKey = input.getApiKey || (() => process.env.DIGITRANSIT_API_KEY);
  const apiKey = getApiKey();
  const timeoutMs = input.timeoutMs || REQUEST_TIMEOUT_MS;
  if (!apiKey) {
    throw new Error("Missing DIGITRANSIT_API_KEY environment variable.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(
      buildGeocodingUrl({
        biasLat: input.biasLat,
        biasLon: input.biasLon,
        lang: input.lang,
        query: input.query,
      }),
      {
        method: "GET",
        headers: {
          accept: "application/json",
          "digitransit-subscription-key": apiKey,
        },
        signal: controller.signal,
      }
    );
    const json = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(`Digitransit geocoding HTTP ${response.status}`);
    }

    return (Array.isArray(json.features) ? json.features : [])
      .map(parseFeature)
      .filter((candidate): candidate is GeocodeLocation => candidate != null);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Digitransit geocoding request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function filterHslValidCandidates(
  candidates: RawGeocodeCandidate[],
  digitransitService: DigitransitService
): Promise<RawGeocodeCandidate[]> {
  const stopValidationCache = new Map<string, boolean>();
  const valid: RawGeocodeCandidate[] = [];

  for (const candidate of candidates) {
    const cacheKey = `${candidate.latitude.toFixed(6)},${candidate.longitude.toFixed(6)}`;
    let isValid = stopValidationCache.get(cacheKey);
    if (isValid == null) {
      const stops = await digitransitService.getNearbyStops({
        lat: candidate.latitude,
        lon: candidate.longitude,
        radius: HSL_STOP_VALIDATION_RADIUS_METERS,
      });
      isValid = stops.length > 0;
      stopValidationCache.set(cacheKey, isValid);
    }
    if (isValid) {
      valid.push(candidate);
    }
  }

  return valid;
}
