import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import { getUpstreamMode } from "@shared/domain/mode";

export type CreateBoardMode = ReturnType<typeof getUpstreamMode> | "FERRY";

export interface CreateDepartureBoardRow {
  destination: string;
  groupStart: boolean;
  id: string;
  line: string;
  minutes: number;
  mode: CreateBoardMode;
  modeGroupLabel: string | null;
  modeGroupSummary: string | null;
  platformLabel: string | null;
  stopLabel: string | null;
  stopCode: string | null;
  stopName: string | null;
  track: string | null;
}

export interface CreateDepartureBoardState {
  departures: CreateDepartureBoardRow[];
  sections: CreateDepartureBoardSection[];
  stopCode: string | null;
  stopName: string;
}

export interface CreateDepartureBoardSection {
  departures: CreateDepartureBoardRow[];
  id: string;
  stopCode: string | null;
  stopName: string;
  track: string | null;
}

interface CreateDepartureBoardStateInput {
  nowMs: number;
  response: DeparturesSuccessResponse;
}

interface CreateMultiDepartureBoardStateInput {
  nowMs: number;
  responses: DeparturesSuccessResponse[];
}

const MODE_LABELS: Record<CreateBoardMode, string> = {
  BUS: "Bus",
  FERRY: "Ferry",
  RAIL: "Rail",
  SUBWAY: "Metro",
  TRAM: "Tram",
};

function toMinutes(departureIso: string, nowMs: number): number {
  return Math.max(0, Math.floor((Date.parse(departureIso) - nowMs) / 60_000));
}

function toBoardRow(
  departure: NonNullable<DeparturesSuccessResponse["station"]>["departures"][number],
  fallbackStopCode: string | null,
  fallbackStopName: string | null,
  mode: CreateBoardMode,
  nowMs: number
): CreateDepartureBoardRow {
  const stopCode = departure.stopCode ?? fallbackStopCode ?? null;
  const stopName = departure.stopName ?? fallbackStopName ?? null;
  const track = departure.track ?? null;
  return {
    destination: departure.destination,
    groupStart: false,
    id: `${departure.line}-${departure.departureIso}`,
    line: departure.line,
    minutes: toMinutes(departure.departureIso, nowMs),
    mode,
    modeGroupLabel: null,
    modeGroupSummary: null,
    platformLabel: mode === "RAIL" && track ? `Track ${track}` : stopCode ? `Stop ${stopCode}` : null,
    stopCode,
    stopLabel: stopName,
    stopName,
    track,
  };
}

function toModeGroupSummary(lines: string[]): string | null {
  if (lines.length === 0) {
    return null;
  }
  return lines.length === 1 ? `Line ${lines[0]}` : `Lines ${lines.join(", ")}`;
}

function withModeGroups(rows: CreateDepartureBoardRow[]): CreateDepartureBoardRow[] {
  const nextRows = rows.map((row) => ({ ...row }));
  let index = 0;

  while (index < nextRows.length) {
    const startIndex = index;
    const mode = nextRows[index]?.mode;
    const lines = new Set<string>();

    while (index < nextRows.length && nextRows[index]?.mode === mode) {
      lines.add(nextRows[index].line);
      index += 1;
    }

    const firstRow = nextRows[startIndex];
    if (!firstRow || !mode) {
      continue;
    }

    firstRow.groupStart = true;
    firstRow.modeGroupLabel = MODE_LABELS[mode];
    firstRow.modeGroupSummary = toModeGroupSummary([...lines]);
  }

  return nextRows;
}

function createSections(rows: CreateDepartureBoardRow[], fallbackStopName: string): CreateDepartureBoardSection[] {
  const sections = new Map<string, CreateDepartureBoardSection>();
  for (const row of rows) {
    const stopName = row.stopName || fallbackStopName;
    const key = `${stopName}::${row.track || row.stopCode || ""}`;
    const existing = sections.get(key);
    if (existing) {
      existing.departures.push(row);
      continue;
    }

    sections.set(key, {
      departures: [row],
      id: key,
      stopCode: row.stopCode,
      stopName,
      track: row.track,
    });
  }

  return [...sections.values()];
}

export function createDepartureBoardState(
  input: CreateDepartureBoardStateInput
): CreateDepartureBoardState {
  const { nowMs, response } = input;
  const station = response.station;
  if (!station) {
    return {
      departures: [],
      sections: [],
      stopCode: null,
      stopName: "No stop selected",
    };
  }

  const mode = getUpstreamMode(response.mode);
  const departures = station.departures.map((departure) =>
    toBoardRow(departure, station.stopCode ?? null, station.stopName, mode, nowMs)
  );
  const groupedDepartures = withModeGroups(departures);
  return {
    departures: groupedDepartures,
    sections: createSections(groupedDepartures, station.stopName),
    stopCode: station.stopCode ?? null,
    stopName: station.stopName,
  };
}

export function createMultiDepartureBoardState(
  input: CreateMultiDepartureBoardStateInput
): CreateDepartureBoardState {
  const { nowMs, responses } = input;
  const partialStates = responses.map((response) => createDepartureBoardState({ nowMs, response }));
  const firstStationState = partialStates.find((state) => state.stopName !== "No stop selected");
  const departures = partialStates.flatMap((state) => state.departures);

  const groupedDepartures = withModeGroups(departures);
  return {
    departures: groupedDepartures,
    sections: createSections(groupedDepartures, firstStationState?.stopName || "No stop selected"),
    stopCode: firstStationState?.stopCode ?? null,
    stopName: firstStationState?.stopName || "No stop selected",
  };
}
