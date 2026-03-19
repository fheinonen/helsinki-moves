import type { Mode } from "@shared/domain/mode";

export interface PromptDepartureRequest {
  destinations: string[];
  lines: string[];
  mode: Mode;
}

interface ModePattern {
  aliases: string[];
  mode: Mode;
}

const MODE_PATTERNS: ModePattern[] = [
  { aliases: ["tram", "trams"], mode: "TRAM" },
  { aliases: ["bus", "buses"], mode: "BUS" },
  { aliases: ["train", "trains", "rail", "rails"], mode: "RAIL" },
  { aliases: ["subway", "subways", "metro", "metros"], mode: "METRO" },
];

function normalizeDestination(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/[.,]+$/g, "");
}

function collectLineNumbers(segment: string, aliases: string[]): string[] {
  const values = new Set<string>();
  const patterns = [
    /\blines?\s+([\d\s,and]+)/gi,
    new RegExp(`\\b(?:${aliases.join("|")})\\s+([\\d\\s,and]+)`, "gi"),
  ];

  for (const pattern of patterns) {
    for (const match of segment.matchAll(pattern)) {
      for (const value of String(match[1] || "").match(/\d+/g) || []) {
        values.add(value);
      }
    }
  }
  return [...values];
}

function collectDestinations(segment: string): string[] {
  const values = new Set<string>();
  const patterns = [
    /\b(?:to|towards|destination(?:\s+is)?)\s+(.+)$/gi,
    /\bonly\s+(.+?)\s+destination\b/gi,
  ];

  for (const pattern of patterns) {
    for (const match of segment.matchAll(pattern)) {
      const value = normalizeDestination(String(match[1] || ""));
      if (value) {
        values.add(value);
      }
    }
  }

  return [...values];
}

function createModeRegex(aliases: string[]): RegExp {
  return new RegExp(`\\b(?:${aliases.join("|")})\\b`, "gi");
}

function buildModeBoundaryPattern(): string {
  return MODE_PATTERNS.flatMap((pattern) => pattern.aliases).join("|");
}

function collectSegments(prompt: string): Array<{ aliases: string[]; mode: Mode; segment: string }> {
  const matches: Array<{ aliases: string[]; end: number; mode: Mode; start: number }> = [];

  for (const pattern of MODE_PATTERNS) {
    for (const match of prompt.matchAll(createModeRegex(pattern.aliases))) {
      matches.push({
        aliases: pattern.aliases,
        end: (match.index || 0) + match[0].length,
        mode: pattern.mode,
        start: match.index || 0,
      });
    }
  }

  matches.sort((left, right) => left.start - right.start);

  return matches.map((match, index) => ({
    aliases: match.aliases,
    mode: match.mode,
    segment: prompt.slice(match.start, matches[index + 1]?.start || prompt.length),
  }));
}

function mergeRequest(
  requests: Map<Mode, PromptDepartureRequest>,
  mode: Mode,
  input: { destinations: string[]; lines: string[] }
): void {
  const existing = requests.get(mode);
  if (!existing) {
    requests.set(mode, {
      destinations: input.destinations,
      lines: input.lines,
      mode,
    });
    return;
  }

  existing.lines = [...new Set([...existing.lines, ...input.lines])];
  existing.destinations = [...new Set([...existing.destinations, ...input.destinations])];
}

function mergeExplicitDestinationRequests(
  prompt: string,
  requests: Map<Mode, PromptDepartureRequest>
): void {
  for (const pattern of MODE_PATTERNS) {
    const regex = new RegExp(
      `\\bonly\\s+(.+?)\\s+destination\\s+from\\s+(?:${pattern.aliases.join("|")})\\s+([\\d\\s,and]+)`,
      "gi"
    );
    for (const match of prompt.matchAll(regex)) {
      mergeRequest(requests, pattern.mode, {
        destinations: [normalizeDestination(String(match[1] || ""))].filter(Boolean),
        lines: String(match[2] || "").match(/\d+/g) || [],
      });
    }
  }
}

export function parsePromptDepartureRequests(prompt: string): PromptDepartureRequest[] {
  const value = String(prompt || "").trim();
  if (!value) {
    return [];
  }

  const requests = new Map<Mode, PromptDepartureRequest>();
  for (const { aliases, mode, segment } of collectSegments(value)) {
    mergeRequest(requests, mode, {
      destinations: collectDestinations(segment),
      lines: collectLineNumbers(segment, aliases),
    });
  }
  mergeExplicitDestinationRequests(value, requests);

  return [...requests.values()];
}

export function parsePromptLocationQuery(prompt: string): string | null {
  const value = String(prompt || "").trim();
  if (!value) {
    return null;
  }

  const modeBoundary = buildModeBoundaryPattern();
  const patterns = [
    new RegExp(
      `\\bfrom\\s+(.+?)(?=\\s+(?:with\\s+)?(?:${modeBoundary})\\b|\\s+(?:towards|to|destination\\b)|$)`,
      "i"
    ),
    new RegExp(
      `\\b(?:${modeBoundary})\\b(?:[\\s\\w,]+?)\\bfrom\\s+(.+?)(?=\\s+(?:with\\s+)?(?:${modeBoundary})\\b|\\s+(?:towards|to|destination\\b)|$)`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    const location = normalizeDestination(String(match?.[1] || ""));
    if (location) {
      return location;
    }
  }

  return null;
}

export function promptRequiresStartingLocation(prompt: string): boolean {
  const requests = parsePromptDepartureRequests(prompt);
  if (requests.length === 0 || parsePromptLocationQuery(prompt)) {
    return false;
  }

  const hasDestinationOnlyRequest = requests.some(
    (request) => request.destinations.length > 0 && request.lines.length === 0
  );
  if (!hasDestinationOnlyRequest) {
    return false;
  }

  return /\b(?:take|go|get)\b/i.test(prompt);
}
