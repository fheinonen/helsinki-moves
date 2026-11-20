import { frameAspect, placeOnMap, streetTilesForFrame, type MapExtent } from "@shared/domain/street-map";
import type { GeoPoint } from "@shared/domain/vehicle-span";

const SVG_NS = "http://www.w3.org/2000/svg";
export const ROUTE_EDGE_COLOR = "#161616";

export interface MapSwitchAction {
  ariaLabel: string;
  label: string;
  onSwitch: () => void;
  target: "vehicle" | "walk";
}

export interface MapHeaderInput {
  closeAttr: "vehicleSpanClose" | "walkClose";
  destination: string;
  documentRef: Document;
  line: string;
  onClose: () => void;
  switchAction?: MapSwitchAction;
}

export interface MountMapStreetsInput {
  ariaLabel: string;
  canvas: HTMLElement;
  color?: string;
  documentRef: Document;
  extent: MapExtent;
  points: readonly GeoPoint[];
  stopMarker: HTMLElement;
}

export function formatCoord(value: number): string {
  return value.toFixed(6);
}

export function writeMapExtent(glass: HTMLElement, extent: MapExtent): void {
  glass.dataset.east = formatCoord(extent.east);
  glass.dataset.north = formatCoord(extent.north);
  glass.dataset.south = formatCoord(extent.south);
  glass.dataset.west = formatCoord(extent.west);
}

function routeLabel(points: readonly GeoPoint[]): string {
  return points.map((point) => `${formatCoord(point.lat)} ${formatCoord(point.lon)}`).join(" ");
}

function routePoints(extent: MapExtent, points: readonly GeoPoint[]): string {
  return points
    .map((point) => {
      const spot = placeOnMap(extent, point);
      return `${Number.parseFloat(spot.left)},${Number.parseFloat(spot.top)}`;
    })
    .join(" ");
}

function watchTileLoad(image: HTMLImageElement): void {
  if (image.complete && image.naturalWidth > 0) {
    image.dataset.tileLoaded = "true";
    return;
  }
  const markLoaded = () => {
    image.dataset.tileLoaded = "true";
  };
  image.addEventListener("load", markLoaded, { once: true });
  image.addEventListener("error", markLoaded, { once: true });
}

export function mountMapStreets(input: MountMapStreetsInput): void {
  const { ariaLabel, canvas, color, documentRef, extent, points, stopMarker } = input;
  const aspect = frameAspect(extent);
  canvas.style.aspectRatio = String(aspect);
  canvas.style.setProperty("--map-aspect", String(aspect));

  for (const tile of streetTilesForFrame(extent)) {
    const image = documentRef.createElement("img");
    image.alt = "";
    image.className = "vehicle-span__tile";
    image.dataset.streetTile = "true";
    image.decoding = "async";
    image.draggable = false;
    image.src = tile.src;
    image.style.height = tile.height;
    image.style.left = tile.left;
    image.style.top = tile.top;
    image.style.width = tile.width;
    watchTileLoad(image);
    canvas.insertBefore(image, stopMarker);
  }

  const svg = documentRef.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "vehicle-span__route");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", ariaLabel);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("viewBox", "0 0 100 100");

  const polylinePoints = routePoints(extent, points);
  const edge = documentRef.createElementNS(SVG_NS, "polyline");
  edge.setAttribute("data-route-casing", "true");
  edge.setAttribute("points", polylinePoints);
  edge.setAttribute("stroke-width", "6");
  edge.setAttribute("vector-effect", "non-scaling-stroke");
  edge.style.stroke = ROUTE_EDGE_COLOR;

  const line = documentRef.createElementNS(SVG_NS, "polyline");
  line.setAttribute("data-route-span", routeLabel(points));
  line.setAttribute("points", polylinePoints);
  line.setAttribute("stroke-width", "4");
  line.setAttribute("vector-effect", "non-scaling-stroke");
  if (color) {
    line.style.stroke = color;
  }

  svg.append(edge, line);
  canvas.insertBefore(svg, stopMarker);
}

export function buildMapHeader(input: MapHeaderInput): HTMLDivElement {
  const { closeAttr, destination, documentRef, line, onClose, switchAction } = input;
  const head = documentRef.createElement("div");
  head.className = "vehicle-span__head";

  const identity = documentRef.createElement("p");
  identity.className = "vehicle-span__identity";
  const lineText = documentRef.createElement("span");
  lineText.className = "vehicle-span__line";
  lineText.textContent = line;
  const destinationText = documentRef.createElement("span");
  destinationText.className = "vehicle-span__destination";
  destinationText.textContent = destination;
  identity.append(lineText, destinationText);

  const actions = documentRef.createElement("div");
  actions.className = "vehicle-span__head-actions";

  if (switchAction) {
    const switchButton = documentRef.createElement("button");
    switchButton.className = "vehicle-span__switch";
    switchButton.dataset.mapSwitch = switchAction.target;
    switchButton.type = "button";
    switchButton.textContent = switchAction.label;
    switchButton.setAttribute("aria-label", switchAction.ariaLabel);
    switchButton.addEventListener("click", () => {
      switchAction.onSwitch();
    });
    actions.append(switchButton);
  }

  const closeButton = documentRef.createElement("button");
  closeButton.className = "vehicle-span__close";
  closeButton.dataset[closeAttr] = "true";
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", () => {
    onClose();
  });
  actions.append(closeButton);

  head.append(identity, actions);
  return head;
}

export function scrollMapIntoView(element: HTMLElement, documentRef: Document): void {
  const reduced = documentRef.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  element.scrollIntoView?.({
    behavior: reduced ? "auto" : "smooth",
    block: "start",
  });
}
