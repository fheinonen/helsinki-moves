export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

export interface VehicleSpanFrame {
  readonly east: number;
  readonly north: number;
  readonly openedVehicle: GeoPoint;
  readonly south: number;
  readonly stop: GeoPoint;
  readonly west: number;
}

export interface VehicleSpanView {
  readonly frame: VehicleSpanFrame | null;
  readonly vehicle: GeoPoint | null;
}

export type VehicleSpanEvent =
  | {
      readonly frame: VehicleSpanFrame;
      readonly type: "span";
      readonly vehicle: GeoPoint;
    }
  | {
      readonly type: "position";
      readonly vehicle: GeoPoint;
    };

export function frameVehicleSpan(openedVehicle: GeoPoint, stop: GeoPoint): VehicleSpanFrame {
  return {
    east: Math.max(openedVehicle.lon, stop.lon),
    north: Math.max(openedVehicle.lat, stop.lat),
    openedVehicle,
    south: Math.min(openedVehicle.lat, stop.lat),
    stop,
    west: Math.min(openedVehicle.lon, stop.lon),
  };
}

export function closedVehicleSpan(): VehicleSpanView {
  return { frame: null, vehicle: null };
}

export function applyVehicleSpanEvent(view: VehicleSpanView, event: VehicleSpanEvent): VehicleSpanView {
  switch (event.type) {
    case "span":
      return {
        frame: view.frame ?? event.frame,
        vehicle: event.vehicle,
      };
    case "position":
      if (!view.frame) {
        return view;
      }
      return { frame: view.frame, vehicle: event.vehicle };
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}
