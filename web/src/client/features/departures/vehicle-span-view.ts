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

function coord(value: number): string {
  return value.toFixed(6);
}

function axisPercent(start: number, end: number, value: number): string {
  const span = end - start;
  const ratio = span === 0 ? 0.5 : (value - start) / span;
  const pad = 0.07;
  return `${(pad + ratio * (1 - pad * 2)) * 100}%`;
}

function place(marker: HTMLElement, frame: VehicleSpanFrame, point: GeoPoint): void {
  marker.style.left = axisPercent(frame.west, frame.east, point.lon);
  marker.style.top = axisPercent(frame.north, frame.south, point.lat);
}

function writeFrame(glass: HTMLElement, frame: VehicleSpanFrame): void {
  glass.dataset.east = coord(frame.east);
  glass.dataset.north = coord(frame.north);
  glass.dataset.south = coord(frame.south);
  glass.dataset.west = coord(frame.west);
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
  const vehicleMarker = documentRef.createElement("span");
  vehicleMarker.className = "vehicle-span__vehicle";
  vehicleMarker.dataset.vehicleMarker = "true";
  if (destinationColor) {
    vehicleMarker.style.background = destinationColor;
  }
  glass.append(stopMarker, vehicleMarker);
  element.append(head, glass);

  let view = closedVehicleSpan();

  const map: VehicleSpanMap = {
    apply(event) {
      view = applyVehicleSpanEvent(view, event);
      if (!view.frame || !view.vehicle) {
        return;
      }
      writeFrame(glass, view.frame);
      place(stopMarker, view.frame, view.frame.stop);
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
