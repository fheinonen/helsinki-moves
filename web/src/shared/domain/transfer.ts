import type { Mode } from "./mode.js";

export type TransferFeasibility = "make-it" | "tight" | "missed";

export interface TransferOption {
  readonly departureIso: string;
  readonly destination: string;
  readonly distanceMeters: number;
  readonly line: string;
  readonly mode: Mode;
  readonly platform: string | null;
  readonly stopId: string;
  readonly stopName: string;
  readonly tripId: string;
}

export interface TransfersResponse {
  readonly availableModes: readonly Mode[];
  readonly mode: Mode;
  readonly options: readonly TransferOption[];
}

export interface EvaluatedTransfer {
  readonly feasibility: TransferFeasibility;
  readonly marginSeconds: number;
  readonly option: TransferOption;
  readonly walkSeconds: number;
}

export const TRANSFER_RADIUS_METERS = 350;
const WALK_SPEED_METERS_PER_SECOND = 1.2;
const SAME_STOP_METERS = 15;
const SAME_STOP_BUFFER_SECONDS = 30;
const STATION_BUFFER_SECONDS = 45;
const COMFORTABLE_MARGIN_SECONDS = 120;

export function estimateTransferWalkSeconds(distanceMeters: number): number {
  const safeMeters = Number.isFinite(distanceMeters) ? Math.max(0, distanceMeters) : 0;
  if (safeMeters <= SAME_STOP_METERS) {
    return SAME_STOP_BUFFER_SECONDS;
  }
  return Math.round(safeMeters / WALK_SPEED_METERS_PER_SECOND) + STATION_BUFFER_SECONDS;
}

export function refineTransferWalkSeconds(routedWalkSeconds: number): number {
  const safeSeconds = Number.isFinite(routedWalkSeconds) ? Math.max(0, routedWalkSeconds) : 0;
  return Math.round(safeSeconds) + STATION_BUFFER_SECONDS;
}

export function chooseDefaultTransferMode(
  availableModes: readonly Mode[],
  currentMode: Mode,
): Mode | null {
  if (availableModes.length === 0) {
    return null;
  }
  if (availableModes.includes("RAIL") && currentMode !== "RAIL") {
    return "RAIL";
  }
  if (availableModes.includes("METRO") && currentMode !== "METRO") {
    return "METRO";
  }
  return availableModes.find((mode) => mode !== currentMode) ?? availableModes[0];
}

function classifyMargin(marginSeconds: number): TransferFeasibility {
  if (marginSeconds >= COMFORTABLE_MARGIN_SECONDS) {
    return "make-it";
  }
  if (marginSeconds >= 0) {
    return "tight";
  }
  return "missed";
}

export function evaluateTransfer(input: {
  arrivalMs: number;
  option: TransferOption;
  walkSecondsOverride?: number | null;
}): EvaluatedTransfer {
  const walkSeconds =
    input.walkSecondsOverride != null
      ? refineTransferWalkSeconds(input.walkSecondsOverride)
      : estimateTransferWalkSeconds(input.option.distanceMeters);
  const departureMs = Date.parse(input.option.departureIso);
  const marginSeconds = Math.floor((departureMs - input.arrivalMs) / 1000) - walkSeconds;
  return {
    feasibility: classifyMargin(marginSeconds),
    marginSeconds,
    option: input.option,
    walkSeconds,
  };
}

function normalizeDestination(value: string): string {
  return value.trim().toLowerCase();
}

function compareRecoveryOrder(
  left: EvaluatedTransfer,
  right: EvaluatedTransfer,
  preferredLine: string,
): number {
  const timeDelta = Date.parse(left.option.departureIso) - Date.parse(right.option.departureIso);
  if (timeDelta !== 0) {
    return timeDelta;
  }
  const leftMatches = left.option.line === preferredLine ? 0 : 1;
  const rightMatches = right.option.line === preferredLine ? 0 : 1;
  return leftMatches - rightMatches;
}

export function findRecoveryTransfer(
  watched: EvaluatedTransfer,
  candidates: readonly EvaluatedTransfer[],
): EvaluatedTransfer | null {
  const targetDest = normalizeDestination(watched.option.destination);
  const watchedDepMs = Date.parse(watched.option.departureIso);
  const catchable = candidates.filter((candidate) => {
    if (candidate.feasibility === "missed") {
      return false;
    }
    if (candidate.option.tripId === watched.option.tripId) {
      return false;
    }
    if (normalizeDestination(candidate.option.destination) !== targetDest) {
      return false;
    }
    return Date.parse(candidate.option.departureIso) >= watchedDepMs;
  });
  if (catchable.length === 0) {
    return null;
  }
  const sorted = [...catchable].sort((a, b) => compareRecoveryOrder(a, b, watched.option.line));
  return sorted[0] ?? null;
}

export function formatTransferMargin(evaluated: EvaluatedTransfer): string {
  if (evaluated.feasibility === "make-it") {
    return `✓ +${Math.floor(evaluated.marginSeconds / 60)}m`;
  }
  if (evaluated.feasibility === "tight") {
    return `! +${Math.max(0, Math.floor(evaluated.marginSeconds / 60))}m`;
  }
  return `✕ -${Math.max(1, Math.ceil(Math.abs(evaluated.marginSeconds) / 60))}m`;
}
