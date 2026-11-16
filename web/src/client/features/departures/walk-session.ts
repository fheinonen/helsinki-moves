import { appendOsmCredit, OSM_MAP_CREDIT } from "@client/features/map/osm-credit";
import { fetchWalkRoute } from "@client/services/walk-client";
import { frameAspect, placeOnMap, streetTilesForFrame, type MapExtent } from "@shared/domain/street-map";
import type { GeoPoint } from "@shared/domain/vehicle-span";
import {
  canMakeDeparture,
  formatWalkMinutes,
  WALK_UNAVAILABLE,
  walkMidpoint,
  type WalkRequest,
  type WalkRoute,
} from "@shared/domain/walk-route";

const HOLD_MS = 500;
const HOLD_SLOP_PX = 12;
const ON_TIME_COLOR = "#1b7f3a";
const LATE_COLOR = "#c4362c";
const ROUTE_EDGE = "#161616";
const WALK_FRAME = "#f7f1e4";
const SVG_NS = "http://www.w3.org/2000/svg";

export type HoldScheduler = (delayMs: number, fire: () => void) => () => void;

export interface WalkSession {
  close(): void;
}

export interface CreateWalkSessionInput {
  closeVehicle(): void;
  documentRef: Document;
  fetchWalk?: (request: WalkRequest) => Promise<WalkRoute | null>;
  readCoords(): GeoPoint | null;
  scheduleHold?: HoldScheduler;
  table: HTMLTableElement;
}

type WalkAttemptId = string & { readonly __walkAttemptId: unique symbol };

interface HeldDeparture {
  readonly color: string;
  readonly departureMs: number;
  readonly destination: string;
  readonly line: string;
  readonly stopId: string;
}

type WalkAttempt =
  | { readonly status: "idle" }
  | {
      readonly id: WalkAttemptId;
      readonly label: HeldDeparture;
      readonly origin: GeoPoint;
      readonly status: "pending";
    }
  | {
      readonly id: WalkAttemptId;
      readonly label: HeldDeparture;
      readonly route: WalkRoute;
      readonly status: "shown";
    }
  | {
      readonly id: WalkAttemptId;
      readonly label: HeldDeparture;
      readonly status: "failed";
    };

type WalkCommand =
  | {
      readonly id: WalkAttemptId;
      readonly label: HeldDeparture;
      readonly origin: GeoPoint;
      readonly type: "hold";
    }
  | { readonly id: WalkAttemptId; readonly route: WalkRoute; readonly type: "arrive" }
  | { readonly id: WalkAttemptId; readonly type: "fail" }
  | { readonly type: "close" };

interface WalkProjection {
  readonly element: HTMLElement;
  readonly id: WalkAttemptId;
  readonly kind: "map" | "status";
}

interface Arm {
  readonly cancelTimer: () => void;
  readonly label: HeldDeparture;
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
}

let nextWalkAttempt = 0;

function mintWalkAttemptId(): WalkAttemptId {
  nextWalkAttempt += 1;
  return String(nextWalkAttempt) as WalkAttemptId;
}

function defaultHoldScheduler(delayMs: number, fire: () => void): () => void {
  const handle = setTimeout(fire, delayMs);
  return () => {
    clearTimeout(handle);
  };
}

function usableOrigin(origin: GeoPoint | null): origin is GeoPoint {
  return origin != null && Number.isFinite(origin.lat) && Number.isFinite(origin.lon);
}

function isPendingId(
  attempt: WalkAttempt,
  id: WalkAttemptId,
): attempt is Extract<WalkAttempt, { status: "pending" }> {
  return attempt.status === "pending" && attempt.id === id;
}

function reduceWalk(attempt: WalkAttempt, command: WalkCommand): WalkAttempt {
  switch (command.type) {
    case "close":
      return { status: "idle" };
    case "hold":
      return { id: command.id, label: command.label, origin: command.origin, status: "pending" };
    case "arrive":
      return isPendingId(attempt, command.id)
        ? { id: command.id, label: attempt.label, route: command.route, status: "shown" }
        : attempt;
    case "fail":
      return isPendingId(attempt, command.id)
        ? { id: command.id, label: attempt.label, status: "failed" }
        : attempt;
    default: {
      const unreachable: never = command;
      return unreachable;
    }
  }
}

function coord(value: number): string {
  return value.toFixed(6);
}

function extentOf(points: WalkRoute["points"]): MapExtent {
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

function routeLabel(points: readonly GeoPoint[]): string {
  return points.map((point) => `${coord(point.lat)} ${coord(point.lon)}`).join(" ");
}

function routePoints(extent: MapExtent, points: readonly GeoPoint[]): string {
  return points
    .map((point) => {
      const spot = placeOnMap(extent, point);
      return `${Number.parseFloat(spot.left)},${Number.parseFloat(spot.top)}`;
    })
    .join(" ");
}

function writeExtent(glass: HTMLElement, extent: MapExtent): void {
  glass.dataset.east = coord(extent.east);
  glass.dataset.north = coord(extent.north);
  glass.dataset.south = coord(extent.south);
  glass.dataset.west = coord(extent.west);
}

function placeMarker(marker: HTMLElement, extent: MapExtent, point: GeoPoint): void {
  const spot = placeOnMap(extent, point);
  marker.style.left = spot.left;
  marker.style.top = spot.top;
  marker.dataset.lat = coord(point.lat);
  marker.dataset.lon = coord(point.lon);
}

function marker(documentRef: Document, name: "stopMarker" | "walkOrigin"): HTMLElement {
  const element = documentRef.createElement("span");
  element.className = "vehicle-span__stop";
  element.dataset[name] = "true";
  return element;
}

function mountStreets(input: {
  canvas: HTMLElement;
  color: string;
  documentRef: Document;
  extent: MapExtent;
  points: readonly GeoPoint[];
  stopMarker: HTMLElement;
}): void {
  const aspect = frameAspect(input.extent);
  input.canvas.style.aspectRatio = String(aspect);
  input.canvas.style.setProperty("--map-aspect", String(aspect));
  for (const tile of streetTilesForFrame(input.extent)) {
    const image = input.documentRef.createElement("img");
    image.alt = "";
    image.className = "vehicle-span__tile";
    image.dataset.streetTile = "true";
    image.decoding = "async";
    image.src = tile.src;
    image.style.height = tile.height;
    image.style.left = tile.left;
    image.style.top = tile.top;
    image.style.width = tile.width;
    input.canvas.insertBefore(image, input.stopMarker);
  }
  const svg = input.documentRef.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "vehicle-span__route");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("viewBox", "0 0 100 100");
  const points = routePoints(input.extent, input.points);
  const edge = input.documentRef.createElementNS(SVG_NS, "polyline");
  edge.setAttribute("data-route-casing", "true");
  edge.setAttribute("points", points);
  edge.style.stroke = ROUTE_EDGE;
  edge.style.strokeWidth = "3.6";
  const line = input.documentRef.createElementNS(SVG_NS, "polyline");
  line.setAttribute("data-route-span", routeLabel(input.points));
  line.setAttribute("points", points);
  if (input.color) {
    line.style.stroke = input.color;
  }
  svg.append(edge, line);
  input.canvas.insertBefore(svg, input.stopMarker);
}

function walkMapElement(input: {
  documentRef: Document;
  label: HeldDeparture;
  onClose: () => void;
  route: WalkRoute;
}): HTMLElement {
  const { documentRef, label, onClose, route } = input;
  const element = documentRef.createElement("section");
  element.className = "vehicle-span";
  element.dataset.walkMap = "true";
  element.setAttribute("aria-label", `${label.line} walk to ${label.destination}`);
  const head = documentRef.createElement("div");
  head.className = "vehicle-span__head";
  const identity = documentRef.createElement("p");
  identity.className = "vehicle-span__identity";
  const line = documentRef.createElement("span");
  line.className = "vehicle-span__line";
  line.textContent = label.line;
  const destination = documentRef.createElement("span");
  destination.className = "vehicle-span__destination";
  destination.textContent = label.destination;
  identity.append(line, destination);
  const closeButton = documentRef.createElement("button");
  closeButton.className = "vehicle-span__close";
  closeButton.dataset.walkClose = "true";
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.addEventListener("click", () => {
    onClose();
  });
  head.append(identity, closeButton);
  const glass = documentRef.createElement("div");
  glass.className = "vehicle-span__glass";
  const canvas = documentRef.createElement("div");
  canvas.className = "vehicle-span__canvas";
  const origin = marker(documentRef, "walkOrigin");
  const stop = marker(documentRef, "stopMarker");
  canvas.append(origin, stop);
  const extent = extentOf(route.points);
  writeExtent(glass, extent);
  mountStreets({
    canvas,
    color: label.color,
    documentRef,
    extent,
    points: route.points,
    stopMarker: stop,
  });
  placeMarker(origin, extent, route.points[0]);
  placeMarker(stop, extent, route.points.at(-1) ?? route.points[1]);
  placeWalkTime({ canvas, departureMs: label.departureMs, documentRef, extent, route });
  const credit = documentRef.createElement("p");
  credit.className = "vehicle-span__credit";
  appendOsmCredit(credit, documentRef, OSM_MAP_CREDIT);
  glass.append(canvas, credit);
  element.append(head, glass);
  return element;
}

function placeWalkTime(input: {
  canvas: HTMLElement;
  departureMs: number;
  documentRef: Document;
  extent: MapExtent;
  route: WalkRoute;
}): void {
  const middle = walkMidpoint(input.route.points);
  const spot = placeOnMap(input.extent, middle);
  const onTime = canMakeDeparture({
    departureMs: input.departureMs,
    now: Date.now(),
    seconds: input.route.seconds,
  });
  const label = input.documentRef.createElement("p");
  label.className = "walk-time";
  label.dataset.walkTime = "true";
  label.dataset.onTime = onTime ? "true" : "false";
  label.dataset.lat = coord(middle.lat);
  label.dataset.lon = coord(middle.lon);
  label.style.left = spot.left;
  label.style.top = spot.top;
  label.style.background = WALK_FRAME;
  label.style.border = `1px solid ${ROUTE_EDGE}`;
  label.style.color = onTime ? ON_TIME_COLOR : LATE_COLOR;
  label.textContent = formatWalkMinutes(input.route.seconds);
  input.canvas.append(label);
}

function failureElement(documentRef: Document): HTMLElement {
  const note = documentRef.createElement("p");
  note.className = "app-shell__status";
  note.dataset.walkStatus = "true";
  note.setAttribute("role", "status");
  note.textContent = WALK_UNAVAILABLE;
  return note;
}

function sameProjection(mounted: WalkProjection | null, id: WalkAttemptId, kind: WalkProjection["kind"]): boolean {
  return mounted?.id === id && mounted.kind === kind;
}

function projectWalk(input: {
  readonly attempt: WalkAttempt;
  readonly documentRef: Document;
  readonly mounted: WalkProjection | null;
  readonly onClose: () => void;
  readonly table: HTMLTableElement;
}): WalkProjection | null {
  const { attempt, mounted } = input;
  if (attempt.status === "idle" || attempt.status === "pending") {
    mounted?.element.remove();
    return null;
  }
  if (attempt.status === "failed") {
    if (sameProjection(mounted, attempt.id, "status")) {
      return mounted;
    }
    mounted?.element.remove();
    const element = failureElement(input.documentRef);
    input.table.before(element);
    return { element, id: attempt.id, kind: "status" };
  }
  if (sameProjection(mounted, attempt.id, "map")) {
    return mounted;
  }
  mounted?.element.remove();
  const element = walkMapElement({
    documentRef: input.documentRef,
    label: attempt.label,
    onClose: input.onClose,
    route: attempt.route,
  });
  input.table.before(element);
  element.scrollIntoView({ block: "start" });
  return { element, id: attempt.id, kind: "map" };
}

function departureFrom(target: EventTarget | null): HeldDeparture | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const row = target.closest("tr");
  if (!(row instanceof HTMLTableRowElement)) {
    return null;
  }
  const stopId = row.dataset.stopId?.trim() ?? "";
  if (!stopId) {
    return null;
  }
  return {
    color: row.style.getPropertyValue("--destination-color"),
    departureMs: Date.parse(row.querySelector("time")?.getAttribute("datetime") ?? ""),
    destination: row.dataset.destination ?? "",
    line: row.dataset.line ?? "",
    stopId,
  };
}

function labelFrom(event: PointerEvent): HeldDeparture | null {
  return departureFrom(event.target);
}

function refuseCardSelection(event: Event): void {
  if (!departureFrom(event.target)) {
    return;
  }
  event.preventDefault();
}

function clearTextSelection(documentRef: Document): void {
  documentRef.getSelection()?.removeAllRanges();
}

function selectionInsideCard(documentRef: Document): boolean {
  const node = documentRef.getSelection()?.anchorNode ?? null;
  const element = node instanceof Element ? node : node?.parentElement ?? null;
  return departureFrom(element) != null;
}

function movedPastSlop(arm: Arm, event: PointerEvent): boolean {
  const dx = event.clientX - arm.x;
  const dy = event.clientY - arm.y;
  return dx * dx + dy * dy > HOLD_SLOP_PX * HOLD_SLOP_PX;
}

function bindHold(input: {
  beginWalk(label: HeldDeparture): void;
  scheduleHold: HoldScheduler;
  table: HTMLTableElement;
}): { disarm(): void } {
  let arm: Arm | null = null;
  let swallowNextClick = false;
  const documentRef = input.table.ownerDocument;

  function unlisten(): void {
    documentRef.removeEventListener("pointercancel", endArm);
    documentRef.removeEventListener("pointermove", moveArm);
    documentRef.removeEventListener("pointerup", endArm);
  }

  function disarm(): void {
    arm?.cancelTimer();
    arm = null;
    unlisten();
  }

  function listen(): void {
    documentRef.addEventListener("pointercancel", endArm);
    documentRef.addEventListener("pointermove", moveArm);
    documentRef.addEventListener("pointerup", endArm);
  }

  function endArm(event: PointerEvent): void {
    if (!arm || event.pointerId !== arm.pointerId) {
      return;
    }
    disarm();
  }

  function moveArm(event: PointerEvent): void {
    if (!arm || event.pointerId !== arm.pointerId || !movedPastSlop(arm, event)) {
      return;
    }
    disarm();
  }

  function fire(label: HeldDeparture): void {
    if (!arm || arm.label !== label) {
      return;
    }
    disarm();
    swallowNextClick = true;
    clearTextSelection(documentRef);
    input.beginWalk(label);
  }

  function armHold(label: HeldDeparture, event: PointerEvent): void {
    arm = {
      cancelTimer: input.scheduleHold(HOLD_MS, () => {
        fire(label);
      }),
      label,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    listen();
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || arm) {
      return;
    }
    swallowNextClick = false;
    const label = labelFrom(event);
    if (!label) {
      return;
    }
    armHold(label, event);
  }

  function onClick(event: MouseEvent): void {
    if (!swallowNextClick) {
      return;
    }
    swallowNextClick = false;
    clearTextSelection(documentRef);
    event.preventDefault();
    event.stopPropagation();
  }

  function onSelectionChange(): void {
    if (selectionInsideCard(documentRef)) {
      clearTextSelection(documentRef);
    }
  }

  input.table.addEventListener("click", onClick, true);
  input.table.addEventListener("contextmenu", refuseCardSelection);
  input.table.addEventListener("pointerdown", onPointerDown);
  input.table.addEventListener("selectstart", refuseCardSelection);
  documentRef.addEventListener("selectionchange", onSelectionChange);
  return { disarm };
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Aborted", "AbortError");
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(abortReason(signal));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        if (signal.aborted) {
          onAbort();
          return;
        }
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export function createWalkSession(input: CreateWalkSessionInput): WalkSession {
  let attempt: WalkAttempt = { status: "idle" };
  let mounted: WalkProjection | null = null;
  let requestedId: WalkAttemptId | null = null;
  let flight: AbortController | null = null;
  const scheduleHold = input.scheduleHold ?? defaultHoldScheduler;

  function abortInFlight(): void {
    flight?.abort();
    flight = null;
  }

  function apply(command: WalkCommand): void {
    attempt = reduceWalk(attempt, command);
    mounted = projectWalk({
      attempt,
      documentRef: input.documentRef,
      mounted,
      onClose: close,
      table: input.table,
    });
  }

  function close(): void {
    hold.disarm();
    apply({ type: "close" });
    requestedId = null;
    abortInFlight();
  }

  function loadWalk(request: WalkRequest, signal: AbortSignal): Promise<WalkRoute | null> {
    if (input.fetchWalk) {
      return input.fetchWalk(request);
    }
    return fetchWalkRoute(request, (url, init) => fetch(url, { ...init, signal }));
  }

  function beginWalk(label: HeldDeparture): void {
    const origin = input.readCoords();
    if (!usableOrigin(origin)) {
      return;
    }
    abortInFlight();
    const id = mintWalkAttemptId();
    apply({ id, label, origin, type: "hold" });
    input.closeVehicle();
    if (!isPendingId(attempt, id) || requestedId === id) {
      return;
    }
    requestedId = id;
    const pending = attempt;
    const controller = new AbortController();
    flight = controller;
    void abortable(
      loadWalk(
        { lat: pending.origin.lat, lon: pending.origin.lon, stopId: pending.label.stopId },
        controller.signal,
      ),
      controller.signal,
    ).then(
      (route) => {
        apply(route ? { id, route, type: "arrive" } : { id, type: "fail" });
      },
      () => {
        apply({ id, type: "fail" });
      },
    );
  }

  const hold = bindHold({ beginWalk, scheduleHold, table: input.table });
  return { close };
}
