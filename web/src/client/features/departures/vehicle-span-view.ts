import { attachInteractiveMap } from "@client/features/map/interactive-map";
import { buildMapHeader, formatCoord, mountMapStreets, writeMapExtent } from "@client/features/map/map-chrome";
import { appendOsmCredit, OSM_MAP_CREDIT } from "@client/features/map/osm-credit";
import { placeOnMap } from "@shared/domain/street-map";
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
  initialExpanded?: boolean;
  line: string;
  onClose: () => void;
  onExpandedChange?: (expanded: boolean) => void;
  onSwitchToWalk?: () => void;
  switched?: boolean;
}

export interface VehicleSpanMap {
  apply(event: VehicleSpanEvent): void;
  close(): void;
  element: HTMLElement;
  markSwitchBusy(): void;
}

function place(marker: HTMLElement, frame: VehicleSpanFrame, point: GeoPoint): void {
  const spot = placeOnMap(frame, point);
  marker.style.left = spot.left;
  marker.style.top = spot.top;
}

function clearStreets(glass: HTMLElement): void {
  for (const node of glass.querySelectorAll("[data-street-tile], .vehicle-span__route")) {
    node.remove();
  }
}

export function createVehicleSpanMap(options: VehicleSpanMapOptions): VehicleSpanMap {
  const {
    destination,
    destinationColor,
    documentRef,
    initialExpanded,
    line,
    onClose,
    onExpandedChange,
    onSwitchToWalk,
    switched = false,
  } = options;
  const element = documentRef.createElement("section");
  element.className = "vehicle-span";
  element.dataset.vehicleMap = "true";
  if (switched) {
    element.dataset.mapSwitched = "true";
  }
  element.setAttribute("aria-label", `${line} to ${destination}`);
  if (destinationColor) {
    element.style.setProperty("--destination-color", destinationColor);
  }

  const head = buildMapHeader({
    closeAttr: "vehicleSpanClose",
    destination,
    documentRef,
    line,
    onClose,
    switchAction: onSwitchToWalk
      ? {
          ariaLabel: "Show walking route",
          label: "Walk",
          onSwitch: onSwitchToWalk,
          target: "walk",
        }
      : undefined,
  });

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
  stopMarker.setAttribute("role", "img");
  stopMarker.setAttribute("aria-label", destination);

  const vehicleMarker = documentRef.createElement("span");
  vehicleMarker.className = "vehicle-span__vehicle";
  vehicleMarker.dataset.vehicleMarker = "true";
  vehicleMarker.setAttribute("aria-hidden", "true");
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

  const interactive = attachInteractiveMap({
    canvas,
    documentRef,
    glass,
    initialExpanded,
    onClose,
    onExpandedChange,
  });
  let view = closedVehicleSpan();
  let hasVehicleFix = false;

  const showStop = (stop: GeoPoint) => {
    const frame = frameVehicleSpan(stop, stop);
    clearStreets(glass);
    writeMapExtent(glass, frame);
    mountMapStreets({
      ariaLabel: `Route to ${destination}`,
      canvas,
      color: destinationColor,
      documentRef,
      extent: frame,
      points: frame.route,
      stopMarker,
    });
    place(stopMarker, frame, stop);
    delete glass.dataset.vehicleLive;
    delete vehicleMarker.dataset.gliding;
    delete vehicleMarker.dataset.lat;
    delete vehicleMarker.dataset.lon;
    hasVehicleFix = false;
    interactive.reset();
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
        writeMapExtent(glass, view.frame);
        mountMapStreets({
          ariaLabel: `Route to ${destination}`,
          canvas,
          color: destinationColor,
          documentRef,
          extent: view.frame,
          points: view.frame.route,
          stopMarker,
        });
        place(stopMarker, view.frame, view.frame.stop);
        interactive.reset();
      }
      if (hasVehicleFix) {
        vehicleMarker.dataset.gliding = "true";
      }
      hasVehicleFix = true;
      glass.dataset.vehicleLive = "true";
      place(vehicleMarker, view.frame, view.vehicle);
      vehicleMarker.dataset.lat = formatCoord(view.vehicle.lat);
      vehicleMarker.dataset.lon = formatCoord(view.vehicle.lon);
      element.hidden = false;
    },
    close() {
      interactive.destroy();
      element.remove();
    },
    element,
    markSwitchBusy() {
      const button = head.querySelector<HTMLButtonElement>("[data-map-switch='walk']");
      if (button) {
        button.setAttribute("aria-busy", "true");
        button.dataset.switchLoading = "true";
      }
    },
  };

  return map;
}
