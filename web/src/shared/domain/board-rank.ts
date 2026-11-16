import type { Departure } from "./departure.js";

const CURSOR_SEPARATOR = "\u001f";
const CURSOR_FIELD_COUNT = 5;

const boardCursorBrand: unique symbol = Symbol("BoardCursor");

export type BoardCursor = {
  readonly [boardCursorBrand]: "BoardCursor";
  readonly departureMs: number;
  readonly tie: string;
};

function blank(value: string | null | undefined): string {
  return value ?? "";
}

function instantMs(departure: Departure): number {
  return Date.parse(departure.departureIso);
}

function finiteInstant(departure: Departure): number | null {
  const timeMs = instantMs(departure);
  if (!Number.isFinite(timeMs)) {
    return null;
  }
  return timeMs;
}

function tieOf(departure: Departure): string {
  return [departure.line, departure.destination, blank(departure.stopId), blank(departure.track)].join(
    CURSOR_SEPARATOR
  );
}

function createCursor(departureMs: number, tie: string): BoardCursor {
  return {
    [boardCursorBrand]: "BoardCursor",
    departureMs,
    tie,
  };
}

function compareTies(left: Departure, right: Departure): number {
  const leftTie = tieOf(left);
  const rightTie = tieOf(right);
  if (leftTie < rightTie) {
    return -1;
  }
  if (leftTie > rightTie) {
    return 1;
  }
  return 0;
}

function compareInstants(
  leftMs: number,
  rightMs: number,
  left: Departure,
  right: Departure
): number {
  if (leftMs !== rightMs) {
    return leftMs - rightMs;
  }
  return compareTies(left, right);
}

export function compareBoardOrder(left: Departure, right: Departure): number {
  const leftMs = finiteInstant(left);
  const rightMs = finiteInstant(right);
  if (leftMs == null || rightMs == null) {
    return instantMs(left) - instantMs(right);
  }
  return compareInstants(leftMs, rightMs, left, right);
}

export function tailCursor(departures: readonly Departure[]): BoardCursor | null {
  const last = departures[departures.length - 1];
  if (!last) {
    return null;
  }
  const departureMs = finiteInstant(last);
  if (departureMs == null) {
    return null;
  }
  return createCursor(departureMs, tieOf(last));
}

export function isStrictlyAfter(departure: Departure, cursor: BoardCursor): boolean {
  const departureMs = finiteInstant(departure);
  if (departureMs == null) {
    return false;
  }
  if (departureMs !== cursor.departureMs) {
    return departureMs > cursor.departureMs;
  }
  return tieOf(departure) > cursor.tie;
}

export function formatBoardCursor(cursor: BoardCursor): string {
  return `${cursor.departureMs}${CURSOR_SEPARATOR}${cursor.tie}`;
}

function parseCursorInstant(raw: string): number | null {
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const departureMs = Number(raw);
  if (!Number.isSafeInteger(departureMs)) {
    return null;
  }
  return departureMs;
}

export function parseBoardCursor(raw: string): BoardCursor | null {
  const fields = raw.split(CURSOR_SEPARATOR);
  if (fields.length !== CURSOR_FIELD_COUNT) {
    return null;
  }
  const departureMs = parseCursorInstant(fields[0] ?? "");
  if (departureMs == null) {
    return null;
  }
  return createCursor(departureMs, fields.slice(1).join(CURSOR_SEPARATOR));
}

function rankKey(departure: Departure): string {
  const departureMs = finiteInstant(departure);
  return `${departureMs ?? ""}${CURSOR_SEPARATOR}${tieOf(departure)}`;
}

function keepSuffixRow(row: Departure, tail: BoardCursor, seen: Set<string>): boolean {
  if (!isStrictlyAfter(row, tail)) {
    return false;
  }
  const key = rankKey(row);
  if (seen.has(key)) {
    return false;
  }
  seen.add(key);
  return true;
}

export function mergeLaterDepartures(
  current: readonly Departure[],
  incoming: readonly Departure[]
): readonly Departure[] {
  const tail = tailCursor(current);
  if (!tail) {
    return current;
  }
  const seen = new Set(current.map(rankKey));
  const suffix = incoming.filter((row) => keepSuffixRow(row, tail, seen));
  if (suffix.length === 0) {
    return current;
  }
  return current.concat(suffix.toSorted(compareBoardOrder));
}
