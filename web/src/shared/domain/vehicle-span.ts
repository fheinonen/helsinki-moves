export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

export interface VehicleSpanFrame {
  readonly east: number;
  readonly north: number;
  readonly openedVehicle: GeoPoint;
  readonly route: readonly GeoPoint[];
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
    }
  | {
      readonly stop: GeoPoint;
      readonly type: "place";
    };

function nearestIndex(line: readonly GeoPoint[], point: GeoPoint): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < line.length; index += 1) {
    const lat = line[index].lat - point.lat;
    const lon = line[index].lon - point.lon;
    const distance = lat * lat + lon * lon;
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

function dedupePoints(points: readonly GeoPoint[]): GeoPoint[] {
  const result: GeoPoint[] = [];
  for (const point of points) {
    const previous = result[result.length - 1];
    if (!previous || previous.lat !== point.lat || previous.lon !== point.lon) {
      result.push(point);
    }
  }
  return result;
}

function spanBounds(points: readonly GeoPoint[]): Pick<VehicleSpanFrame, "east" | "north" | "south" | "west"> {
  let east = points[0].lon;
  let north = points[0].lat;
  let south = points[0].lat;
  let west = points[0].lon;
  for (const point of points) {
    east = Math.max(east, point.lon);
    north = Math.max(north, point.lat);
    south = Math.min(south, point.lat);
    west = Math.min(west, point.lon);
  }
  return { east, north, south, west };
}

export function clipLineToSpan(line: readonly GeoPoint[], opened: GeoPoint, stop: GeoPoint): readonly GeoPoint[] {
  if (line.length < 2) {
    return [opened, stop];
  }
  const from = nearestIndex(line, opened);
  const to = nearestIndex(line, stop);
  const slice = from <= to ? line.slice(from, to + 1) : line.slice(to, from + 1).reverse();
  return dedupePoints([opened, ...slice, stop]);
}

export function frameVehicleSpan(
  openedVehicle: GeoPoint,
  stop: GeoPoint,
  line: readonly GeoPoint[] = [],
): VehicleSpanFrame {
  const route = clipLineToSpan(line, openedVehicle, stop);
  return {
    ...spanBounds(route),
    openedVehicle,
    route,
    stop,
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
    case "place":
      return view;
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}
