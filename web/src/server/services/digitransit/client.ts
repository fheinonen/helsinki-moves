import type { Departure } from "../../../shared/domain/departure.js";
import type {
  NormalizedAlert,
  NormalizedAlertEntity,
} from "../../../shared/contracts/alerts-contract.js";
import {
  getUpstreamMode,
  type Mode,
} from "../../../shared/domain/mode.js";
import type {
  RouteItinerary,
  RouteLeg,
  RoutePlanRequest,
} from "../../../shared/contracts/routes-contract.js";
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

const routesQuery = `
  query PlanRoute(
    $first: Int!
    $fromLat: CoordinateValue!
    $fromLon: CoordinateValue!
    $toLat: CoordinateValue!
    $toLon: CoordinateValue!
  ) {
    planConnection(
      destination: {
        location: {
          coordinate: { latitude: $toLat, longitude: $toLon }
        }
      }
      first: $first
      origin: {
        location: {
          coordinate: { latitude: $fromLat, longitude: $fromLon }
        }
      }
    ) {
      edges {
        node {
          duration
          walkDistance
          legs {
            mode
            route {
              gtfsId
              shortName
            }
            trip {
              tripHeadsign
            }
            from {
              name
              stop {
                platformCode
              }
            }
            to {
              name
              stop {
                platformCode
              }
            }
            start {
              scheduledTime
            }
            end {
              scheduledTime
            }
          }
        }
      }
    }
  }
`;

const alertsQuery = `
  query Alerts($feeds: [String!], $routeIds: [String!], $stopIds: [String!]) {
    alerts(feeds: $feeds, route: $routeIds, stop: $stopIds) {
      id
      alertHeaderText
      alertDescriptionText
      alertSeverityLevel
      alertEffect
      alertCause
      effectiveStartDate
      effectiveEndDate
      entities {
        __typename
        ... on Route {
          routeGtfsId: gtfsId
          shortName
        }
        ... on Stop {
          stopGtfsId: gtfsId
          stopCode: code
          name
        }
        ... on Trip {
          tripGtfsId: gtfsId
          tripHeadsign
          routeShortName
        }
        ... on Pattern {
          code
        }
        ... on StopOnRoute {
          stop {
            stopGtfsId: gtfsId
            stopCode: code
            name
          }
          route {
            routeGtfsId: gtfsId
            shortName
          }
        }
        ... on StopOnTrip {
          stop {
            stopGtfsId: gtfsId
            stopCode: code
            name
          }
          trip {
            tripGtfsId: gtfsId
            tripHeadsign
          }
        }
        ... on Agency {
          name
        }
        ... on RouteType {
          routeType
        }
        ... on Unknown {
          __typename
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

function toIso(value: unknown): string | null {
  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function normalizeRouteLeg(leg: Record<string, unknown>): RouteLeg | null {
  const startTimeIso = toIso((leg.start as { scheduledTime?: unknown } | undefined)?.scheduledTime);
  const endTimeIso = toIso((leg.end as { scheduledTime?: unknown } | undefined)?.scheduledTime);
  if (!startTimeIso || !endTimeIso) {
    return null;
  }

  const fromStop = leg.from as { name?: unknown; stop?: { platformCode?: unknown } } | undefined;
  const toStop = leg.to as { name?: unknown; stop?: { platformCode?: unknown } | undefined };

  return {
    arrivalPlatform: typeof toStop?.stop?.platformCode === "string" ? String(toStop.stop.platformCode).trim() || null : null,
    arrivalStopName: typeof toStop?.name === "string" ? (toStop.name as string).trim() || null : null,
    departurePlatform: typeof fromStop?.stop?.platformCode === "string" ? String(fromStop.stop.platformCode).trim() || null : null,
    departureStopName: typeof fromStop?.name === "string" ? (fromStop.name as string).trim() || null : null,
    endTimeIso,
    headsign:
      typeof (leg.trip as { tripHeadsign?: unknown } | undefined)?.tripHeadsign === "string"
        ? (((leg.trip as { tripHeadsign: string }).tripHeadsign.trim() || null) as string | null)
        : null,
    line:
      typeof (leg.route as { shortName?: unknown } | undefined)?.shortName === "string"
        ? (((leg.route as { shortName: string }).shortName.trim() || null) as string | null)
        : null,
    mode: typeof leg.mode === "string" ? leg.mode : "WALK",
    routeId:
      typeof (leg.route as { gtfsId?: unknown } | undefined)?.gtfsId === "string"
        ? (((leg.route as { gtfsId: string }).gtfsId.trim() || null) as string | null)
        : null,
    startTimeIso,
  };
}

function normalizeRouteItineraries(data: Record<string, unknown>): RouteItinerary[] {
  const rawItineraries =
    (
      data.planConnection as
        | {
            edges?: Array<{
              node?: Record<string, unknown>;
            }>;
          }
        | undefined
    )?.edges
      ?.map((edge) => edge.node)
      .filter((node): node is Record<string, unknown> => Boolean(node)) || [];

  return rawItineraries
    .map((itinerary, index) => {
      const durationSeconds = Number(itinerary.duration);
      const walkDistanceMeters = Number(itinerary.walkDistance);
      const legs = ((itinerary.legs as Record<string, unknown>[] | undefined) || [])
        .map((leg) => normalizeRouteLeg(leg))
        .filter((value): value is RouteLeg => value != null);
      const startTimeIso = legs[0]?.startTimeIso || null;
      const endTimeIso = legs[legs.length - 1]?.endTimeIso || null;

      if (
        !startTimeIso ||
        !endTimeIso ||
        !Number.isFinite(durationSeconds) ||
        !Number.isFinite(walkDistanceMeters) ||
        legs.length === 0
      ) {
        return null;
      }

      const transitLegCount = legs.filter((leg) => leg.mode !== "WALK").length;

      return {
        durationSeconds: Math.max(0, Math.round(durationSeconds)),
        endTimeIso,
        id: `itinerary-${index}`,
        legs,
        startTimeIso,
        transfers: Math.max(0, transitLegCount - 1),
        walkDistanceMeters: Math.max(0, Math.round(walkDistanceMeters)),
      } satisfies RouteItinerary;
    })
    .filter((value): value is RouteItinerary => value != null);
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeAlertEntity(entity: Record<string, unknown>): NormalizedAlertEntity {
  const typeName = typeof entity.__typename === "string" ? entity.__typename : "Unknown";

  if (typeName === "Route") {
    return {
      routeId: toNullableString(entity.routeGtfsId),
      routeShortName: toNullableString(entity.shortName),
      type: "route",
    };
  }
  if (typeName === "Stop") {
    return {
      stopCode: toNullableString(entity.stopCode),
      stopId: toNullableString(entity.stopGtfsId),
      stopName: toNullableString(entity.name),
      type: "stop",
    };
  }
  if (typeName === "Trip") {
    return {
      routeShortName: toNullableString(entity.routeShortName),
      tripHeadsign: toNullableString(entity.tripHeadsign),
      tripId: toNullableString(entity.tripGtfsId),
      type: "trip",
    };
  }
  if (typeName === "Pattern") {
    return {
      routeId: toNullableString((entity.route as { routeGtfsId?: unknown } | undefined)?.routeGtfsId),
      routeShortName: toNullableString((entity.route as { shortName?: unknown } | undefined)?.shortName),
      type: "pattern",
    };
  }
  if (typeName === "StopOnRoute") {
    return {
      routeId: toNullableString((entity.route as { routeGtfsId?: unknown } | undefined)?.routeGtfsId),
      routeShortName: toNullableString((entity.route as { shortName?: unknown } | undefined)?.shortName),
      stopCode: toNullableString((entity.stop as { stopCode?: unknown } | undefined)?.stopCode),
      stopId: toNullableString((entity.stop as { stopGtfsId?: unknown } | undefined)?.stopGtfsId),
      stopName: toNullableString((entity.stop as { name?: unknown } | undefined)?.name),
      type: "stop_on_route",
    };
  }
  if (typeName === "StopOnTrip") {
    return {
      stopCode: toNullableString((entity.stop as { stopCode?: unknown } | undefined)?.stopCode),
      stopId: toNullableString((entity.stop as { stopGtfsId?: unknown } | undefined)?.stopGtfsId),
      stopName: toNullableString((entity.stop as { name?: unknown } | undefined)?.name),
      tripHeadsign: toNullableString((entity.trip as { tripHeadsign?: unknown } | undefined)?.tripHeadsign),
      tripId: toNullableString((entity.trip as { tripGtfsId?: unknown } | undefined)?.tripGtfsId),
      type: "stop_on_trip",
    };
  }
  if (typeName === "Agency") {
    return {
      type: "agency",
    };
  }
  if (typeName === "RouteType") {
    return {
      type: "route_type",
    };
  }
  return { type: "unknown" };
}

function normalizeAlerts(data: Record<string, unknown>): NormalizedAlert[] {
  const rawAlerts =
    ((data.alerts as Record<string, unknown>[] | undefined) || []).filter(
      (value): value is Record<string, unknown> => Boolean(value)
    );

  return rawAlerts
    .map((alert) => {
      const id = toNullableString(alert.id);
      const descriptionText = toNullableString(alert.alertDescriptionText);
      if (!id || !descriptionText) {
        return null;
      }
      return {
        cause: toNullableString(alert.alertCause),
        descriptionText,
        effect: toNullableString(alert.alertEffect),
        effectiveEndDate: toNullableNumber(alert.effectiveEndDate),
        effectiveStartDate: toNullableNumber(alert.effectiveStartDate),
        entities: ((alert.entities as Record<string, unknown>[] | undefined) || []).map((entity) =>
          normalizeAlertEntity(entity)
        ),
        headerText: toNullableString(alert.alertHeaderText),
        id,
        severityLevel: toNullableString(alert.alertSeverityLevel),
      } satisfies NormalizedAlert;
    })
    .filter((value): value is NormalizedAlert => value != null);
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
    async getRoutes(input: RoutePlanRequest) {
      const data = await graphqlRequest({
        body: {
          query: routesQuery,
          variables: {
            first: 3,
            fromLat: input.fromLat,
            fromLon: input.fromLon,
            toLat: input.toLat,
            toLon: input.toLon,
          },
        },
        endpoint,
        fetchImpl,
        getApiKey,
        timeoutMs,
      });

      return normalizeRouteItineraries(data);
    },
    async getAlerts() {
      const data = await graphqlRequest({
        body: {
          query: alertsQuery,
          variables: {
            feeds: ["HSL"],
            routeIds: [],
            stopIds: [],
          },
        },
        endpoint,
        fetchImpl,
        getApiKey,
        timeoutMs,
      });

      return normalizeAlerts(data);
    },
  };
}
