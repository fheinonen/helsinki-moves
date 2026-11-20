import {
  createMapCamera,
  isDefaultMapCamera,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  panMapCamera,
  stepMapCameraZoom,
  zoomMapCameraAt,
  type MapCamera,
  type MapPoint,
  type MapViewport,
} from "@shared/domain/map-camera";

const SVG_NS = "http://www.w3.org/2000/svg";
const KEY_PAN_PX = 48;
const WHEEL_ZOOM_FACTOR = 1.18;

export interface InteractiveMapController {
  destroy(): void;
  reset(): void;
}

interface AttachInteractiveMapInput {
  canvas: HTMLElement;
  documentRef: Document;
  glass: HTMLElement;
  onClose: () => void;
}

interface MapControlButtons {
  container: HTMLDivElement;
  expand: HTMLButtonElement;
  reset: HTMLButtonElement;
  zoomIn: HTMLButtonElement;
  zoomOut: HTMLButtonElement;
}

function isInteractiveChild(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, a, [data-map-controls]") !== null;
}

function viewportOf(glass: HTMLElement): MapViewport {
  const rect = glass.getBoundingClientRect();
  return {
    height: rect.height > 0 ? rect.height : 280,
    width: rect.width > 0 ? rect.width : 360,
  };
}

function localPoint(glass: HTMLElement, clientX: number, clientY: number): MapPoint {
  const rect = glass.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

function createControlIcon(documentRef: Document, pathData: string): SVGSVGElement {
  const svg = documentRef.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "map-controls__icon");
  svg.setAttribute("fill", "none");
  svg.setAttribute("viewBox", "0 0 20 20");
  const path = documentRef.createElementNS(SVG_NS, "path");
  path.setAttribute("d", pathData);
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-width", "1.8");
  svg.append(path);
  return svg;
}

function createControlButton(input: {
  ariaLabel: string;
  attr: string;
  documentRef: Document;
  pathData: string;
}): HTMLButtonElement {
  const button = input.documentRef.createElement("button");
  button.type = "button";
  button.className = "map-controls__button";
  button.dataset[input.attr] = "true";
  button.setAttribute("aria-label", input.ariaLabel);
  button.append(createControlIcon(input.documentRef, input.pathData));
  return button;
}

function createMapControls(documentRef: Document): MapControlButtons {
  const container = documentRef.createElement("div");
  container.className = "map-controls";
  container.dataset.mapControls = "true";
  const zoomIn = createControlButton({
    ariaLabel: "Zoom in",
    attr: "mapZoomIn",
    documentRef,
    pathData: "M10 4.5v11M4.5 10h11",
  });
  const zoomOut = createControlButton({
    ariaLabel: "Zoom out",
    attr: "mapZoomOut",
    documentRef,
    pathData: "M4.5 10h11",
  });
  const reset = createControlButton({
    ariaLabel: "Reset map view",
    attr: "mapReset",
    documentRef,
    pathData: "M4.5 8V4.5H8M15.5 8V4.5H12M4.5 12v3.5H8M15.5 12v3.5H12",
  });
  const expand = createControlButton({
    ariaLabel: "Expand map",
    attr: "mapExpand",
    documentRef,
    pathData: "M12.5 4.5h3v3M7.5 15.5h-3v-3M15.5 4.5l-4.2 4.2M4.5 15.5l4.2-4.2",
  });
  expand.setAttribute("aria-pressed", "false");
  container.append(zoomIn, zoomOut, reset, expand);
  return { container, expand, reset, zoomIn, zoomOut };
}

function pairMetrics(first: MapPoint, second: MapPoint): { center: MapPoint; distance: number } {
  return {
    center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  };
}

function panOffsetForKey(key: string): MapPoint | null {
  switch (key) {
    case "ArrowLeft":
      return { x: KEY_PAN_PX, y: 0 };
    case "ArrowRight":
      return { x: -KEY_PAN_PX, y: 0 };
    case "ArrowUp":
      return { x: 0, y: KEY_PAN_PX };
    case "ArrowDown":
      return { x: 0, y: -KEY_PAN_PX };
    default:
      return null;
  }
}

export function attachInteractiveMap(input: AttachInteractiveMapInput): InteractiveMapController {
  const { canvas, documentRef, glass, onClose } = input;
  const controls = createMapControls(documentRef);
  const pointers = new Map<number, MapPoint>();
  let camera: MapCamera = createMapCamera();
  let expanded = false;

  glass.tabIndex = 0;
  glass.append(controls.container);

  function syncCamera(): void {
    const atDefault = isDefaultMapCamera(camera);
    canvas.style.setProperty("--map-zoom", String(camera.zoom));
    canvas.style.setProperty("--map-pan-x", `${camera.panX.toFixed(1)}px`);
    canvas.style.setProperty("--map-pan-y", `${camera.panY.toFixed(1)}px`);
    glass.dataset.mapZoom = camera.zoom.toFixed(2);
    glass.classList.toggle("is-zoomed", !atDefault);
    controls.zoomIn.disabled = camera.zoom >= MAP_MAX_ZOOM - 1e-4;
    controls.zoomOut.disabled = camera.zoom <= MAP_MIN_ZOOM + 1e-4;
    controls.reset.disabled = atDefault;
  }

  function setCamera(next: MapCamera): void {
    camera = next;
    syncCamera();
  }

  function reset(): void {
    setCamera(createMapCamera());
  }

  function setDragging(active: boolean): void {
    glass.classList.toggle("is-dragging", active);
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || isInteractiveChild(event.target)) {
      return;
    }
    pointers.set(event.pointerId, localPoint(glass, event.clientX, event.clientY));
    glass.setPointerCapture?.(event.pointerId);
    setDragging(true);
  }

  function applyPinch(id: number, nextPoint: MapPoint): void {
    const entries = [...pointers.entries()];
    const other = entries.find(([pointerId]) => pointerId !== id)?.[1];
    const previous = pointers.get(id);
    if (!other || !previous) {
      return;
    }
    const before = pairMetrics(previous, other);
    const after = pairMetrics(nextPoint, other);
    const viewport = viewportOf(glass);
    let nextCamera = panMapCamera(
      camera,
      after.center.x - before.center.x,
      after.center.y - before.center.y,
      viewport,
    );
    if (before.distance > 4 && after.distance > 4) {
      nextCamera = zoomMapCameraAt(nextCamera, after.distance / before.distance, after.center, viewport);
    }
    setCamera(nextCamera);
  }

  function onPointerMove(event: PointerEvent): void {
    const previous = pointers.get(event.pointerId);
    if (!previous) {
      return;
    }
    const nextPoint = localPoint(glass, event.clientX, event.clientY);
    if (pointers.size >= 2) {
      applyPinch(event.pointerId, nextPoint);
      pointers.set(event.pointerId, nextPoint);
      return;
    }
    setCamera(panMapCamera(camera, nextPoint.x - previous.x, nextPoint.y - previous.y, viewportOf(glass)));
    pointers.set(event.pointerId, nextPoint);
  }

  function onPointerEnd(event: PointerEvent): void {
    if (!pointers.delete(event.pointerId)) {
      return;
    }
    if (pointers.size === 0) {
      setDragging(false);
    }
  }

  function onWheel(event: WheelEvent): void {
    if (event.deltaY === 0) {
      return;
    }
    event.preventDefault();
    const factor = event.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
    setCamera(
      zoomMapCameraAt(camera, factor, localPoint(glass, event.clientX, event.clientY), viewportOf(glass)),
    );
  }

  function onDoubleClick(event: MouseEvent): void {
    if (isInteractiveChild(event.target)) {
      return;
    }
    if (!isDefaultMapCamera(camera)) {
      reset();
      return;
    }
    setCamera(
      zoomMapCameraAt(camera, 2, localPoint(glass, event.clientX, event.clientY), viewportOf(glass)),
    );
  }

  function onGlassKeyDown(event: KeyboardEvent): void {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setCamera(stepMapCameraZoom(camera, "in", viewportOf(glass)));
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      setCamera(stepMapCameraZoom(camera, "out", viewportOf(glass)));
      return;
    }
    if (event.key === "0") {
      event.preventDefault();
      reset();
      return;
    }
    const pan = panOffsetForKey(event.key);
    if (pan) {
      event.preventDefault();
      setCamera(panMapCamera(camera, pan.x, pan.y, viewportOf(glass)));
    }
  }

  function onDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  controls.zoomIn.addEventListener("click", () => {
    setCamera(stepMapCameraZoom(camera, "in", viewportOf(glass)));
  });
  controls.zoomOut.addEventListener("click", () => {
    setCamera(stepMapCameraZoom(camera, "out", viewportOf(glass)));
  });
  controls.reset.addEventListener("click", () => {
    reset();
  });
  controls.expand.addEventListener("click", () => {
    expanded = !expanded;
    glass.classList.toggle("is-expanded", expanded);
    controls.expand.setAttribute("aria-pressed", String(expanded));
    controls.expand.setAttribute("aria-label", expanded ? "Collapse map" : "Expand map");
  });

  glass.addEventListener("dblclick", onDoubleClick);
  glass.addEventListener("keydown", onGlassKeyDown);
  glass.addEventListener("pointercancel", onPointerEnd);
  glass.addEventListener("pointerdown", onPointerDown);
  glass.addEventListener("pointermove", onPointerMove);
  glass.addEventListener("pointerup", onPointerEnd);
  glass.addEventListener("wheel", onWheel, { passive: false });
  documentRef.addEventListener("keydown", onDocumentKeyDown);

  syncCamera();

  return {
    destroy() {
      pointers.clear();
      documentRef.removeEventListener("keydown", onDocumentKeyDown);
      glass.removeEventListener("dblclick", onDoubleClick);
      glass.removeEventListener("keydown", onGlassKeyDown);
      glass.removeEventListener("pointercancel", onPointerEnd);
      glass.removeEventListener("pointerdown", onPointerDown);
      glass.removeEventListener("pointermove", onPointerMove);
      glass.removeEventListener("pointerup", onPointerEnd);
      glass.removeEventListener("wheel", onWheel);
    },
    reset,
  };
}
