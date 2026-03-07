import type { Departure } from "@shared/domain/departure";
import type { Mode } from "@shared/domain/mode";
import type { StopStation } from "@shared/contracts/departures-contract";

export interface VoiceLineIntent {
  explicitMode: boolean;
  line: string;
  mode: Mode | null;
  type: "line-intent";
}

const VOICE_MODE_TOKENS = new Map<string, Mode>([
  ["bus", "BUS"],
  ["bussi", "BUS"],
  ["tram", "TRAM"],
  ["ratikka", "TRAM"],
  ["raitiovaunu", "TRAM"],
  ["train", "RAIL"],
  ["rail", "RAIL"],
  ["juna", "RAIL"],
  ["metro", "METRO"],
]);

export function normalizeVoiceLineToken(value: unknown): string {
  const normalized = String(value || "")
    .trim()
    .replace(/^[^0-9A-Za-z]+|[^0-9A-Za-z]+$/g, "")
    .toUpperCase();

  if (!normalized || normalized.length > 5 || !/^[A-Z0-9]+$/.test(normalized)) {
    return "";
  }
  if (!/\d/.test(normalized) && normalized.length !== 1) {
    return "";
  }

  return normalized;
}

function splitTranscriptTokens(transcript: string): string[] {
  return transcript
    .normalize("NFC")
    .split(/[\s\-–—_/]+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function parseVoiceLineIntent(transcript: string): VoiceLineIntent | null {
  const tokens = splitTranscriptTokens(String(transcript || ""));
  if (tokens.length === 0) {
    return null;
  }

  let explicitMode: Mode | null = null;
  const nonModeTokens: string[] = [];
  for (const token of tokens) {
    const mode = VOICE_MODE_TOKENS.get(token.toLowerCase()) || null;
    if (mode && !explicitMode) {
      explicitMode = mode;
      continue;
    }
    nonModeTokens.push(token);
  }

  if (explicitMode) {
    const line = nonModeTokens
      .map((token) => normalizeVoiceLineToken(token))
      .find(Boolean);
    if (!line) {
      return null;
    }

    return {
      explicitMode: true,
      line,
      mode: explicitMode,
      type: "line-intent",
    };
  }

  if (nonModeTokens.length !== 1) {
    return null;
  }

  const line = normalizeVoiceLineToken(nonModeTokens[0]);
  if (!line) {
    return null;
  }

  return {
    explicitMode: false,
    line,
    mode: null,
    type: "line-intent",
  };
}

export function getSoonestMatchingDepartureMs(
  station: StopStation | null,
  lineToken: string
): number {
  const expectedLine = normalizeVoiceLineToken(lineToken);
  if (!station || !expectedLine) {
    return Number.POSITIVE_INFINITY;
  }

  const matchingTimes = station.departures
    .filter((departure: Departure) => normalizeVoiceLineToken(departure.line) === expectedLine)
    .map((departure) => new Date(departure.departureIso).getTime())
    .filter(Number.isFinite);

  if (matchingTimes.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.min(...matchingTimes);
}

export function hasMatchingLineDeparture(
  station: StopStation | null,
  lineToken: string
): boolean {
  return getSoonestMatchingDepartureMs(station, lineToken) !== Number.POSITIVE_INFINITY;
}
