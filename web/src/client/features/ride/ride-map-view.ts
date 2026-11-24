import { attachInteractiveMap } from "@client/features/map/interactive-map";
import { formatCoord, mountMapStreets, writeMapExtent } from "@client/features/map/map-chrome";
import { appendOsmCredit, OSM_MAP_CREDIT } from "@client/features/map/osm-credit";
import { frameRideRoute, type RideProgress, type RideSnapshot } from "@shared/domain/ride";
import { placeOnMap, type MapExtent } from "@shared/domain/street-map";
import type { GeoPoint } from "@shared/domain/vehicle-span";

export interface RideMapView {
  destroy(): void;
  element: HTMLElement;
  setOpen(open: boolean): void;
  sync(input: {
    destinationColor: string | null;
    progress: RideProgress;
    snapshot: RideSnapshot;
  }): void;
}

function placePoint(marker: HTMLElement, extent: MapExtent, point: GeoPoint): void {
  const spot = placeOnMap(extent, point);
  marker.style.left = spot.left;
  marker.style.top = spot.top;
}

function clearMapLayers(canvas: HTMLElement): void {
  for (const node of canvas.querySelectorAll("[data-street-tile], .vehicle-span__route, [data-ride-stop-dot]")) {
    node.remove();
  }
}

export function createRideMapView(input: {
  documentRef: Document;
  onClose(): void;
}): RideMapView {
  const { documentRef, onClose } = input;
  const element = documentRef.createElement("div");
  element.className = "ride-map";
  element.dataset.rideMap = "true";
  element.hidden = true;

  const glass = documentRef.createElement("div");
  glass.className = "vehicle-span__glass ride-map__glass";

  const canvas = documentRef.createElement("div");
  canvas.className = "vehicle-span__canvas ride-map__canvas";

  const stopAnchor = documentRef.createElement("span");
  stopAnchor.className = "visually-hidden";

  const vehicleMarker = documentRef.createElement("span");
  vehicleMarker.className = "vehicle-span__vehicle ride-map__vehicle";
  vehicleMarker.dataset.rideVehicleMarker = "true";
  vehicleMarker.setAttribute("aria-hidden", "true");
  vehicleMarker.hidden = true;

  const credit = documentRef.createElement("p");
  credit.className = "vehicle-span__credit";
  appendOsmCredit(credit, documentRef, OSM_MAP_CREDIT);

  canvas.append(stopAnchor, vehicleMarker);
  glass.append(canvas, credit);
  element.appendChild(glass);

  const interactive = attachInteractiveMap({
    canvas,
    documentRef,
    glass,
    onClose,
  });

  let mountedTripId: string | null = null;
  let mountedExtent: MapExtent | null = null;
  let hadLiveVehicle = false;

  return {
    destroy() {
      interactive.destroy();
      element.remove();
    },
    element,
    setOpen(open) {
      element.hidden = !open;
    },
    sync({ destinationColor, progress, snapshot }) {
      if (destinationColor) {
        element.style.setProperty("--destination-color", destinationColor);
        vehicleMarker.style.background = destinationColor;
      }
      if (mountedTripId !== snapshot.tripId || !mountedExtent) {
        const extent = frameRideRoute(snapshot);
        if (!extent) {
          return;
        }
        mountedTripId = snapshot.tripId;
        mountedExtent = extent;
        hadLiveVehicle = false;
        clearMapLayers(canvas);
        writeMapExtent(glass, extent);
        mountMapStreets({
          ariaLabel: `Live route for ${snapshot.line} to ${snapshot.destination}`,
          canvas,
          color: destinationColor || undefined,
          documentRef,
          extent,
          points: snapshot.route.length >= 2 ? snapshot.route : snapshot.stops,
          stopMarker: stopAnchor,
        });
        interactive.reset();
      }

      for (const dot of canvas.querySelectorAll("[data-ride-stop-dot]")) {
        dot.remove();
      }
      for (const entry of progress.stops) {
        const dot = documentRef.createElement("span");
        dot.className = "ride-map__stop-dot";
        dot.dataset.rideStopDot = entry.stop.stopId;
        dot.dataset.stopState = entry.state;
        if (entry.isExit) {
          dot.dataset.isExit = "true";
        }
        placePoint(dot, mountedExtent, entry.stop);
        canvas.insertBefore(dot, vehicleMarker);
      }

      if (snapshot.vehicle) {
        glass.dataset.vehicleLive = "true";
        vehicleMarker.hidden = false;
        if (hadLiveVehicle) {
          vehicleMarker.dataset.gliding = "true";
        }
        hadLiveVehicle = true;
        placePoint(vehicleMarker, mountedExtent, snapshot.vehicle);
        vehicleMarker.dataset.lat = formatCoord(snapshot.vehicle.lat);
        vehicleMarker.dataset.lon = formatCoord(snapshot.vehicle.lon);
      } else {
        delete glass.dataset.vehicleLive;
        delete vehicleMarker.dataset.lat;
        delete vehicleMarker.dataset.lon;
        vehicleMarker.hidden = true;
        hadLiveVehicle = false;
      }
    },
  };
}
