export const MODES = ["RAIL", "TRAM", "METRO", "BUS"] as const;

export type Mode = (typeof MODES)[number];

interface ModeDefinition {
  defaultResultLimit: number;
  noNearbyMessage: string;
  upstreamMode: "BUS" | "RAIL" | "SUBWAY" | "TRAM";
}

const MODE_DEFINITIONS: Record<Mode, ModeDefinition> = {
  BUS: {
    defaultResultLimit: 24,
    noNearbyMessage: "No nearby bus stops",
    upstreamMode: "BUS",
  },
  METRO: {
    defaultResultLimit: 8,
    noNearbyMessage: "No nearby metro stops",
    upstreamMode: "SUBWAY",
  },
  RAIL: {
    defaultResultLimit: 8,
    noNearbyMessage: "No nearby train stations",
    upstreamMode: "RAIL",
  },
  TRAM: {
    defaultResultLimit: 8,
    noNearbyMessage: "No nearby tram stops",
    upstreamMode: "TRAM",
  },
};

export function isMode(value: unknown): value is Mode {
  return typeof value === "string" && MODES.includes(value as Mode);
}

export function parseMode(value: unknown, fallback: Mode = "RAIL"): Mode {
  return isMode(value) ? value : fallback;
}

export function getDefaultResultLimit(mode: Mode): number {
  return MODE_DEFINITIONS[mode].defaultResultLimit;
}

export function getNoNearbyStopsMessage(mode: Mode): string {
  return MODE_DEFINITIONS[mode].noNearbyMessage;
}

export function getUpstreamMode(mode: Mode): ModeDefinition["upstreamMode"] {
  return MODE_DEFINITIONS[mode].upstreamMode;
}
