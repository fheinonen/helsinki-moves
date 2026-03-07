const { graphqlRequest, nearbyStopsQuery } = require("./digitransit");
const { safeString, isValidLatLon } = require("./geocode-query");

const DIGITRANSIT_GEOCODING_ENDPOINT = "https://api.digitransit.fi/geocoding/v1/search";
const REQUEST_TIMEOUT_MS = 7000;
const HSL_STOP_VALIDATION_RADIUS_METERS = 2500;

function getGeocodingUrl({ text, biasLat, biasLon, lang }) {
  const params = new URLSearchParams();
  params.set("text", text);
  params.set("size", "5");
  params.set("boundary.country", "FI");
  params.set("focus.point.lat", String(biasLat));
  params.set("focus.point.lon", String(biasLon));
  if (lang) {
    params.set("lang", lang);
  }
  return `${DIGITRANSIT_GEOCODING_ENDPOINT}?${params.toString()}`;
}

function parseFeature(feature) {
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const lon = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!isValidLatLon(lat, lon)) return null;

  const properties = feature?.properties || {};
  const label = safeString(
    properties.label ||
      properties.name ||
      [properties.locality, properties.region].filter(Boolean).join(", "),
    180
  ).trim();
  const confidenceRaw = Number(properties.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : null;

  return {
    lat,
    lon,
    label: label || null,
    confidence,
  };
}

async function geocode(
  text,
  biasLat,
  biasLon,
  lang,
  { fetchImpl = (...args) => fetch(...args), getApiKey = () => process.env.DIGITRANSIT_API_KEY } = {}
) {
  const key = getApiKey();
  if (!key) {
    throw new Error("Missing DIGITRANSIT_API_KEY environment variable.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;

  try {
    response = await fetchImpl(getGeocodingUrl({ text, biasLat, biasLon, lang }), {
      method: "GET",
      headers: {
        accept: "application/json",
        "digitransit-subscription-key": key,
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Digitransit geocoding request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  let json;
  try {
    json = await response.json();
  } catch {
    throw new Error(`Digitransit geocoding invalid response (HTTP ${response.status})`);
  }

  if (!response.ok) {
    throw new Error(`Digitransit geocoding HTTP ${response.status}`);
  }

  return (Array.isArray(json?.features) ? json.features : []).map(parseFeature).filter(Boolean);
}

async function hasNearbyHslStop(
  lat,
  lon,
  { graphqlRequestImpl = graphqlRequest } = {}
) {
  const nearbyData = await graphqlRequestImpl(nearbyStopsQuery, {
    lat,
    lon,
    radius: HSL_STOP_VALIDATION_RADIUS_METERS,
  });
  const edges = Array.isArray(nearbyData?.stopsByRadius?.edges) ? nearbyData.stopsByRadius.edges : [];
  return edges.some((edge) => edge?.node?.stop?.gtfsId);
}

async function filterHslValidCandidates(candidates, { hasNearbyStop = hasNearbyHslStop } = {}) {
  const stopValidationCache = new Map();
  const validCandidates = [];

  for (const candidate of candidates) {
    const cacheKey = `${candidate.lat.toFixed(6)},${candidate.lon.toFixed(6)}`;
    let isValid = stopValidationCache.get(cacheKey);
    if (isValid == null) {
      isValid = await hasNearbyStop(candidate.lat, candidate.lon);
      stopValidationCache.set(cacheKey, isValid);
    }
    if (isValid) {
      validCandidates.push(candidate);
    }
  }

  return validCandidates;
}

module.exports = {
  getGeocodingUrl,
  parseFeature,
  geocode,
  hasNearbyHslStop,
  filterHslValidCandidates,
};
