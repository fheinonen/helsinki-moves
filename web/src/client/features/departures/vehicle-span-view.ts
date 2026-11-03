import { placeOnMap, streetTilesForFrame } from "@shared/domain/street-map";
import {
  applyVehicleSpanEvent,
  closedVehicleSpan,
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

function mountStreets(input: {
  destinationColor?: string;
  documentRef: Document;
  frame: VehicleSpanFrame;
  glass: HTMLElement;
  stopMarker: HTMLElement;
}): void {
  const { destinationColor, documentRef, frame, glass, stopMarker } = input;
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
    glass.insertBefore(image, stopMarker);
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
  glass.insertBefore(svg, stopMarker);
}

export function createVehicleSpanMap(options: VehicleSpanMapOptions): VehicleSpanMap {
  const { destination, destinationColor, documentRef, line, onClose } = options;
  const element = documentRef.createElement("section");
  element.className = "vehicle-span";
  element.dataset.vehicleMap = "true";
  element.hidden = true;
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
  credit.textContent = "© OpenStreetMap, HSL";
  glass.append(stopMarker, vehicleMarker, credit);
  element.append(head, glass);

  let view = closedVehicleSpan();

  const map: VehicleSpanMap = {
    apply(event) {
      const hadFrame = view.frame !== null;
      view = applyVehicleSpanEvent(view, event);
      if (!view.frame || !view.vehicle) {
        return;
      }
      if (!hadFrame) {
        writeFrame(glass, view.frame);
        mountStreets({ destinationColor, documentRef, frame: view.frame, glass, stopMarker });
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
