import { readTripRun, type TripRun } from "../../../shared/domain/trip-run.js";
import type { GeoPoint } from "../../../shared/domain/vehicle-span.js";

const FEED_TTL_MS = 2000;
const FEED_TIMEOUT_MS = 7000;
const FEED_URL = "https://realtime.hsl.fi/realtime/vehicle-positions/v2/hsl";
const CANCELED = 3;

interface ProtoField {
  bytes?: Uint8Array;
  field: number;
  real?: number;
  value?: number;
}

interface LiveVehicle {
  directionId: number;
  lat: number;
  lon: number;
  routeId: string;
  startDate: string;
  startTime: string;
}

interface Wire {
  bytes?: Uint8Array;
  offset: number;
  real?: number;
  value?: number;
}

function readVarint(bytes: Uint8Array, offset: number): Wire | null {
  let value = 0;
  let shift = 0;
  let pos = offset;
  while (pos < bytes.length && shift <= 28) {
    const byte = bytes[pos];
    pos += 1;
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) {
      return { offset: pos, value };
    }
    shift += 7;
  }
  return null;
}

function readFloat(bytes: Uint8Array, offset: number): Wire | null {
  if (offset + 4 > bytes.length) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
  return { offset: offset + 4, real: view.getFloat32(0, true) };
}

function readBytes(bytes: Uint8Array, offset: number): Wire | null {
  const length = readVarint(bytes, offset);
  if (!length || length.value == null || length.offset + length.value > bytes.length) {
    return null;
  }
  return {
    bytes: bytes.subarray(length.offset, length.offset + length.value),
    offset: length.offset + length.value,
  };
}

function readWire(bytes: Uint8Array, offset: number, wire: number): Wire | null {
  if (wire === 0) {
    return readVarint(bytes, offset);
  }
  if (wire === 1) {
    return offset + 8 <= bytes.length ? { offset: offset + 8 } : null;
  }
  if (wire === 5) {
    return readFloat(bytes, offset);
  }
  if (wire === 2) {
    return readBytes(bytes, offset);
  }
  return null;
}

function readFields(bytes: Uint8Array): ProtoField[] {
  const fields: ProtoField[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const key = readVarint(bytes, offset);
    if (!key || key.value == null) {
      return fields;
    }
    const wire = readWire(bytes, key.offset, key.value & 7);
    if (!wire) {
      return fields;
    }
    fields.push({ bytes: wire.bytes, field: key.value >> 3, real: wire.real, value: wire.value });
    offset = wire.offset;
  }
  return fields;
}

function textOf(fields: readonly ProtoField[], field: number): string {
  const match = fields.find((item) => item.field === field && item.bytes);
  return match?.bytes ? new TextDecoder().decode(match.bytes) : "";
}

function numberOf(fields: readonly ProtoField[], field: number): number | null {
  const match = fields.find((item) => item.field === field && item.value != null);
  return match?.value ?? null;
}

function readPosition(bytes: Uint8Array): GeoPoint | null {
  const fields = readFields(bytes);
  const lat = fields.find((field) => field.field === 1)?.real;
  const lon = fields.find((field) => field.field === 2)?.real;
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return { lat, lon };
}

function sameRun(vehicle: LiveVehicle, run: TripRun): boolean {
  return vehicle.routeId === run.routeId && vehicle.startTime === run.startTime && vehicle.directionId === run.directionId;
}

function describedRun(tripFields: readonly ProtoField[]): Omit<LiveVehicle, "lat" | "lon"> | null {
  const routeId = textOf(tripFields, 5);
  const startTime = textOf(tripFields, 2);
  const startDate = textOf(tripFields, 3);
  const directionId = numberOf(tripFields, 6);
  if (!routeId || !startTime || !startDate || directionId == null) {
    return null;
  }
  return { directionId, routeId, startDate, startTime };
}

function vehicleFrom(tripFields: readonly ProtoField[], position: Uint8Array): LiveVehicle | null {
  const run = describedRun(tripFields);
  const point = readPosition(position);
  if (!run || !point) {
    return null;
  }
  return { ...run, lat: point.lat, lon: point.lon };
}

function readVehicle(bytes: Uint8Array): LiveVehicle | null {
  const parts = readFields(bytes);
  const trip = parts.find((field) => field.field === 1)?.bytes;
  const position = parts.find((field) => field.field === 2)?.bytes;
  if (!trip || !position || numberOf(readFields(trip), 4) === CANCELED) {
    return null;
  }
  return vehicleFrom(readFields(trip), position);
}

function readLiveVehicles(bytes: Uint8Array): LiveVehicle[] {
  const vehicles: LiveVehicle[] = [];
  for (const entity of readFields(bytes)) {
    const vehicle = entity.field === 2 ? readVehicle(entityField(entity)) : null;
    if (vehicle) {
      vehicles.push(vehicle);
    }
  }
  return vehicles;
}

function entityField(entity: ProtoField): Uint8Array {
  const vehicle = entity.bytes ? readFields(entity.bytes).find((field) => field.field === 4 && field.bytes) : undefined;
  return vehicle?.bytes ?? new Uint8Array();
}

export function serviceDate(nowMs: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Helsinki",
    year: "numeric",
  }).formatToParts(new Date(nowMs));
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value ?? "").join("");
}

export function findLiveVehicle(vehicles: readonly LiveVehicle[], tripId: string, serviceDay: string): GeoPoint | null {
  const run = readTripRun(tripId);
  if (!run) {
    return null;
  }
  const matches = vehicles.filter((vehicle) => sameRun(vehicle, run));
  const chosen = matches.find((vehicle) => vehicle.startDate === serviceDay) ?? matches[0];
  if (!chosen) {
    return null;
  }
  return { lat: chosen.lat, lon: chosen.lon };
}

async function loadFeed(fetchImpl: typeof fetch): Promise<readonly LiveVehicle[] | null> {
  try {
    const response = await fetchImpl(FEED_URL, {
      headers: {
        accept: "application/x-protobuf",
        "user-agent": "HelsinkiMoves/1.0",
      },
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    });
    if (!response.ok) {
      return [];
    }
    return readLiveVehicles(new Uint8Array(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

export function createLiveVehicleReader(input: {
  fetchImpl?: typeof fetch;
  now?: () => number;
} = {}): (tripId: string) => Promise<GeoPoint | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? Date.now;
  let cache: { at: number; vehicles: readonly LiveVehicle[] } | null = null;

  return async (tripId) => {
    const stamped = now();
    if (!cache || stamped - cache.at >= FEED_TTL_MS) {
      const loaded = await loadFeed(fetchImpl);
      if (loaded) {
        cache = { at: stamped, vehicles: loaded };
      }
      return findLiveVehicle(loaded ?? [], tripId, serviceDate(stamped));
    }
    return findLiveVehicle(cache.vehicles, tripId, serviceDate(stamped));
  };
}
