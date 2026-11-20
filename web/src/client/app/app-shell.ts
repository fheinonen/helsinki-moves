import { formatDigitransitCredit } from "@client/app/digitransit-credit";
import { scrollMapIntoView } from "@client/features/map/map-chrome";
import { appendOsmCredit, OSM_ADDRESS_CREDIT } from "@client/features/map/osm-credit";
import { renderDepartureCard } from "@client/features/departures/departure-card-view";
import { createVehicleSpanMap, type VehicleSpanMap } from "@client/features/departures/vehicle-span-view";
import { createWalkSession, type HoldScheduler, type WalkSession } from "@client/features/departures/walk-session";
import { openVehicleSpanStream } from "@client/services/vehicle-span-client";
import type { VehicleSpanEvent } from "@shared/domain/vehicle-span";
import { createFilterControlsView } from "@client/features/filters/filter-controls-view";
import { renderModeSelector } from "@client/features/mode/mode-view";
import { createStopSelectorView } from "@client/features/stops/stop-selector-view";
import { getVoiceActionLabel } from "@client/features/voice/voice-capability";
import type { AppState } from "@client/app/app-store";
import type { AppController } from "@client/app/app-controller";
import { createDestinationColorBook } from "@shared/domain/destination-color";
import type { Departure } from "@shared/domain/departure";
import type { Mode } from "@shared/domain/mode";
import type { WalkRequest, WalkRoute } from "@shared/domain/walk-route";

const rootCleanupMap = new WeakMap<HTMLElement, () => void>();

function shownStopId(state: AppState): string {
  return state.filters.stopId || state.selectedStopId || "";
}

interface VehicleSpanOpener {
  (input: {
    onEvent: (event: VehicleSpanEvent) => void;
    stopId: string;
    tripId: string;
  }): () => void;
}

interface RenderAppShellOptions {
  controller: AppController;
  documentRef: Document;
  fetchWalk?: (request: WalkRequest) => Promise<WalkRoute | null>;
  openVehicleSpan?: VehicleSpanOpener;
  root: HTMLElement;
  scheduleHold?: HoldScheduler;
}

interface FilterPanelControls {
  panel: HTMLDivElement;
  toggle: HTMLButtonElement;
  toggleLabel: HTMLSpanElement;
}

interface VoiceChoicesView {
  element: HTMLDivElement;
  sync(state: AppState): void;
}

interface DeparturesTableView {
  clear(): void;
  element: HTMLTableElement;
  sync(state: AppState): void;
}

let nextFilterPanelId = 0;

function createIcon(options: {
  documentRef: Document;
  path: string;
  viewBox?: string;
}): SVGSVGElement {
  const { documentRef, path, viewBox = "0 0 24 24" } = options;
  const namespace = "http://www.w3.org/2000/svg";
  const icon = documentRef.createElementNS(namespace, "svg");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("class", "app-shell__icon");
  icon.setAttribute("fill", "none");
  icon.setAttribute("viewBox", viewBox);

  const shape = documentRef.createElementNS(namespace, "path");
  shape.setAttribute("d", path);
  shape.setAttribute("stroke", "currentColor");
  shape.setAttribute("stroke-linecap", "round");
  shape.setAttribute("stroke-linejoin", "round");
  shape.setAttribute("stroke-width", "1.8");

  icon.appendChild(shape);
  return icon;
}

function createFilterPanelId(): string {
  const id = nextFilterPanelId;
  nextFilterPanelId += 1;
  return `filter-panel-${id}`;
}

function cleanupRoot(root: HTMLElement): void {
  const cleanup = rootCleanupMap.get(root);
  if (!cleanup) {
    return;
  }
  cleanup();
  rootCleanupMap.delete(root);
}

function buildVoiceChoicesSignature(state: AppState): string {
  return state.voice.choices.map((choice) => choice.label).join("\u001f");
}

function departurePaintKey(departure: Departure): string {
  return `${departure.line}:${departure.destination}:${departure.departureIso}:${departure.track || ""}:${departure.stopCode || ""}:${departure.tripId || ""}`;
}

function buildDeparturesSignature(state: AppState): string {
  return (
    state.activeMode +
    "\u001f" +
    (state.station?.departures || []).map((departure) => departurePaintKey(departure)).join("\u001f")
  );
}

function isStrictPaintPrefix(previous: readonly Departure[], next: readonly Departure[]): boolean {
  if (next.length <= previous.length) {
    return false;
  }
  return previous.every((departure, index) => departurePaintKey(departure) === departurePaintKey(next[index]));
}

function countActiveFilters(state: AppState): number {
  return state.filters.lines.length + state.filters.destinations.length;
}

function syncAttribution(attribution: HTMLElement, receivedAtIso: string | null): void {
  attribution.textContent = receivedAtIso ? formatDigitransitCredit(receivedAtIso) : "";
}

function formatClock(now: Date): string {
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function startClock(clockEl: HTMLElement): () => void {
  const tick = () => {
    clockEl.textContent = formatClock(new Date(Date.now()));
  };
  tick();
  const intervalId = setInterval(tick, 1000);
  return () => {
    clearInterval(intervalId);
  };
}

function createActionButton(input: {
  ariaLabel: string;
  className: string;
  dataAttribute: Record<string, string>;
  documentRef: Document;
  iconPath: string;
  onClick(): void;
}): HTMLButtonElement {
  const button = input.documentRef.createElement("button");
  button.className = input.className;
  Object.assign(button.dataset, input.dataAttribute);
  button.type = "button";
  button.setAttribute("aria-label", input.ariaLabel);
  button.appendChild(
    createIcon({
      documentRef: input.documentRef,
      path: input.iconPath,
    })
  );
  button.addEventListener("click", input.onClick);
  return button;
}

function setFilterPanelOpen(controls: FilterPanelControls, isOpen: boolean): void {
  controls.panel.hidden = !isOpen;
  controls.toggle.classList.toggle("is-open", isOpen);
  controls.toggle.setAttribute("aria-expanded", String(isOpen));
}

function createFilterPanelControls(
  controller: AppController,
  documentRef: Document
): FilterPanelControls & {
  controlsView: ReturnType<typeof createFilterControlsView>;
} {
  const panelId = createFilterPanelId();
  const toggle = documentRef.createElement("button");
  toggle.className = "app-shell__filter-toggle";
  toggle.dataset.filterToggle = "true";
  toggle.type = "button";
  toggle.setAttribute("aria-controls", panelId);

  const toggleLabel = documentRef.createElement("span");
  toggleLabel.className = "app-shell__filter-toggle-label";

  const toggleCaret = documentRef.createElement("span");
  toggleCaret.className = "app-shell__filter-toggle-caret";
  toggleCaret.setAttribute("aria-hidden", "true");
  toggleCaret.textContent = "\u2304";

  toggle.append(toggleLabel, toggleCaret);

  const panel = documentRef.createElement("div");
  panel.className = "app-shell__filter-panel";
  panel.dataset.filterPanel = "true";
  panel.id = panelId;

  const controlsView = createFilterControlsView({
    controller,
    documentRef,
  });
  panel.appendChild(controlsView.element);

  setFilterPanelOpen({ panel, toggle, toggleLabel }, false);
  toggle.addEventListener("click", () => {
    setFilterPanelOpen({ panel, toggle, toggleLabel }, Boolean(panel.hidden));
  });

  return {
    controlsView,
    panel,
    toggle,
    toggleLabel,
  };
}

function createVoiceChoicesView(
  controller: AppController,
  documentRef: Document
): VoiceChoicesView {
  const element = documentRef.createElement("div");
  element.className = "app-shell__voice-choices";
  element.dataset.voiceChoices = "true";
  element.setAttribute("aria-live", "polite");
  let previousSignature = "";

  element.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest<HTMLButtonElement>("[data-voice-choice]");
    if (!button) {
      return;
    }

    const voiceChoiceIndex = Number(button.dataset.voiceChoice);
    if (!Number.isInteger(voiceChoiceIndex)) {
      return;
    }

    void controller.chooseVoiceLocation(voiceChoiceIndex);
  });

  return {
    element,
    sync(state) {
      const signature = buildVoiceChoicesSignature(state);
      if (signature === previousSignature) {
        return;
      }
      previousSignature = signature;
      element.replaceChildren();

      for (let index = 0; index < state.voice.choices.length; index += 1) {
        const choice = state.voice.choices[index];
        const button = documentRef.createElement("button");
        button.className = "voice-choice";
        button.dataset.voiceChoice = String(index);
        button.type = "button";
        button.textContent = choice.label;
        element.appendChild(button);
      }

      if (state.voice.choices.length === 0) {
        return;
      }

      const notice = documentRef.createElement("p");
      notice.className = "voice-choices__odbl";
      appendOsmCredit(notice, documentRef, OSM_ADDRESS_CREDIT);
      element.appendChild(notice);
    },
  };
}

function createDeparturesTableView(
  documentRef: Document,
  onPress: (card: HTMLTableRowElement) => void
): DeparturesTableView {
  const element = documentRef.createElement("table");
  element.className = "app-shell__departures-table";
  element.hidden = true;

  const head = documentRef.createElement("thead");
  const columnHeaders = documentRef.createElement("tr");
  columnHeaders.className = "app-shell__column-headers";

  for (const label of ["Line", "Destination", "Departure"]) {
    const column = documentRef.createElement("th");
    column.scope = "col";
    const text = documentRef.createElement("span");
    text.textContent = label;
    column.appendChild(text);
    columnHeaders.appendChild(column);
  }

  const departuresList = documentRef.createElement("tbody");
  departuresList.className = "app-shell__departures";
  const caption = documentRef.createElement("caption");
  caption.className = "visually-hidden";
  caption.textContent = "Departures";
  head.appendChild(columnHeaders);
  element.append(caption, head, departuresList);
  departuresList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const card = target.closest("tr");
    if (!(card instanceof HTMLTableRowElement) || card.dataset.vehicleSpan !== "true") {
      return;
    }
    onPress(card);
  });
  const destinationColors = createDestinationColorBook();
  let previousSignature = "";
  let previousDepartures: readonly Departure[] = [];
  let previousPaintMode: Mode | null = null;

  function paintDeparture(departure: Departure, mode: Mode): void {
    departuresList.appendChild(
      renderDepartureCard({
        departure,
        destinationColor: destinationColors.colorFor(departure.destination),
        documentRef,
        mode,
      })
    );
  }

  return {
    clear() {
      if (previousSignature === "") {
        return;
      }
      previousSignature = "";
      previousDepartures = [];
      previousPaintMode = null;
      departuresList.replaceChildren();
    },
    element,
    sync(state) {
      const departures = state.station?.departures ?? [];
      const signature = buildDeparturesSignature(state);
      if (signature === previousSignature) {
        return;
      }
      const prior = previousDepartures;
      const replace = previousPaintMode !== state.activeMode || !isStrictPaintPrefix(prior, departures);
      previousSignature = signature;
      previousPaintMode = state.activeMode;
      previousDepartures = departures;
      if (replace) {
        departuresList.replaceChildren();
      }
      const added = replace ? departures : departures.slice(prior.length);
      for (const departure of added) {
        paintDeparture(departure, state.activeMode);
      }
    },
  };
}

function restoreDepartureFocus(card: HTMLTableRowElement | null): void {
  if (!card?.isConnected) {
    return;
  }
  card.querySelector<HTMLButtonElement>("button")?.focus();
}

function createVehicleSpanSession(input: {
  canWalk(): boolean;
  documentRef: Document;
  isExpanded(): boolean;
  onExpandedChange(expanded: boolean): void;
  onSwitchToWalk(card: HTMLTableRowElement): void;
  onUserClose(): void;
  openVehicleSpan?: VehicleSpanOpener;
  root: HTMLElement;
}): {
  close(options?: { restoreFocus?: boolean }): void;
  press(card: HTMLTableRowElement, options?: { switched?: boolean }): void;
} {
  let activeCard: HTMLTableRowElement | null = null;
  let map: VehicleSpanMap | null = null;
  let stopStream: (() => void) | null = null;
  const openVehicleSpan = input.openVehicleSpan ?? openVehicleSpanStream;

  const close = (options?: { restoreFocus?: boolean }) => {
    const cardToFocus = options?.restoreFocus ? activeCard : null;
    if (activeCard) {
      delete activeCard.dataset.mapActive;
    }
    activeCard = null;
    stopStream?.();
    stopStream = null;
    map?.close();
    map = null;
    if (cardToFocus) {
      restoreDepartureFocus(cardToFocus);
    }
  };

  return {
    close,
    press(card, pressOptions) {
      const tripId = card.dataset.tripId || "";
      const stopId = card.dataset.stopId || "";
      if (!tripId || !stopId) {
        return;
      }
      if (activeCard === card && map) {
        input.onUserClose();
        close();
        return;
      }
      close();
      const switched = pressOptions?.switched ?? false;
      const nextMap = createVehicleSpanMap({
        destination: card.dataset.destination || "",
        destinationColor: card.style.getPropertyValue("--destination-color") || undefined,
        documentRef: input.documentRef,
        initialExpanded: input.isExpanded(),
        line: card.dataset.line || "",
        onClose: () => {
          input.onUserClose();
          close({ restoreFocus: true });
        },
        onExpandedChange: input.onExpandedChange,
        onSwitchToWalk: input.canWalk()
          ? () => {
              nextMap.markSwitchBusy();
              input.onSwitchToWalk(card);
            }
          : undefined,
        switched,
      });
      const table = input.root.querySelector(".app-shell__departures-table");
      if (table) {
        table.before(nextMap.element);
      } else {
        input.root.append(nextMap.element);
      }
      card.dataset.mapActive = "true";
      activeCard = card;
      if (!switched) {
        scrollMapIntoView(nextMap.element, input.documentRef);
      }
      map = nextMap;
      stopStream = openVehicleSpan({
        onEvent(event) {
          nextMap.apply(event);
        },
        stopId,
        tripId,
      });
    },
  };
}

const EDITABLE_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || EDITABLE_TAGS.has(target.tagName);
}

function isModifiedSpace(event: KeyboardEvent): boolean {
  return event.key === " " && (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey);
}

function metricsOf(scrolling: Element): { clientHeight: number; scrollHeight: number; scrollTop: number } {
  return {
    clientHeight: scrolling.clientHeight,
    scrollHeight: scrolling.scrollHeight,
    scrollTop: scrolling.scrollTop,
  };
}

function listenForScrollPushes(controller: AppController, documentRef: Document): () => void {
  let lastTouchY: number | null = null;

  const onWheel = (event: WheelEvent) => {
    const scrolling = documentRef.scrollingElement;
    if (!scrolling) {
      return;
    }
    controller.noteScrollPush({ kind: "wheel", deltaY: event.deltaY }, metricsOf(scrolling));
  };

  const onTouchStart = (event: TouchEvent) => {
    lastTouchY = event.touches[0]?.clientY ?? null;
  };

  const onTouchMove = (event: TouchEvent) => {
    const clientY = event.touches[0]?.clientY;
    const previousClientY = lastTouchY;
    const scrolling = documentRef.scrollingElement;
    if (clientY == null || previousClientY == null || !scrolling) {
      return;
    }
    lastTouchY = clientY;
    controller.noteScrollPush({ kind: "touch", previousClientY, clientY }, metricsOf(scrolling));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (isEditableTarget(event.target) || isModifiedSpace(event)) {
      return;
    }
    const scrolling = documentRef.scrollingElement;
    if (!scrolling) {
      return;
    }
    controller.noteScrollPush({ kind: "key", key: event.key }, metricsOf(scrolling));
  };

  documentRef.addEventListener("keydown", onKeyDown);
  documentRef.addEventListener("touchmove", onTouchMove, { passive: true });
  documentRef.addEventListener("touchstart", onTouchStart, { passive: true });
  documentRef.addEventListener("wheel", onWheel, { passive: true });

  return () => {
    documentRef.removeEventListener("keydown", onKeyDown);
    documentRef.removeEventListener("touchmove", onTouchMove);
    documentRef.removeEventListener("touchstart", onTouchStart);
    documentRef.removeEventListener("wheel", onWheel);
  };
}

export function renderAppShell(options: RenderAppShellOptions): () => void {
  const { controller, documentRef, root } = options;
  const store = controller.store;
  cleanupRoot(root);
  root.innerHTML = "";
  root.className = "app-shell";
  let previousMode = store.getState().activeMode;
  let previousStopId = shownStopId(store.getState());

  const topbar = documentRef.createElement("header");
  topbar.className = "app-shell__topbar";

  const title = documentRef.createElement("h1");
  title.className = "app-shell__title";
  title.textContent = "Helsinki Moves";

  const clock = documentRef.createElement("time");
  clock.className = "app-shell__clock";
  const stopClock = startClock(clock);

  topbar.append(title, clock);

  const modeRow = documentRef.createElement("div");
  modeRow.className = "app-shell__mode-row";

  const modeNav = documentRef.createElement("nav");
  modeNav.className = "app-shell__mode";

  const actions = documentRef.createElement("div");
  actions.className = "app-shell__actions";

  const refreshButton = createActionButton({
    ariaLabel: "Refresh location",
    className: "app-shell__refresh",
    dataAttribute: { refresh: "true" },
    documentRef,
    iconPath: "M20 5v6h-6M4 19v-6h6M6.5 8.5A7 7 0 0 1 18 6l2 5M18 15.5A7 7 0 0 1 6 18l-2-5",
    onClick() {
      void controller.refreshNearbyDepartures();
    },
  });

  const voiceButton = createActionButton({
    ariaLabel: "Voice search",
    className: "app-shell__voice",
    dataAttribute: { voiceAction: "true" },
    documentRef,
    iconPath:
      "M12 4.75a2.75 2.75 0 0 1 2.75 2.75v4.25a2.75 2.75 0 1 1-5.5 0V7.5A2.75 2.75 0 0 1 12 4.75ZM7.75 11.75a4.25 4.25 0 0 0 8.5 0M12 16v3.25M9 19.25h6",
    onClick() {
      void controller.startVoiceSearch();
    },
  });

  const voiceLabel = documentRef.createElement("span");
  voiceLabel.className = "app-shell__voice-label";
  voiceLabel.dataset.voiceLabel = "true";
  voiceLabel.hidden = true;
  voiceButton.appendChild(voiceLabel);

  actions.append(refreshButton, voiceButton);
  modeRow.append(modeNav, actions);

  const unsubscribeModeSelector = renderModeSelector({
    container: modeNav,
    controller,
    documentRef,
  });

  const stopSection = documentRef.createElement("div");
  stopSection.className = "app-shell__stop-section";
  stopSection.dataset.controlsPanel = "true";

  const stopSelectorView = createStopSelectorView({
    controller,
    documentRef,
  });

  const filterPanelControls = createFilterPanelControls(controller, documentRef);

  const stopRow = documentRef.createElement("div");
  stopRow.className = "app-shell__stop-row";
  stopRow.append(stopSelectorView.element, filterPanelControls.toggle);

  stopSection.append(stopRow, filterPanelControls.panel);

  const voiceChoicesView = createVoiceChoicesView(controller, documentRef);

  const status = documentRef.createElement("p");
  status.className = "app-shell__status";
  status.dataset.status = "true";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  const stationTitle = documentRef.createElement("p");
  stationTitle.dataset.stationTitle = "true";
  stationTitle.hidden = true;

  let walk!: WalkSession;
  let mapExpanded = false;
  const resetMapExpanded = () => {
    mapExpanded = false;
  };
  const setMapExpanded = (expanded: boolean) => {
    mapExpanded = expanded;
  };
  const isMapExpanded = () => mapExpanded;
  const hasUsableCoords = () => {
    const coords = store.getState().coords;
    return coords != null && Number.isFinite(coords.lat) && Number.isFinite(coords.lon);
  };
  const vehicleSpan = createVehicleSpanSession({
    canWalk: hasUsableCoords,
    documentRef,
    isExpanded: isMapExpanded,
    onExpandedChange: setMapExpanded,
    onSwitchToWalk: (card) => {
      walk.openForCard(card);
    },
    onUserClose: () => {
      resetMapExpanded();
      walk.close();
    },
    openVehicleSpan: options.openVehicleSpan,
    root,
  });
  const departuresTableView = createDeparturesTableView(documentRef, (card) => {
    walk.close();
    vehicleSpan.press(card);
  });
  walk = createWalkSession({
    closeVehicle: () => {
      vehicleSpan.close();
    },
    documentRef,
    fetchWalk: options.fetchWalk,
    isExpanded: isMapExpanded,
    onExpandedChange: setMapExpanded,
    onSwitchToVehicle: (card) => {
      walk.close();
      vehicleSpan.press(card, { switched: true });
    },
    onUserClose: resetMapExpanded,
    readCoords: () => store.getState().coords,
    scheduleHold: options.scheduleHold,
    table: departuresTableView.element,
  });
  const closeMaps = () => {
    resetMapExpanded();
    walk.close();
    vehicleSpan.close();
  };
  departuresTableView.element.setAttribute("aria-live", "polite");
  departuresTableView.element.setAttribute("aria-relevant", "additions removals");

  const attribution = documentRef.createElement("footer");
  attribution.className = "app-shell__footer";

  const syncView = (state: AppState) => {
    if (state.activeMode !== previousMode) {
      setFilterPanelOpen(filterPanelControls, false);
      closeMaps();
      previousMode = state.activeMode;
    }
    const stopId = shownStopId(state);
    if (stopId !== previousStopId) {
      closeMaps();
      previousStopId = stopId;
    }

    stationTitle.textContent = state.station?.stopName || "";
    status.textContent = state.statusMessage || "";
    syncAttribution(attribution, state.dataReceivedAtIso);
    voiceLabel.textContent = getVoiceActionLabel(state.voice);
    voiceButton.disabled =
      state.voice.availability === "checking" ||
      state.voice.availability === "unavailable" ||
      state.voice.phase !== "idle";
    voiceButton.classList.toggle("is-listening", state.voice.phase === "listening");

    const activeCount = countActiveFilters(state);
    filterPanelControls.toggleLabel.textContent =
      activeCount > 0 ? `Filters (${activeCount})` : "Filters";
    filterPanelControls.toggle.hidden = state.stops.length === 0;
    stopSection.hidden = state.stops.length === 0;

    const hasDepartures = state.loadState === "ready" && (state.station?.departures?.length ?? 0) > 0;
    departuresTableView.element.hidden = !hasDepartures;

    voiceChoicesView.sync(state);
    stopSelectorView.sync(state);
    filterPanelControls.controlsView.sync(state);
    if (state.loadState === "ready") {
      departuresTableView.sync(state);
      return;
    }
    departuresTableView.clear();
  };

  syncView(store.getState());
  const unsubscribeStore = store.subscribe(syncView);
  const stopScrollPushes = listenForScrollPushes(controller, documentRef);
  const cleanup = () => {
    closeMaps();
    stopScrollPushes();
    unsubscribeModeSelector();
    unsubscribeStore();
    stopSelectorView.cleanup();
    stopClock();
    if (rootCleanupMap.get(root) === cleanup) {
      rootCleanupMap.delete(root);
    }
  };
  rootCleanupMap.set(root, cleanup);

  const board = documentRef.createElement("main");
  board.className = "app-shell__board";
  board.append(
    modeRow,
    stopSection,
    voiceChoicesView.element,
    status,
    stationTitle,
    departuresTableView.element,
  );
  root.append(topbar, board, attribution);
  return cleanup;
}
