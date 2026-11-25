import { attachInteractiveMap } from "@client/features/map/interactive-map";
import {
  formatCoord,
  mountMapStreets,
  ROUTE_EDGE_COLOR,
  writeMapExtent,
} from "@client/features/map/map-chrome";
import { appendOsmCredit, OSM_MAP_CREDIT } from "@client/features/map/osm-credit";
import { placeOnMap, type MapExtent } from "@shared/domain/street-map";
import type { EvaluatedTransfer, TransferFeasibility } from "@shared/domain/transfer";
import type { GeoPoint } from "@shared/domain/vehicle-span";
import { formatWalkMinutes, walkMidpoint, type WalkRoute } from "@shared/domain/walk-route";

const FEASIBILITY_BADGE: Record<
  TransferFeasibility,
  { color: string; label: string; mark: string }
> = {
  "make-it": { color: "#1b7f3a", label: "on time", mark: "✓" },
  missed: { color: "#a63a2f", label: "missed", mark: "✕" },
  tight: { color: "#9a4e00", label: "tight", mark: "!" },
};
const WALK_FRAME = "#f7f1e4";

export interface TransferWalkMapSyncInput {
  readonly color: string;
  readonly evaluated: EvaluatedTransfer;
  readonly exitStopName: string;
  readonly loading: boolean;
  readonly route: WalkRoute | null;
  readonly routeKey: string;
}

export interface TransferWalkMapView {
  destroy(): void;
  element: HTMLElement;
  setOpen(open: boolean): void;
  sync(input: TransferWalkMapSyncInput): void;
}

function extentOf(points: readonly GeoPoint[]): MapExtent {
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

function placeMarker(marker: HTMLElement, extent: MapExtent, point: GeoPoint): void {
  const spot = placeOnMap(extent, point);
  marker.style.left = spot.left;
  marker.style.top = spot.top;
  marker.dataset.lat = formatCoord(point.lat);
  marker.dataset.lon = formatCoord(point.lon);
}

function createMarker(
  documentRef: Document,
  attr: "stopMarker" | "walkOrigin",
  ariaLabel: string,
): HTMLElement {
  const marker = documentRef.createElement("span");
  marker.className = "vehicle-span__stop";
  marker.dataset[attr] = "true";
  marker.setAttribute("role", "img");
  marker.setAttribute("aria-label", ariaLabel);
  return marker;
}

function updateWalkPill(input: {
  evaluated: EvaluatedTransfer;
  extent: MapExtent;
  pill: HTMLElement;
  route: WalkRoute;
}): void {
  const { evaluated, extent, pill, route } = input;
  const middle = walkMidpoint(route.points);
  const spot = placeOnMap(extent, middle);
  const style = FEASIBILITY_BADGE[evaluated.feasibility];
  const minutes = formatWalkMinutes(evaluated.walkSeconds);
  pill.dataset.feasibility = evaluated.feasibility;
  pill.dataset.lat = formatCoord(middle.lat);
  pill.dataset.lon = formatCoord(middle.lon);
  pill.style.left = spot.left;
  pill.style.top = spot.top;
  pill.style.background = WALK_FRAME;
  pill.style.border = `1px solid ${ROUTE_EDGE_COLOR}`;
  pill.style.color = style.color;
  pill.textContent = `${style.mark} ${minutes}`;
  pill.setAttribute("aria-label", `${minutes}, ${style.label}`);
}

export function createTransferWalkMapView(input: {
  documentRef: Document;
  onClose(): void;
}): TransferWalkMapView {
  const { documentRef, onClose } = input;
  const element = documentRef.createElement("div");
  element.className = "ride-transfer-map";
  element.dataset.transferWalkMap = "true";
  element.hidden = true;

  const status = documentRef.createElement("p");
  status.className = "ride-transfer-map__status";
  status.hidden = true;

  const glass = documentRef.createElement("div");
  glass.className = "vehicle-span__glass ride-transfer-map__glass";

  const canvas = documentRef.createElement("div");
  canvas.className = "vehicle-span__canvas ride-transfer-map__canvas";

  const originMarker = createMarker(documentRef, "walkOrigin", "Exit stop");
  const stopMarker = createMarker(documentRef, "stopMarker", "Transfer stop");

  const walkPill = documentRef.createElement("p");
  walkPill.className = "walk-time";
  walkPill.dataset.walkTime = "true";

  const credit = documentRef.createElement("p");
  credit.className = "vehicle-span__credit";
  appendOsmCredit(credit, documentRef, OSM_MAP_CREDIT);

  canvas.append(originMarker, stopMarker, walkPill);
  glass.append(canvas, credit);
  element.append(status, glass);

  const interactive = attachInteractiveMap({
    canvas,
    documentRef,
    glass,
    onClose,
  });

  let mountedKey: string | null = null;
  let mountedExtent: MapExtent | null = null;

  function showStatus(message: string): void {
    glass.hidden = true;
    status.hidden = false;
    status.textContent = message;
  }

  return {
    destroy() {
      interactive.destroy();
      element.remove();
    },
    element,
    setOpen(open) {
      element.hidden = !open;
    },
    sync({ color, evaluated, exitStopName, loading, route, routeKey }) {
      if (loading && !route) {
        showStatus("Loading walking route...");
        return;
      }
      if (!route || route.points.length < 2) {
        showStatus("Walking map unavailable for this transfer.");
        return;
      }

      status.hidden = true;
      glass.hidden = false;
      const { option } = evaluated;

      if (mountedKey !== routeKey || !mountedExtent) {
        mountedKey = routeKey;
        mountedExtent = extentOf(route.points);
        for (const node of canvas.querySelectorAll("[data-street-tile], .vehicle-span__route")) {
          node.remove();
        }
        writeMapExtent(glass, mountedExtent);
        mountMapStreets({
          ariaLabel: `Walk from ${exitStopName} to ${option.stopName}`,
          canvas,
          color,
          documentRef,
          extent: mountedExtent,
          points: route.points,
          stopMarker,
        });
        originMarker.setAttribute("aria-label", `Exit at ${exitStopName}`);
        const targetLabel = option.platform
          ? `${option.stopName} Platform ${option.platform}`
          : option.stopName;
        stopMarker.setAttribute("aria-label", targetLabel);
        placeMarker(originMarker, mountedExtent, route.points[0]);
        placeMarker(stopMarker, mountedExtent, route.points.at(-1) ?? route.points[1]);
        interactive.reset();
      }

      updateWalkPill({
        evaluated,
        extent: mountedExtent,
        pill: walkPill,
        route,
      });
    },
  };
}
