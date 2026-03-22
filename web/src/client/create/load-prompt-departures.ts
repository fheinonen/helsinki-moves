import type { Coordinates } from "@client/app/app-store";
import type { DeparturesClient } from "@client/services/departures-client";
import type { GeocodeClient } from "@client/services/geocode-client";
import type { TravelIntentClient } from "@client/services/travel-intent-client";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { Mode } from "@shared/domain/mode";
import { promptLooksLikeTravelRequest, resolveDestinationBoundary, resolvePromptIntentBoundary } from "./intent-resolution";

type DeparturesResponse = Awaited<ReturnType<DeparturesClient["getDepartures"]>>;

export type PromptDeparturesLoadResult =
  | {
      responses: DeparturesSuccessResponse[];
      routeContext: {
        fromCoords: Coordinates;
        toCoords: Coordinates;
      } | null;
      status: "ok";
    }
  | {
      inputDestination: string;
      message: string;
      mode: Mode;
      status: "needs-destination-clarification";
      suggestions: string[];
    }
  | { message: string; status: "needs-location" };

export type PromptOriginOverride =
  | { coords: Coordinates; type: "current-location" }
  | { query: string; type: "typed-location" };

function isDeparturesResponse(value: DeparturesResponse | undefined): value is DeparturesResponse {
  return Boolean(value);
}

function okResult(
  responses: DeparturesSuccessResponse[],
  routeContext: {
    fromCoords: Coordinates;
    toCoords: Coordinates;
  } | null = null
): PromptDeparturesLoadResult {
  return {
    responses,
    routeContext,
    status: "ok",
  };
}

export async function loadPromptDepartures(input: {
  client: DeparturesClient;
  coords: Coordinates;
  destinationOverride?: string | null;
  geocodeClient?: GeocodeClient;
  originOverride?: PromptOriginOverride | null;
  onPartial: (responses: DeparturesSuccessResponse[]) => void;
  prompt: string;
  signal: AbortSignal;
  travelIntentClient?: TravelIntentClient;
}): Promise<PromptDeparturesLoadResult> {
  const promptBoundary = await resolvePromptIntentBoundary({
    locationAlreadyKnown: Boolean(input.originOverride),
    prompt: input.prompt,
    travelIntentClient: input.travelIntentClient,
  });
  if (promptBoundary.status === "failure") {
    if (promptBoundary.reason === "missing_location") {
      return {
        message: promptBoundary.message,
        status: "needs-location",
      };
    }

    return okResult([]);
  }
  if (promptBoundary.status !== "resolved") {
    return okResult([]);
  }
  const { locationQuery: parsedLocationQuery, requests } = promptBoundary;
  if (requests.length === 0) {
    return okResult([]);
  }
  const effectiveRequests = requests.map((request) =>
    input.destinationOverride && request.destinations.length > 0
      ? { ...request, destinations: [input.destinationOverride] }
      : request
  );

  let requestCoords = input.coords;
  const locationQuery =
    input.originOverride?.type === "typed-location" ? input.originOverride.query : parsedLocationQuery;
  if (input.originOverride?.type === "current-location") {
    requestCoords = input.originOverride.coords;
  }

  if (locationQuery && input.geocodeClient && input.originOverride?.type !== "current-location") {
    const geocodeResponse = await input.geocodeClient.resolve({
      biasLat: input.coords.lat,
      biasLon: input.coords.lon,
      lang: "fi",
      query: locationQuery,
    });
    const resolvedLocation = geocodeResponse.location || geocodeResponse.choices[0] || null;
    if (resolvedLocation) {
      requestCoords = {
        lat: resolvedLocation.latitude,
        lon: resolvedLocation.longitude,
      };
    }
  }

  const destinationText = effectiveRequests.flatMap((request) => request.destinations)[0] || null;
  let routeContext: {
    fromCoords: Coordinates;
    toCoords: Coordinates;
  } | null = null;
  if (destinationText && input.geocodeClient) {
    const geocodeResponse = await input.geocodeClient.resolve({
      biasLat: requestCoords.lat,
      biasLon: requestCoords.lon,
      lang: "fi",
      query: destinationText,
    });
    const resolvedDestination = geocodeResponse.location || geocodeResponse.choices[0] || null;
    if (resolvedDestination) {
      routeContext = {
        fromCoords: requestCoords,
        toCoords: {
          lat: resolvedDestination.latitude,
          lon: resolvedDestination.longitude,
        },
      };
    }
  }

  const isTravelRequest = promptLooksLikeTravelRequest(input.prompt);
  const hasGeocodedDestination = routeContext !== null && isTravelRequest;
  const responses: Array<DeparturesResponse | undefined> = new Array(requests.length);
  await Promise.all(
    effectiveRequests.map(async (request, index) => {
      const response = await input.client.getDepartures({
        coords: requestCoords,
        destinations: hasGeocodedDestination ? [] : request.destinations,
        lineIntent: request.lines.length > 0,
        lines: request.lines,
        mode: request.mode,
        signal: input.signal,
        stopId: null,
      });
      responses[index] = response;
      input.onPartial(responses.filter(isDeparturesResponse));
    })
  );

  const resolvedResponses = responses.filter(isDeparturesResponse);
  if (hasGeocodedDestination) {
    return okResult(resolvedResponses, routeContext);
  }
  const destinationBoundary = resolveDestinationBoundary(resolvedResponses);
  if (destinationBoundary.status === "needs_clarification") {
    return {
      inputDestination: destinationBoundary.inputDestination,
      message: destinationBoundary.message,
      mode: destinationBoundary.mode,
      status: "needs-destination-clarification",
      suggestions: destinationBoundary.suggestions,
    };
  }

  return okResult(resolvedResponses, routeContext);
}
