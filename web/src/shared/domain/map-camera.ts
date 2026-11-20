export interface MapCamera {
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
}

export interface MapViewport {
  readonly height: number;
  readonly width: number;
}

export interface MapPoint {
  readonly x: number;
  readonly y: number;
}

export const MAP_MIN_ZOOM = 1;
export const MAP_MAX_ZOOM = 4;
export const MAP_ZOOM_STEP = 1.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function cleanZero(value: number): number {
  return Math.abs(value) < 0.01 ? 0 : value;
}

export function createMapCamera(): MapCamera {
  return { panX: 0, panY: 0, zoom: MAP_MIN_ZOOM };
}

export function isDefaultMapCamera(camera: MapCamera): boolean {
  return (
    camera.zoom <= MAP_MIN_ZOOM + 1e-4 &&
    Math.abs(camera.panX) < 0.5 &&
    Math.abs(camera.panY) < 0.5
  );
}

export function clampMapCamera(camera: MapCamera, viewport: MapViewport): MapCamera {
  const zoom = clamp(camera.zoom, MAP_MIN_ZOOM, MAP_MAX_ZOOM);
  const maxPanX = Math.max(0, ((zoom - 1) * Math.max(0, viewport.width)) / 2);
  const maxPanY = Math.max(0, ((zoom - 1) * Math.max(0, viewport.height)) / 2);
  return {
    panX: cleanZero(clamp(camera.panX, -maxPanX, maxPanX)),
    panY: cleanZero(clamp(camera.panY, -maxPanY, maxPanY)),
    zoom,
  };
}

export function panMapCamera(
  camera: MapCamera,
  dx: number,
  dy: number,
  viewport: MapViewport,
): MapCamera {
  return clampMapCamera(
    {
      panX: camera.panX + dx,
      panY: camera.panY + dy,
      zoom: camera.zoom,
    },
    viewport,
  );
}

export function zoomMapCameraAt(
  camera: MapCamera,
  factor: number,
  focus: MapPoint,
  viewport: MapViewport,
): MapCamera {
  const nextZoom = clamp(camera.zoom * factor, MAP_MIN_ZOOM, MAP_MAX_ZOOM);
  const ratio = nextZoom / camera.zoom;
  const fx = focus.x - viewport.width / 2;
  const fy = focus.y - viewport.height / 2;
  return clampMapCamera(
    {
      panX: fx - ratio * (fx - camera.panX),
      panY: fy - ratio * (fy - camera.panY),
      zoom: nextZoom,
    },
    viewport,
  );
}

export function stepMapCameraZoom(
  camera: MapCamera,
  direction: "in" | "out",
  viewport: MapViewport,
): MapCamera {
  const factor = direction === "in" ? MAP_ZOOM_STEP : 1 / MAP_ZOOM_STEP;
  return zoomMapCameraAt(
    camera,
    factor,
    { x: viewport.width / 2, y: viewport.height / 2 },
    viewport,
  );
}
