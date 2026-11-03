export interface TripRun {
  readonly directionId: number;
  readonly routeId: string;
  readonly startTime: string;
}

function clockTime(value: string): string | null {
  if (!/^\d{4}$/.test(value)) {
    return null;
  }
  return `${value.slice(0, 2)}:${value.slice(2)}:00`;
}

function hslDirection(value: string): number | null {
  if (value !== "1" && value !== "2") {
    return null;
  }
  return Number(value) - 1;
}

function tripParts(tripId: string): string[] | null {
  const body = tripId.includes(":") ? tripId.slice(tripId.indexOf(":") + 1) : tripId;
  const parts = body.split("_");
  return parts.length < 5 ? null : parts;
}

export function readTripRun(tripId: string): TripRun | null {
  const parts = tripParts(tripId);
  if (!parts) {
    return null;
  }
  const startTime = clockTime(parts[parts.length - 1] ?? "");
  const directionId = hslDirection(parts[parts.length - 2] ?? "");
  const dateIndex = parts.findIndex((part) => /^\d{8}$/.test(part));
  if (!startTime || directionId == null || dateIndex <= 0) {
    return null;
  }
  return {
    directionId,
    routeId: parts.slice(0, dateIndex).join("_"),
    startTime,
  };
}
