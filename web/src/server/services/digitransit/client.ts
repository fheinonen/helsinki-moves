import type { Departure } from "../../../shared/domain/departure.js";
import {
  getUpstreamMode,
  type Mode,
} from "../../../shared/domain/mode.js";
import type { DigitransitService, NearbyStopNode } from "./types.js";

const DIGITRANSIT_ENDPOINT = "https://api.digitransit.fi/routing/v2/hsl/gtfs/v1";
const DIGITRANSIT_TIMEOUT_MS = 7000;
const NEARBY_STOPS_CACHE_TTL_MS = 60_000;

interface NearbyStopsCacheEntry {
  expiresAt: number;
  inFlight?: Promise<NearbyStopNode[]>;
  value?: NearbyStopNode[];
}

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
            vehicleMode
          }
        }
      }
    }
  }
`;

function buildMultiStopDeparturesQuery(stopIds: string[], departures: number): {
  aliases: string[];
  query: string;
  variables: Record<string, number | string>;
} {
  const ids = [...new Set(stopIds.map((stopId) => stopId.trim()).filter(Boolean))];
  if (ids.length === 0) {
    throw new Error("buildMultiStopDeparturesQuery requires at least one stop id");
  }

  const variableDefinitions = ["$departures: Int!"];
  const stopFields: string[] = [];
  const aliases: string[] = [];
  const variables: Record<string, number | string> = { departures };

  ids.forEach((stopId, index) => {
    const alias = `s${index}`;
    const variableName = `id${index}`;
    aliases.push(alias);
    variableDefinitions.push(`$${variableName}: String!`);
    variables[variableName] = stopId;
    stopFields.push(`
      ${alias}: stop(id: $${variableName}) {
        platformCode
        stoptimesWithoutPatterns(numberOfDepartures: $departures) {
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

  return {
    async getDeparturesForStopIds(stopIds, options) {
      if (stopIds.length === 0) {
        return new Map();
      }

      const departuresLimit = Math.max(24, options.resultLimit);
      const query = buildMultiStopDeparturesQuery(stopIds, departuresLimit);
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
          )
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
