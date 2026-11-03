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

export async function* readVehicleSpan(input: VehicleSpanRead): AsyncGenerator<VehicleSpanEvent> {
  if (!input.isActive()) {
    return;
  }
  const stop = await input.readStop();
  const opened = await input.readVehicle();
  if (!stop || !opened) {
    return;
  }

  let vehicle = opened;
  const line = input.readRoute ? await input.readRoute() : [];
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
