import { renderDepartureCard } from "@client/features/departures/departure-card-view";
import { createFilterControlsView } from "@client/features/filters/filter-controls-view";
import { renderModeSelector } from "@client/features/mode/mode-view";
import { createStopSelectorView } from "@client/features/stops/stop-selector-view";
import { getVoiceActionLabel } from "@client/features/voice/voice-capability";
import type { AppStore, AppState } from "@client/app/app-store";
import type { AppController } from "@client/app/app-controller";

const rootCleanupMap = new WeakMap<HTMLElement, () => void>();

interface RenderAppShellOptions {
  controller: AppController;
  documentRef: Document;
  root: HTMLElement;
  store: AppStore;
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

function buildDeparturesSignature(state: AppState): string {
  return (
    state.activeMode +
    "\u001f" +
    (state.station?.departures || [])
      .map((d) => `${d.line}:${d.destination}:${d.departureIso}:${d.track || ""}:${d.stopCode || ""}`)
      .join("\u001f")
  );
}

function countActiveFilters(state: AppState): number {
  return state.filters.lines.length + state.filters.destinations.length;
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
    setFilterPanelOpen({ panel, toggle, toggleLabel }, panel.hidden);
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
    },
  };
}

function createDeparturesTableView(documentRef: Document): DeparturesTableView {
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
  head.appendChild(columnHeaders);
  element.append(head, departuresList);
  let previousSignature = "";

  return {
    clear() {
      if (previousSignature === "") {
        return;
      }
      previousSignature = "";
      departuresList.replaceChildren();
    },
    element,
    sync(state) {
      const signature = buildDeparturesSignature(state);
      if (signature === previousSignature) {
        return;
      }
      previousSignature = signature;
      departuresList.replaceChildren();

      for (const departure of state.station?.departures || []) {
        departuresList.appendChild(
          renderDepartureCard({
            departure,
            documentRef,
            mode: state.activeMode,
          })
        );
      }
    },
  };
}

export function renderAppShell(options: RenderAppShellOptions): () => void {
  const { controller, documentRef, root, store } = options;
  cleanupRoot(root);
  root.innerHTML = "";
  root.className = "app-shell";
  let previousMode = store.getState().activeMode;

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

  const departuresTableView = createDeparturesTableView(documentRef);
  departuresTableView.element.setAttribute("aria-live", "polite");
  departuresTableView.element.setAttribute("aria-relevant", "additions removals");

  const syncView = (state: AppState) => {
    if (state.activeMode !== previousMode) {
      setFilterPanelOpen(filterPanelControls, false);
      previousMode = state.activeMode;
    }

    stationTitle.textContent = state.station?.stopName || "";
    status.textContent = state.statusMessage || "";
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
  const cleanup = () => {
    unsubscribeModeSelector();
    unsubscribeStore();
    stopSelectorView.cleanup();
    stopClock();
    if (rootCleanupMap.get(root) === cleanup) {
      rootCleanupMap.delete(root);
    }
  };
  rootCleanupMap.set(root, cleanup);

  root.append(
    topbar,
    modeRow,
    stopSection,
    voiceChoicesView.element,
    status,
    stationTitle,
    departuresTableView.element
  );
  return cleanup;
}
