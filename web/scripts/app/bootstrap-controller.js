const { createDropdownController } = require("./dropdown-controller");

function toggleDropdownOnClick(controller, event) {
  event?.stopPropagation?.();
  controller.setOpen(!controller.isOpen());
}

function attachDropdown({ controller, wrapEl, documentRef, triggerEl }) {
  triggerEl?.addEventListener?.("click", (event) => toggleDropdownOnClick(controller, event));
  documentRef?.addEventListener?.("click", (event) => {
    if (!wrapEl?.contains?.(event.target)) {
      controller.setOpen(false);
    }
  });
  triggerEl?.addEventListener?.("keydown", (event) => controller.handleKeyDown(event));
}

function registerBootstrapController(app, env = {}) {
  const runtimeGlobal = typeof globalThis === "undefined" ? {} : globalThis;
  const windowRef = env.windowRef || runtimeGlobal.window || {};
  const documentRef = env.documentRef || windowRef.document || {};
  const setIntervalRef = env.setIntervalRef || runtimeGlobal.setInterval || setInterval;
  const setTimeoutRef = env.setTimeoutRef || runtimeGlobal.setTimeout || setTimeout;
  const { api, dom, state, constants } = app;
  const { MODE_RAIL, MODE_TRAM, MODE_METRO, MODE_BUS } = constants;

  function refreshWithCurrentLocationOrRequest() {
    if (state.currentCoords) {
      api.load(state.currentCoords.lat, state.currentCoords.lon);
      return;
    }
    api.requestLocationAndLoad();
  }

  function scheduleNextFrame(task) {
    if (typeof windowRef.requestAnimationFrame === "function") {
      windowRef.requestAnimationFrame(task);
      return;
    }
    setTimeoutRef(task, 0);
  }

  function handleModeChange(nextMode) {
    if (state.mode === nextMode) return;
    api.trackFirstManualInteraction("mode_change", { toMode: nextMode });
    state.mode = nextMode;
    api.applyModeUiState({ modeOnly: true });
    scheduleNextFrame(() => {
      api.applyModeUiState();
      api.persistUiState();
      refreshWithCurrentLocationOrRequest();
    });
  }

  function initialize() {
    attachDropdown({
      controller: createDropdownController({
        triggerEl: dom.resultsLimitSelectEl,
        listEl: dom.resultsLimitSelectListEl,
        onSelect: api.selectResultsLimit,
      }),
      wrapEl: dom.resultsLimitSelectWrapEl,
      documentRef,
      triggerEl: dom.resultsLimitSelectEl,
    });

    attachDropdown({
      controller: createDropdownController({
        triggerEl: dom.busStopSelectEl,
        listEl: dom.busStopSelectListEl,
        onSelect: api.selectStop,
      }),
      wrapEl: dom.busStopSelectWrapEl,
      documentRef,
      triggerEl: dom.busStopSelectEl,
    });

    dom.locateBtn?.addEventListener?.("click", () => {
      api.trackFirstManualInteraction("refresh_location_click");
      api.requestLocationAndLoad();
    });
    dom.voiceLocateBtn?.addEventListener?.("click", () => {
      api.trackFirstManualInteraction("voice_location_click");
      api.requestVoiceLocationAndLoad();
    });
    dom.modeRailBtn?.addEventListener?.("click", () => handleModeChange(MODE_RAIL));
    dom.modeTramBtn?.addEventListener?.("click", () => handleModeChange(MODE_TRAM));
    dom.modeMetroBtn?.addEventListener?.("click", () => handleModeChange(MODE_METRO));
    dom.modeBusBtn?.addEventListener?.("click", () => handleModeChange(MODE_BUS));
    dom.stopFiltersToggleBtnEl?.addEventListener?.("click", () => {
      api.trackFirstManualInteraction("stop_filters_panel_toggle", { currentMode: state.mode });
      api.toggleStopFiltersPanel();
    });
    dom.locationPromptAllowEl?.addEventListener?.("click", () => {
      api.hideLocationPrompt();
      api.requestLocationAndLoad();
    });
    dom.permissionRetryBtnEl?.addEventListener?.("click", () => {
      api.trackFirstManualInteraction("permission_retry_click");
      api.requestLocationAndLoad();
    });

    api.hydrateInitialState();
    api.applyModeUiState();
    api.refreshVoiceLocationAvailability?.();
    api.updateClock();
    setIntervalRef(api.updateClock, 1000);

    if (api.getStorageItem("location:granted") === "1") {
      api.requestLocationAndLoad();
    } else {
      api.showLocationPrompt();
      api.setStatus("Tap Allow Location to get started.");
    }

    setIntervalRef(api.refreshDeparturesOnly, 30000);

    windowRef.addEventListener?.("error", (event) => {
      api.reportClientError("error", event.error || event.message || "Unknown error", {
        source: event.filename || "",
        line: event.lineno || null,
        column: event.colno || null,
      });
    });

    windowRef.addEventListener?.("unhandledrejection", (event) => {
      api.reportClientError("unhandledrejection", event.reason || "Unhandled promise rejection");
    });

    return app;
  }

  app.initialize = initialize;
  api.initialize = initialize;

  return app;
}

module.exports = {
  registerBootstrapController,
};
