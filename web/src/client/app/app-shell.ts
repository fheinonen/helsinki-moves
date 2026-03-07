import { renderDepartureCard } from "@client/features/departures/departure-card-view";
import { createFilterControlsView } from "@client/features/filters/filter-controls-view";
import { renderModeSelector } from "@client/features/mode/mode-view";
import { createStopSelectorView } from "@client/features/stops/stop-selector-view";
import { getVoiceActionLabel } from "@client/features/voice/voice-capability";
import type { AppStore, AppState } from "@client/app/app-store";
import type { AppController } from "@client/app/app-controller";

interface RenderAppShellOptions {
  controller: AppController;
  documentRef: Document;
  root: HTMLElement;
  store: AppStore;
}

function renderVoiceChoices(
  choicesRoot: HTMLElement,
  controller: AppController,
  documentRef: Document,
  state: AppState
): void {
  choicesRoot.innerHTML = "";
  if (state.voice.choices.length === 0) {
    return;
  }

  for (let index = 0; index < state.voice.choices.length; index += 1) {
    const choice = state.voice.choices[index];
    const button = documentRef.createElement("button");
    button.className = "voice-choice";
    button.dataset.voiceChoice = String(index);
    button.type = "button";
    button.textContent = choice.label;
    button.addEventListener("click", () => {
      void controller.chooseVoiceLocation(index);
    });
    choicesRoot.appendChild(button);
  }
}

function renderDepartureList(
  departuresList: HTMLElement,
  documentRef: Document,
  state: AppState
): void {
  departuresList.innerHTML = "";
  for (const departure of state.station?.departures || []) {
    departuresList.appendChild(
      renderDepartureCard({
        departure,
        documentRef,
      })
    );
  }
}

export function renderAppShell(options: RenderAppShellOptions): void {
  const { controller, documentRef, root, store } = options;
  root.innerHTML = "";
  root.className = "app-shell";

  const title = documentRef.createElement("h1");
  title.className = "app-shell__title";
  title.textContent = "Helsinki Moves";

  const eyebrow = documentRef.createElement("p");
  eyebrow.className = "app-shell__eyebrow";
  eyebrow.textContent = "Real-time departures shaped around your nearest lines";

  const modeContainer = documentRef.createElement("section");
  modeContainer.className = "app-shell__mode";

  const stationTitle = documentRef.createElement("p");
  stationTitle.className = "app-shell__station-title";
  stationTitle.dataset.stationTitle = "true";

  const status = documentRef.createElement("p");
  status.className = "app-shell__status";
  status.dataset.status = "true";

  const refreshButton = documentRef.createElement("button");
  refreshButton.className = "app-shell__refresh";
  refreshButton.dataset.refresh = "true";
  refreshButton.textContent = "Refresh Location";
  refreshButton.type = "button";
  refreshButton.addEventListener("click", () => {
    void controller.refreshNearbyDepartures();
  });

  const voiceButton = documentRef.createElement("button");
  voiceButton.className = "app-shell__voice";
  voiceButton.dataset.voiceAction = "true";
  voiceButton.type = "button";
  voiceButton.addEventListener("click", () => {
    void controller.startVoiceSearch();
  });

  const voiceLabel = documentRef.createElement("span");
  voiceLabel.dataset.voiceLabel = "true";
  voiceButton.appendChild(voiceLabel);

  const voiceChoices = documentRef.createElement("div");
  voiceChoices.className = "app-shell__voice-choices";
  voiceChoices.dataset.voiceChoices = "true";

  const departuresList = documentRef.createElement("ul");
  departuresList.className = "app-shell__departures";

  const controls = documentRef.createElement("section");
  controls.className = "app-shell__controls";
  controls.dataset.controlsPanel = "true";

  const stopSelectorView = createStopSelectorView({
    controller,
    documentRef,
  });
  const filterControlsView = createFilterControlsView({
    controller,
    documentRef,
  });
  controls.append(stopSelectorView.element, filterControlsView.element);

  renderModeSelector({
    container: modeContainer,
    controller,
    documentRef,
  });

  const syncView = (state: AppState) => {
    stationTitle.textContent = state.station?.stopName || "";
    status.textContent = state.statusMessage || "";
    voiceLabel.textContent = getVoiceActionLabel(state.voice);
    voiceButton.disabled =
      state.voice.availability === "checking" ||
      state.voice.availability === "unavailable" ||
      state.voice.phase !== "idle";
    voiceButton.classList.toggle("is-listening", state.voice.phase === "listening");
    renderVoiceChoices(voiceChoices, controller, documentRef, state);
    stopSelectorView.sync(state);
    filterControlsView.sync(state);
    if (state.loadState === "ready") {
      renderDepartureList(departuresList, documentRef, state);
      return;
    }
    departuresList.innerHTML = "";
  };

  syncView(store.getState());
  store.subscribe(syncView);

  root.append(
    eyebrow,
    title,
    modeContainer,
    refreshButton,
    voiceButton,
    voiceChoices,
    status,
    controls,
    stationTitle,
    departuresList
  );
}
