import {
  frameVehicleSpan,
  type GeoPoint,
  type VehicleSpanEvent,
} from "../../../shared/domain/vehicle-span.js";

export interface VehicleSpanRead {
  intervalMs: number;
  isActive: () => boolean;
  readRoute?: () => Promise<readonly GeoPoint[]>;
  readStop: () => Promise<GeoPoint | null>;
  readVehicle: () => Promise<GeoPoint | null>;
  sleep: (ms: number) => Promise<void>;
}

function samePoint(left: GeoPoint, right: GeoPoint): boolean {
  return left.lat === right.lat && left.lon === right.lon;
}

async function readOrNull(read: () => Promise<GeoPoint | null>): Promise<GeoPoint | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

async function waitForVehicle(input: VehicleSpanRead): Promise<GeoPoint | null> {
  while (input.isActive()) {
    const point = await readOrNull(input.readVehicle);
    if (point) {
      return point;
    }
    await input.sleep(input.intervalMs);
  }
  return null;
}

async function readLine(input: VehicleSpanRead): Promise<readonly GeoPoint[]> {
  if (!input.readRoute) {
    return [];
  }
  try {
    return await input.readRoute();
  } catch {
    return [];
  }
}

export async function* readVehicleSpan(input: VehicleSpanRead): AsyncGenerator<VehicleSpanEvent> {
  if (!input.isActive()) {
    return;
  }
  const stop = await readOrNull(input.readStop);
  if (!stop) {
    return;
  }
  let opened = await readOrNull(input.readVehicle);
  if (!opened) {
    yield { stop, type: "place" };
    opened = await waitForVehicle(input);
    if (!opened) {
      return;
    }
  }

  let vehicle = opened;
  const line = await readLine(input);
  yield { frame: frameVehicleSpan(opened, stop, line), type: "span", vehicle: opened };

  while (input.isActive()) {
    await input.sleep(input.intervalMs);
    if (!input.isActive()) {
      return;
    }
    const next = await input.readVehicle();
    if (!next || samePoint(next, vehicle)) {
      continue;
    }
    vehicle = next;
    yield { type: "position", vehicle };
  }
}
