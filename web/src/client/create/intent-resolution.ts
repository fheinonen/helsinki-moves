import type { TravelIntentClient } from "@client/services/travel-intent-client";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { Mode } from "@shared/domain/mode";
import {
  parsePromptDepartureRequests,
  parsePromptLocationQuery,
  type PromptDepartureRequest,
} from "./prompt-departure-requests";

export interface ResolvedIntentBoundary {
  locationQuery: string | null;
  requests: PromptDepartureRequest[];
  status: "resolved";
}

export interface ClarificationIntentBoundary {
  inputDestination: string;
  message: string;
  mode: Mode;
  status: "needs_clarification";
  suggestions: string[];
}

export interface FailureIntentBoundary {
  message: string;
  reason: "missing_location" | "parse_failed";
  status: "failure";
}

export type IntentBoundaryResult =
  | ClarificationIntentBoundary
  | FailureIntentBoundary
  | ResolvedIntentBoundary;

function buildNeedsLocationMessage(requests: PromptDepartureRequest[]): string {
  const firstDestination = requests.flatMap((request) => request.destinations)[0] || "your destination";
  return `Add a starting location or use current location to find departures to ${firstDestination}.`;
}

function promptLooksLikeTravelRequest(prompt: string): boolean {
  return /\b(?:take|go|get)\b/i.test(prompt) && /\b(?:to|towards|destination)\b/i.test(prompt);
}

function parserNeedsTravelIntentFallback(prompt: string, requests: PromptDepartureRequest[]): boolean {
  if (!promptLooksLikeTravelRequest(prompt)) {
    return false;
  }
  if (requests.length === 0) {
    return true;
  }
  return requests.some((request) => request.destinations.length === 0);
}

function requiresStartingLocation(input: {
  locationAlreadyKnown?: boolean;
  locationQuery: string | null;
  prompt: string;
  requests: PromptDepartureRequest[];
}): boolean {
  if (input.requests.length === 0 || input.locationQuery || input.locationAlreadyKnown) {
    return false;
  }
  const hasDestinationOnlyRequest = input.requests.some(
    (request) => request.destinations.length > 0 && request.lines.length === 0
  );
  return hasDestinationOnlyRequest && promptLooksLikeTravelRequest(input.prompt);
}

async function parsePromptIntent(input: {
  prompt: string;
  travelIntentClient?: TravelIntentClient;
}): Promise<{ locationQuery: string | null; requests: PromptDepartureRequest[] }> {
  const requests = parsePromptDepartureRequests(input.prompt);
  if (!input.travelIntentClient || !parserNeedsTravelIntentFallback(input.prompt, requests)) {
    return {
      locationQuery: parsePromptLocationQuery(input.prompt),
      requests,
    };
  }

  const parsedIntent = await input.travelIntentClient.parse({
    prompt: input.prompt,
  });
  return {
    locationQuery: parsedIntent.locationQuery,
    requests: parsedIntent.requests,
  };
}

function buildClarificationBoundary(
  response: DeparturesSuccessResponse
): ClarificationIntentBoundary | null {
  const resolution = response.destinationResolution;
  if (
    resolution?.type !== "needs-clarification" ||
    !resolution.suggestions?.length ||
    (response.station?.departures.length || 0) > 0
  ) {
    return null;
  }

  return {
    inputDestination: resolution.input,
    message:
      response.message ||
      `I couldn't confidently match "${resolution.input}". Did you mean one of these?`,
    mode: response.mode,
    status: "needs_clarification",
    suggestions: resolution.suggestions,
  };
}

export function destinationTextChanged(previous: string | null, next: string | null): boolean {
  const normalize = (value: string | null): string =>
    String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  return normalize(previous) !== normalize(next);
}

export function resolveDestinationBoundary(
  responses: DeparturesSuccessResponse[]
): IntentBoundaryResult {
  const clarification = responses.map(buildClarificationBoundary).find(Boolean);
  if (clarification) {
    return clarification;
  }

  return {
    locationQuery: null,
    requests: [],
    status: "resolved",
  };
}

export async function resolvePromptIntentBoundary(input: {
  locationAlreadyKnown?: boolean;
  prompt: string;
  travelIntentClient?: TravelIntentClient;
}): Promise<IntentBoundaryResult> {
  const promptIntent = await parsePromptIntent(input);
  if (promptIntent.requests.length === 0 && promptLooksLikeTravelRequest(input.prompt)) {
    return {
      message: "I need a clearer destination before I can build a route canvas.",
      reason: "parse_failed",
      status: "failure",
    };
  }

  if (
    requiresStartingLocation({
      locationAlreadyKnown: input.locationAlreadyKnown,
      locationQuery: promptIntent.locationQuery,
      prompt: input.prompt,
      requests: promptIntent.requests,
    })
  ) {
    return {
      message: buildNeedsLocationMessage(promptIntent.requests),
      reason: "missing_location",
      status: "failure",
    };
  }

  return {
    locationQuery: promptIntent.locationQuery,
    requests: promptIntent.requests,
    status: "resolved",
  };
}
