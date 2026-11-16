import type { Departure } from "../../../shared/domain/departure.js";
import {
  getUpstreamMode,
  type Mode,
} from "../../../shared/domain/mode.js";
import type { GeoPoint } from "../../../shared/domain/vehicle-span.js";
import { toWalkRoute, type WalkRoute } from "../../../shared/domain/walk-route.js";
import type { DepartureFetchWindow } from "../glance/glance-horizon.js";
import type { DigitransitService, NearbyStopNode } from "./types.js";

const DIGITRANSIT_ENDPOINT = "https://api.digitransit.fi/routing/v2/hsl/gtfs/v1";
const DIGITRANSIT_TIMEOUT_MS = 7000;
const NEARBY_STOPS_CACHE_TTL_MS = 60_000;

interface NearbyStopsCacheEntry {
  expiresAt: number;
  inFlight?: Promise<NearbyStopNode[]>;
  value?: NearbyStopNode[];
}

const stopPointQuery = `
  query StopPoint($id: String!) {
    stop(id: $id) {
      lat
      lon
    }
  }
`;

const vehicleFixQuery = `
  query VehicleFix($tripId: String!) {
    trip(id: $tripId) {
      pattern {
        vehiclePositions {
          lat
          lon
          trip {
            gtfsId
          }
        }
      }
    }
  }
`;

const tripShapeQuery = `
  query TripShape($tripId: String!) {
    trip(id: $tripId) {
      pattern {
        geometry {
          lat
          lon
        }
      }
    }
  }
`;

const walkPlanQuery = `
  query WalkPlan($fromLat: Float!, $fromLon: Float!, $toLat: Float!, $toLon: Float!) {
    plan(
      from: { lat: $fromLat, lon: $fromLon }
      to: { lat: $toLat, lon: $toLon }
      numItineraries: 1
      transportModes: [{ mode: WALK }]
    ) {
      itineraries {
        duration
        legs {
          mode
          legGeometry {
            points
          }
        }
      }
    }
  }
`;

const nearbyStopsQuery = `
  query NearbyStops($lat: Float!, $lon: Float!, $radius: Int!) {
    stopsByRadius(lat: $lat, lon: $lon, radius: $radius) {
      edges {
        node {
          distance
          stop {
            gtfsId
            name
            code
            lat
            lon
            vehicleMode
          }
        }
      }
    }
  }
`;

function buildMultiStopDeparturesQuery(stopIds: string[], fetchWindow: DepartureFetchWindow): {
  aliases: string[];
  query: string;
  variables: Record<string, number | string>;
} {
  const ids = [...new Set(stopIds.map((stopId) => stopId.trim()).filter(Boolean))];
  if (ids.length === 0) {
    throw new Error("buildMultiStopDeparturesQuery requires at least one stop id");
  }

  const variableDefinitions = ["$startTime: Long!", "$timeRange: Int!", "$departures: Int!"];
  const stopFields: string[] = [];
  const aliases: string[] = [];
  const horizonSeconds = fetchWindow.timeRangeSeconds;
  const variables: Record<string, number | string> = {
    departures: horizonSeconds,
    startTime: fetchWindow.startTimeUnixSeconds,
    timeRange: horizonSeconds,
  };

  ids.forEach((stopId, index) => {
    const alias = `s${index}`;
    const variableName = `id${index}`;
    aliases.push(alias);
    variableDefinitions.push(`$${variableName}: String!`);
    variables[variableName] = stopId;
    stopFields.push(`
      ${alias}: stop(id: $${variableName}) {
        platformCode
        stoptimesWithoutPatterns(startTime: $startTime, timeRange: $timeRange, numberOfDepartures: $departures) {
          serviceDay
          scheduledDeparture
          realtimeDeparture
          pickupType
          headsign
          stop {
            code
            gtfsId
            name
            platformCode
          }
          trip {
            gtfsId
            route {
              mode
              shortName
            }
          }
        }
      }
    `);
  });

  return {
    aliases,
    query: `
      query MultiStopDepartures(${variableDefinitions.join(", ")}) {
        ${stopFields.join("\n")}
      }
    `,
    variables,
  };
}

function normalizePickDropType(rawType: unknown): number | null {
  if (rawType == null || rawType === "") {
    return null;
  }
  if (typeof rawType === "number") {
    return Number.isInteger(rawType) ? rawType : null;
  }

  const parsed = Number(rawType);
  if (Number.isInteger(parsed)) {
    return parsed;
  }

  const normalized = String(rawType).trim().toUpperCase();
  if (
    normalized === "NONE" ||
    normalized === "NO_PICKUP" ||
    normalized === "NO_DROPOFF" ||
    normalized === "NOT_AVAILABLE"
  ) {
    return 1;
  }
  return 0;
}

function isBoardable(item: { pickupType?: unknown } | null | undefined): boolean {
  return normalizePickDropType(item?.pickupType) !== 1;
}

function parseDeparture(
  item: {
    headsign?: string;
    pickupType?: unknown;
    realtimeDeparture?: number;
    scheduledDeparture?: number;
    serviceDay?: number;
    stop?: {
      code?: string;
      gtfsId?: string;
      name?: string;
      platformCode?: string;
    };
    trip?: {
      gtfsId?: string;
      route?: {
        mode?: string;
        shortName?: string;
      };
    };
  },
  input: {
    fallbackTrack: string | null;
    mode: Mode;
  }
): Departure | null {
  const route = item.trip?.route;
  if (!route || route.mode?.toUpperCase() !== getUpstreamMode(input.mode)) {
    return null;
  }
  if (!isBoardable(item)) {
    return null;
  }

  const serviceDay = Number(item.serviceDay);
  const realtimeDeparture = Number(item.realtimeDeparture);
  const scheduledDeparture = Number(item.scheduledDeparture);
  const seconds = Number.isFinite(realtimeDeparture) ? realtimeDeparture : scheduledDeparture;
  if (!Number.isFinite(serviceDay) || !Number.isFinite(seconds)) {
    return null;
  }

  const departureDate = new Date((serviceDay + seconds) * 1000);
  if (Number.isNaN(departureDate.getTime())) {
    return null;
  }

  return {
    departureIso: departureDate.toISOString(),
    destination: item.headsign?.trim() || "",
    line: route.shortName?.trim() || "Service",
    stopCode: item.stop?.code?.trim() || null,
    stopId: item.stop?.gtfsId?.trim() || null,
    stopName: item.stop?.name?.trim() || null,
    track: item.stop?.platformCode?.trim() || input.fallbackTrack,
    tripId: item.trip?.gtfsId?.trim() || null,
  };
}

function dedupeDepartures(departures: Departure[]): Departure[] {
  return departures.filter((departure, index, items) => {
    return (
      items.findIndex((candidate) => {
        return (
          candidate.line === departure.line &&
          candidate.destination === departure.destination &&
          candidate.departureIso === departure.departureIso &&
          candidate.track === departure.track &&
          candidate.stopId === departure.stopId
        );
      }) === index
    );
  });
}

function keepUpcomingDepartures(departures: Departure[], now: number = Date.now()): Departure[] {
  return departures
    .filter((departure) => new Date(departure.departureIso).getTime() > now)
    .sort(
      (left, right) =>
        new Date(left.departureIso).getTime() - new Date(right.departureIso).getTime()
    );
}

function buildNearbyStopsCacheKey(input: { lat: number; lon: number; radius: number }): string {
  return `${input.lat}:${input.lon}:${input.radius}`;
}

function normalizeNearbyStops(data: Record<string, unknown>): NearbyStopNode[] {
  const edges = (data.stopsByRadius as { edges?: Array<{ node?: NearbyStopNode }> } | undefined)
    ?.edges;
  return (edges || [])
    .map((edge) => edge.node)
    .filter((node): node is NearbyStopNode => Boolean(node?.stop?.gtfsId));
}

function decodePolyline(encoded: string): GeoPoint[] {
  const points: GeoPoint[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  while (index < encoded.length) {
    const nextLatitude = readPolylineChunk(encoded, index);
    index = nextLatitude.index;
    latitude += nextLatitude.value;
    const nextLongitude = readPolylineChunk(encoded, index);
    index = nextLongitude.index;
    longitude += nextLongitude.value;
    points.push({ lat: latitude / 1e5, lon: longitude / 1e5 });
  }
  return points;
}

function readPolylineChunk(encoded: string, start: number): { index: number; value: number } {
  let result = 0;
  let shift = 0;
  let index = start;
  let byte = 0;
  do {
    byte = encoded.charCodeAt(index) - 63;
    index += 1;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20);
  const value = result & 1 ? ~(result >> 1) : result >> 1;
  return { index, value };
}

interface PlanLeg {
  legGeometry?: { points?: string };
  mode?: string;
}

interface PlannedWalk {
  points: GeoPoint[];
  seconds: number;
}

function walkSeconds(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

function readWalkLegs(data: Record<string, unknown>): PlannedWalk | null {
  const plan = data.plan as { itineraries?: Array<{ duration?: unknown; legs?: PlanLeg[] }> } | null | undefined;
  const itinerary = plan?.itineraries?.[0];
  const seconds = walkSeconds(itinerary?.duration);
  if (!itinerary || seconds == null) {
    return null;
  }
  const points: GeoPoint[] = [];
  for (const leg of itinerary.legs ?? []) {
    if (leg.mode !== "WALK" || !leg.legGeometry?.points) {
      continue;
    }
    points.push(...decodePolyline(leg.legGeometry.points));
  }
  if (points.length === 0) {
    return null;
  }
  return { points, seconds };
}

function samePlace(origin: GeoPoint, stop: GeoPoint): boolean {
  return origin.lat === stop.lat && origin.lon === stop.lon;
}

function dedupeConsecutive(points: readonly GeoPoint[]): GeoPoint[] {
  const result: GeoPoint[] = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (previous && previous.lat === point.lat && previous.lon === point.lon) {
      continue;
    }
    result.push(point);
  }
  return result;
}

function isGeoPoint(value: { lat?: number; lon?: number }): value is { lat: number; lon: number } {
  return typeof value.lat === "number" && typeof value.lon === "number" && Number.isFinite(value.lat) && Number.isFinite(value.lon);
}

function readTripShape(data: Record<string, unknown>): Array<{ lat: number; lon: number }> {
  const trip = data.trip as
    | { pattern?: { geometry?: Array<{ lat?: number; lon?: number }> } }
    | null
    | undefined;
  const geometry = trip?.pattern?.geometry;
  if (!geometry) {
    return [];
  }
  return geometry.filter(isGeoPoint);
}

function readVehicleFix(data: Record<string, unknown>, tripId: string): { lat: number; lon: number } | null {
  const trip = data.trip as
    | {
        pattern?: {
          vehiclePositions?: Array<{ lat?: number; lon?: number; trip?: { gtfsId?: string } }>;
        };
      }
    | null
    | undefined;
  const positions = trip?.pattern?.vehiclePositions || [];
  const match = positions.find((position) => position.trip?.gtfsId === tripId);
  const lat = match?.lat;
  const lon = match?.lon;
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return { lat, lon };
}

async function graphqlRequest(input: {
  body: Record<string, unknown>;
  endpoint: string;
  fetchImpl: typeof fetch;
  getApiKey: () => string | undefined;
  timeoutMs: number;
}): Promise<Record<string, unknown>> {
  const apiKey = input.getApiKey();
  if (!apiKey) {
    throw new Error("Missing DIGITRANSIT_API_KEY environment variable.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await input.fetchImpl(input.endpoint, {
      body: JSON.stringify(input.body),
      headers: {
        "content-type": "application/json",
        "digitransit-subscription-key": apiKey,
      },
      method: "POST",
      signal: controller.signal,
    });

    const payload = (await response.json()) as {
      data?: Record<string, unknown>;
      errors?: Array<{ message?: string }>;
    };
    if (!response.ok) {
      throw new Error(`Digitransit HTTP ${response.status}`);
    }
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((error) => error.message || "Unknown error").join(" | "));
    }
    return payload.data || {};
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Digitransit request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function createDigitransitService(input: {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  getApiKey?: () => string | undefined;
  nearbyStopsCacheTtlMs?: number;
  now?: () => number;
  timeoutMs?: number;
} = {}): DigitransitService {
  const endpoint = input.endpoint || DIGITRANSIT_ENDPOINT;
  const fetchImpl = input.fetchImpl || fetch;
  const getApiKey = input.getApiKey || (() => process.env.DIGITRANSIT_API_KEY);
  const nearbyStopsCacheTtlMs = input.nearbyStopsCacheTtlMs || NEARBY_STOPS_CACHE_TTL_MS;
  const now = input.now || Date.now;
  const timeoutMs = input.timeoutMs || DIGITRANSIT_TIMEOUT_MS;
  const nearbyStopsCache = new Map<string, NearbyStopsCacheEntry>();

  async function readStopCoordinates(stopId: string): Promise<GeoPoint | null> {
    const data = await graphqlRequest({
      body: {
        query: stopPointQuery,
        variables: { id: stopId },
      },
      endpoint,
      fetchImpl,
      getApiKey,
      timeoutMs,
    });
    const stop = data.stop as { lat?: number; lon?: number } | null | undefined;
    if (!stop || !isGeoPoint(stop)) {
      return null;
    }
    return stop;
  }

  async function requestWalkPlan(origin: GeoPoint, stop: GeoPoint): Promise<Record<string, unknown>> {
    return graphqlRequest({
      body: {
        query: walkPlanQuery,
        variables: {
          fromLat: origin.lat,
          fromLon: origin.lon,
          toLat: stop.lat,
          toLon: stop.lon,
        },
      },
      endpoint,
      fetchImpl,
      getApiKey,
      timeoutMs,
    });
  }

  async function planWalk(origin: GeoPoint, stopId: string): Promise<WalkRoute | null> {
    const trimmed = stopId.trim();
    if (!trimmed) {
      return null;
    }
    const stop = await readStopCoordinates(trimmed);
    if (!stop) {
      return null;
    }
    if (samePlace(origin, stop)) {
      return toWalkRoute([origin, stop], 0);
    }
    const decoded = readWalkLegs(await requestWalkPlan(origin, stop));
    if (!decoded) {
      return null;
    }
    return toWalkRoute(dedupeConsecutive([origin, ...decoded.points, stop]), decoded.seconds);
  }

  return {
    async getTripShape(tripId) {
      const data = await graphqlRequest({
        body: {
          query: tripShapeQuery,
          variables: { tripId },
        },
        endpoint,
        fetchImpl,
        getApiKey,
        timeoutMs,
      });
      return readTripShape(data);
    },
    async getVehicleFix(tripId) {
      const data = await graphqlRequest({
        body: {
          query: vehicleFixQuery,
          variables: { tripId },
        },
        endpoint,
        fetchImpl,
        getApiKey,
        timeoutMs,
      });
      return readVehicleFix(data, tripId);
    },
    getStopPoint: readStopCoordinates,
    planWalk,
    async getDeparturesForStopIds(stopIds, options) {
      if (stopIds.length === 0) {
        return new Map();
      }

      const query = buildMultiStopDeparturesQuery(stopIds, options.fetchWindow);
      const data = await graphqlRequest({
        body: {
          query: query.query,
          variables: query.variables,
        },
        endpoint,
        fetchImpl,
        getApiKey,
        timeoutMs,
      });

      const departuresByStopId = new Map<string, Departure[]>();
      query.aliases.forEach((alias, index) => {
        const stopId = stopIds[index];
        const stopData = data[alias] as
          | {
              platformCode?: string;
              stoptimesWithoutPatterns?: Array<Parameters<typeof parseDeparture>[0]>;
            }
          | undefined;
        const fallbackTrack = stopData?.platformCode?.trim() || null;
        const departures = keepUpcomingDepartures(
          dedupeDepartures(
            (stopData?.stoptimesWithoutPatterns || [])
              .map((item) =>
                parseDeparture(item, {
                  fallbackTrack,
                  mode: options.mode,
                })
              )
              .filter((value): value is Departure => value != null)
          ),
          options.fetchWindow.nowMs,
        );
        departuresByStopId.set(stopId, departures);
      });

      return departuresByStopId;
    },
    async getNearbyStops({ lat, lon, radius }) {
      const cacheKey = buildNearbyStopsCacheKey({ lat, lon, radius });
      const cached = nearbyStopsCache.get(cacheKey);
      const currentTime = now();
      if (cached?.value && cached.expiresAt > currentTime) {
        return cached.value;
      }
      if (cached?.inFlight) {
        return cached.inFlight;
      }

      const inFlight = graphqlRequest({
        body: {
          query: nearbyStopsQuery,
          variables: { lat, lon, radius },
        },
        endpoint,
        fetchImpl,
        getApiKey,
        timeoutMs,
      }).then((data) => {
        const value = normalizeNearbyStops(data);
        nearbyStopsCache.set(cacheKey, {
          expiresAt: now() + nearbyStopsCacheTtlMs,
          value,
        });
        return value;
      });

      nearbyStopsCache.set(cacheKey, {
        expiresAt: 0,
        inFlight,
      });

      try {
        return await inFlight;
      } catch (error) {
        if (nearbyStopsCache.get(cacheKey)?.inFlight === inFlight) {
          nearbyStopsCache.delete(cacheKey);
        }
        throw error;
      }
    },
  };
}
