import { attachInteractiveMap } from "@client/features/map/interactive-map";
import {
  buildMapHeader,
  formatCoord,
  mountMapStreets,
  ROUTE_EDGE_COLOR,
  scrollMapIntoView,
  writeMapExtent,
  type MapSwitchAction,
} from "@client/features/map/map-chrome";
import { appendOsmCredit, OSM_MAP_CREDIT } from "@client/features/map/osm-credit";
import { fetchWalkRoute } from "@client/services/walk-client";
import { placeOnMap, type MapExtent } from "@shared/domain/street-map";
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
const LATE_COLOR = "#9a4e00";
const ON_TIME_MARK = "✓";
const LATE_MARK = "✕";
const WALK_FRAME = "#f7f1e4";

export type HoldScheduler = (delayMs: number, fire: () => void) => () => void;

export interface WalkSession {
  close(options?: { restoreFocus?: boolean }): void;
  openForCard(card: HTMLTableRowElement): void;
}

export interface CreateWalkSessionInput {
  closeVehicle(): void;
  documentRef: Document;
  fetchWalk?: (request: WalkRequest) => Promise<WalkRoute | null>;
  isExpanded?: () => boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onSwitchToVehicle?: (card: HTMLTableRowElement) => void;
  onUserClose?: () => void;
  readCoords(): GeoPoint | null;
  scheduleHold?: HoldScheduler;
  table: HTMLTableElement;
}

type WalkAttemptId = string & { readonly __walkAttemptId: unique symbol };

interface HeldDeparture {
  readonly card: HTMLTableRowElement;
  readonly color: string;
  readonly departureMs: number;
  readonly destination: string;
  readonly line: string;
  readonly stopId: string;
  readonly tripId: string;
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
  readonly card: HTMLTableRowElement;
  readonly destroy: () => void;
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

function placeMarker(marker: HTMLElement, extent: MapExtent, point: GeoPoint): void {
  const spot = placeOnMap(extent, point);
  marker.style.left = spot.left;
  marker.style.top = spot.top;
  marker.dataset.lat = formatCoord(point.lat);
  marker.dataset.lon = formatCoord(point.lon);
}

function createMapMarker(
  documentRef: Document,
  name: "stopMarker" | "walkOrigin",
  ariaLabel: string,
): HTMLElement {
  const element = documentRef.createElement("span");
  element.className = "vehicle-span__stop";
  element.dataset[name] = "true";
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", ariaLabel);
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
  label.dataset.lat = formatCoord(middle.lat);
  label.dataset.lon = formatCoord(middle.lon);
  label.style.left = spot.left;
  label.style.top = spot.top;
  const minutes = formatWalkMinutes(input.route.seconds);
  label.style.background = WALK_FRAME;
  label.style.border = `1px solid ${ROUTE_EDGE_COLOR}`;
  label.style.color = onTime ? ON_TIME_COLOR : LATE_COLOR;
  label.textContent = `${onTime ? ON_TIME_MARK : LATE_MARK} ${minutes}`;
  label.setAttribute("aria-label", `${minutes}, ${onTime ? "on time" : "too late"}`);
  input.canvas.append(label);
}

function buildWalkMap(input: {
  documentRef: Document;
  initialExpanded?: boolean;
  label: HeldDeparture;
  onClose: () => void;
  onExpandedChange?: (expanded: boolean) => void;
  onSwitchToVehicle?: (card: HTMLTableRowElement) => void;
  route: WalkRoute;
}): { destroy: () => void; element: HTMLElement } {
  const { documentRef, initialExpanded, label, onClose, onExpandedChange, onSwitchToVehicle, route } = input;
  const element = documentRef.createElement("section");
  element.className = "vehicle-span";
  element.dataset.walkMap = "true";
  element.setAttribute("aria-label", `${label.line} walk to ${label.destination}`);
  if (label.color) {
    element.style.setProperty("--destination-color", label.color);
  }

  const switchAction: MapSwitchAction | undefined =
    label.tripId && onSwitchToVehicle
      ? {
          ariaLabel: "Show live vehicle",
          label: "Vehicle",
          onSwitch: () => {
            onSwitchToVehicle(label.card);
          },
          target: "vehicle",
        }
      : undefined;

  const head = buildMapHeader({
    closeAttr: "walkClose",
    destination: label.destination,
    documentRef,
    line: label.line,
    onClose,
    switchAction,
  });

  const glass = documentRef.createElement("div");
  glass.className = "vehicle-span__glass";
  const canvas = documentRef.createElement("div");
  canvas.className = "vehicle-span__canvas";
  const origin = createMapMarker(documentRef, "walkOrigin", "Your location");
  const stop = createMapMarker(documentRef, "stopMarker", label.destination);
  canvas.append(origin, stop);

  const extent = extentOf(route.points);
  writeMapExtent(glass, extent);
  mountMapStreets({
    ariaLabel: `Walk to ${label.destination}`,
    canvas,
    color: label.color || undefined,
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

  const interactive = attachInteractiveMap({
    canvas,
    documentRef,
    glass,
    initialExpanded,
    onClose,
    onExpandedChange,
  });
  return {
    destroy() {
      interactive.destroy();
      element.remove();
    },
    element,
  };
}

function failureElement(documentRef: Document): HTMLElement {
  const note = documentRef.createElement("p");
  note.className = "app-shell__status";
  note.dataset.walkStatus = "true";
  note.setAttribute("role", "status");
  note.textContent = WALK_UNAVAILABLE;
  return note;
}

function sameProjection(
  mounted: WalkProjection | null,
  id: WalkAttemptId,
  kind: WalkProjection["kind"],
): boolean {
  return mounted?.id === id && mounted.kind === kind;
}

function clearCardWalkState(card: HTMLTableRowElement | null): void {
  if (!card) {
    return;
  }
  delete card.dataset.walkLoading;
  delete card.dataset.mapActive;
}

function teardownProjection(mounted: WalkProjection | null): void {
  if (!mounted) {
    return;
  }
  delete mounted.card.dataset.mapActive;
  mounted.destroy();
}

function projectWalk(input: {
  readonly attempt: WalkAttempt;
  readonly closeVehicle: () => void;
  readonly documentRef: Document;
  readonly initialExpanded?: boolean;
  readonly mounted: WalkProjection | null;
  readonly onClose: () => void;
  readonly onExpandedChange?: (expanded: boolean) => void;
  readonly onSwitchToVehicle?: (card: HTMLTableRowElement) => void;
  readonly table: HTMLTableElement;
}): WalkProjection | null {
  const { attempt, mounted } = input;
  if (attempt.status === "idle" || attempt.status === "pending") {
    teardownProjection(mounted);
    return null;
  }
  if (attempt.status === "failed") {
    if (sameProjection(mounted, attempt.id, "status")) {
      return mounted;
    }
    teardownProjection(mounted);
    input.closeVehicle();
    const element = failureElement(input.documentRef);
    input.table.before(element);
    return {
      card: attempt.label.card,
      destroy() {
        element.remove();
      },
      element,
      id: attempt.id,
      kind: "status",
    };
  }
  if (sameProjection(mounted, attempt.id, "map")) {
    return mounted;
  }
  teardownProjection(mounted);
  const hadVehicleMap =
    input.table.previousElementSibling?.matches("[data-vehicle-map='true']") ?? false;
  const built = buildWalkMap({
    documentRef: input.documentRef,
    initialExpanded: input.initialExpanded,
    label: attempt.label,
    onClose: input.onClose,
    onExpandedChange: input.onExpandedChange,
    onSwitchToVehicle: input.onSwitchToVehicle,
    route: attempt.route,
  });
  if (hadVehicleMap) {
    built.element.dataset.mapSwitched = "true";
  }
  input.closeVehicle();
  input.table.before(built.element);
  attempt.label.card.dataset.mapActive = "true";
  if (!hadVehicleMap) {
    scrollMapIntoView(built.element, input.documentRef);
  }
  return {
    card: attempt.label.card,
    destroy: built.destroy,
    element: built.element,
    id: attempt.id,
    kind: "map",
  };
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
    card: row,
    color: row.style.getPropertyValue("--destination-color"),
    departureMs: Date.parse(row.querySelector("time")?.getAttribute("datetime") ?? ""),
    destination: row.dataset.destination ?? "",
    line: row.dataset.line ?? "",
    stopId,
    tripId: row.dataset.tripId?.trim() ?? "",
  };
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
  canWalk(): boolean;
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
    if (arm) {
      delete arm.label.card.dataset.holdActive;
      arm.cancelTimer();
    }
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
    if (input.canWalk()) {
      label.card.dataset.holdActive = "true";
    }
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
    const label = departureFrom(event.target);
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

function restoreCardFocus(card: HTMLTableRowElement | null): void {
  if (!card?.isConnected) {
    return;
  }
  card.querySelector<HTMLButtonElement>("button")?.focus();
}

export function createWalkSession(input: CreateWalkSessionInput): WalkSession {
  let attempt: WalkAttempt = { status: "idle" };
  let mounted: WalkProjection | null = null;
  let loadingCard: HTMLTableRowElement | null = null;
  let requestedId: WalkAttemptId | null = null;
  let flight: AbortController | null = null;
  const scheduleHold = input.scheduleHold ?? defaultHoldScheduler;

  function abortInFlight(): void {
    flight?.abort();
    flight = null;
  }

  function syncLoadingCard(): void {
    const nextLoading = attempt.status === "pending" ? attempt.label.card : null;
    if (loadingCard && loadingCard !== nextLoading) {
      delete loadingCard.dataset.walkLoading;
    }
    loadingCard = nextLoading;
    if (loadingCard) {
      loadingCard.dataset.walkLoading = "true";
    }
  }

  function closeWithFocus(): void {
    input.onUserClose?.();
    close({ restoreFocus: true });
  }

  function apply(command: WalkCommand): void {
    attempt = reduceWalk(attempt, command);
    syncLoadingCard();
    mounted = projectWalk({
      attempt,
      closeVehicle: input.closeVehicle,
      documentRef: input.documentRef,
      initialExpanded: input.isExpanded?.(),
      mounted,
      onClose: closeWithFocus,
      onExpandedChange: input.onExpandedChange,
      onSwitchToVehicle: input.onSwitchToVehicle,
      table: input.table,
    });
  }

  function close(options?: { restoreFocus?: boolean }): void {
    const cardToFocus = options?.restoreFocus ? (mounted?.card ?? loadingCard) : null;
    hold.disarm();
    clearCardWalkState(loadingCard);
    loadingCard = null;
    apply({ type: "close" });
    requestedId = null;
    abortInFlight();
    if (cardToFocus) {
      restoreCardFocus(cardToFocus);
    }
  }

  function loadWalk(request: WalkRequest, signal: AbortSignal): Promise<WalkRoute | null> {
    if (input.fetchWalk) {
      return input.fetchWalk(request);
    }
    return fetchWalkRoute(request, (url, init) => fetch(url, { ...init, signal }));
  }

  function mapAlreadyOpen(): boolean {
    if (mounted?.kind === "map" && mounted.element.isConnected) {
      return true;
    }
    const previous = input.table.previousElementSibling;
    return previous?.matches("[data-vehicle-map='true']") ?? false;
  }

  function startWalk(label: HeldDeparture): void {
    const origin = input.readCoords();
    if (!usableOrigin(origin)) {
      return;
    }
    abortInFlight();
    const id = mintWalkAttemptId();
    apply({ id, label, origin, type: "hold" });
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

  function beginWalk(label: HeldDeparture): void {
    if (mapAlreadyOpen()) {
      return;
    }
    startWalk(label);
  }

  const hold = bindHold({
    beginWalk,
    canWalk: () => usableOrigin(input.readCoords()),
    scheduleHold,
    table: input.table,
  });

  return {
    close,
    openForCard(card) {
      const label = departureFrom(card);
      if (label) {
        startWalk(label);
      }
    },
  };
}
