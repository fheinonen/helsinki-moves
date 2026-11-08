import { appendOsmCredit, OSM_MAP_CREDIT } from "@client/features/map/osm-credit";
import { frameAspect, placeOnMap, streetTilesForFrame } from "@shared/domain/street-map";
import {
  applyVehicleSpanEvent,
  closedVehicleSpan,
  frameVehicleSpan,
  type GeoPoint,
  type VehicleSpanEvent,
  type VehicleSpanFrame,
} from "@shared/domain/vehicle-span";

interface VehicleSpanMapOptions {
  destination: string;
  destinationColor?: string;
  documentRef: Document;
  line: string;
  onClose: () => void;
}

export interface VehicleSpanMap {
  apply(event: VehicleSpanEvent): void;
  close(): void;
  element: HTMLElement;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function coord(value: number): string {
  return value.toFixed(6);
}

function place(marker: HTMLElement, frame: VehicleSpanFrame, point: GeoPoint): void {
  const spot = placeOnMap(frame, point);
  marker.style.left = spot.left;
  marker.style.top = spot.top;
}

function writeFrame(glass: HTMLElement, frame: VehicleSpanFrame): void {
  glass.dataset.east = coord(frame.east);
  glass.dataset.north = coord(frame.north);
  glass.dataset.south = coord(frame.south);
  glass.dataset.west = coord(frame.west);
}

function routeLabel(frame: VehicleSpanFrame): string {
  return frame.route.map((point) => `${coord(point.lat)} ${coord(point.lon)}`).join(" ");
}

function routePoints(frame: VehicleSpanFrame): string {
  return frame.route
    .map((point) => {
      const spot = placeOnMap(frame, point);
      return `${Number.parseFloat(spot.left)},${Number.parseFloat(spot.top)}`;
    })
    .join(" ");
}

function clearStreets(glass: HTMLElement): void {
  for (const node of glass.querySelectorAll("[data-street-tile], .vehicle-span__route")) {
    node.remove();
  }
}

function fitCanvas(canvas: HTMLElement, frame: VehicleSpanFrame): void {
  const aspect = frameAspect(frame);
  canvas.style.aspectRatio = String(aspect);
  canvas.style.setProperty("--map-aspect", String(aspect));
}

function mountStreets(input: {
  canvas: HTMLElement;
  destinationColor?: string;
  documentRef: Document;
  frame: VehicleSpanFrame;
  stopMarker: HTMLElement;
}): void {
  const { canvas, destinationColor, documentRef, frame, stopMarker } = input;
  fitCanvas(canvas, frame);
  for (const tile of streetTilesForFrame(frame)) {
    const image = documentRef.createElement("img");
    image.alt = "";
    image.className = "vehicle-span__tile";
    image.dataset.streetTile = "true";
    image.decoding = "async";
    image.src = tile.src;
    image.style.height = tile.height;
    image.style.left = tile.left;
    image.style.top = tile.top;
    image.style.width = tile.width;
    canvas.insertBefore(image, stopMarker);
  }

  const svg = documentRef.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "vehicle-span__route");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("viewBox", "0 0 100 100");
  const line = documentRef.createElementNS(SVG_NS, "polyline");
  line.setAttribute("data-route-span", routeLabel(frame));
  line.setAttribute("points", routePoints(frame));
  if (destinationColor) {
    line.style.stroke = destinationColor;
  }
  svg.append(line);
  canvas.insertBefore(svg, stopMarker);
}

export function createVehicleSpanMap(options: VehicleSpanMapOptions): VehicleSpanMap {
  const { destination, destinationColor, documentRef, line, onClose } = options;
  const element = documentRef.createElement("section");
  element.className = "vehicle-span";
  element.dataset.vehicleMap = "true";
  element.setAttribute("aria-label", `${line} to ${destination}`);

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

  const closeButton = documentRef.createElement("button");
  closeButton.className = "vehicle-span__close";
  closeButton.dataset.vehicleSpanClose = "true";
  closeButton.type = "button";
  closeButton.textContent = "Close";
  head.append(identity, closeButton);

  const glass = documentRef.createElement("div");
  glass.className = "vehicle-span__glass";
  glass.dataset.vehicleGlass = "true";
  const status = documentRef.createElement("p");
  status.className = "vehicle-span__status";
  status.dataset.vehicleStatus = "true";
  status.textContent = "Finding the vehicle";
  const stopMarker = documentRef.createElement("span");
  stopMarker.className = "vehicle-span__stop";
  stopMarker.dataset.stopMarker = "true";
  stopMarker.setAttribute("aria-label", destination);
  const vehicleMarker = documentRef.createElement("span");
  vehicleMarker.className = "vehicle-span__vehicle";
  vehicleMarker.dataset.vehicleMarker = "true";
  if (destinationColor) {
    vehicleMarker.style.background = destinationColor;
  }
  const credit = documentRef.createElement("p");
  credit.className = "vehicle-span__credit";
  appendOsmCredit(credit, documentRef, OSM_MAP_CREDIT);
  const canvas = documentRef.createElement("div");
  canvas.className = "vehicle-span__canvas";
  canvas.dataset.vehicleCanvas = "true";
  canvas.append(stopMarker, vehicleMarker);
  glass.append(status, canvas, credit);
  element.append(head, glass);

  let view = closedVehicleSpan();

  const showStop = (stop: GeoPoint) => {
    const frame = frameVehicleSpan(stop, stop);
    clearStreets(glass);
    writeFrame(glass, frame);
    mountStreets({ canvas, destinationColor, documentRef, frame, stopMarker });
    place(stopMarker, frame, stop);
    delete vehicleMarker.dataset.lat;
    delete vehicleMarker.dataset.lon;
    element.hidden = false;
  };

  const map: VehicleSpanMap = {
    apply(event) {
      if (event.type === "place") {
        showStop(event.stop);
        return;
      }
      const hadFrame = view.frame !== null;
      view = applyVehicleSpanEvent(view, event);
      if (!view.frame || !view.vehicle) {
        return;
      }
      if (!hadFrame) {
        clearStreets(glass);
        writeFrame(glass, view.frame);
        mountStreets({ canvas, destinationColor, documentRef, frame: view.frame, stopMarker });
        place(stopMarker, view.frame, view.frame.stop);
      }
      place(vehicleMarker, view.frame, view.vehicle);
      vehicleMarker.dataset.lat = coord(view.vehicle.lat);
      vehicleMarker.dataset.lon = coord(view.vehicle.lon);
      element.hidden = false;
    },
    close() {
      element.remove();
    },
    element,
  };

  closeButton.addEventListener("click", () => {
    onClose();
  });

  return map;
}
