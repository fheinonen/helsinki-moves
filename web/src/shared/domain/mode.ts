export const MODES = ["RAIL", "TRAM", "METRO", "BUS"] as const;

export type Mode = (typeof MODES)[number];

interface ModeDefinition {
  noNearbyMessage: string;
  upstreamMode: "BUS" | "RAIL" | "SUBWAY" | "TRAM";
}

const MODE_DEFINITIONS: Record<Mode, ModeDefinition> = {
  BUS: {
    noNearbyMessage: "No nearby bus stops",
    upstreamMode: "BUS",
  },
  METRO: {
    noNearbyMessage: "No nearby metro stops",
    upstreamMode: "SUBWAY",
  },
  RAIL: {
    noNearbyMessage: "No nearby train stations",
    upstreamMode: "RAIL",
  },
  TRAM: {
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

export function getNoNearbyStopsMessage(mode: Mode): string {
  return MODE_DEFINITIONS[mode].noNearbyMessage;
}

export function getUpstreamMode(mode: Mode): ModeDefinition["upstreamMode"] {
  return MODE_DEFINITIONS[mode].upstreamMode;
}
