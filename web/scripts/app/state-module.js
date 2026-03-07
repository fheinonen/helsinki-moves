const {
  getModeConstants,
  getResultLimitDefaults,
  normalizeMode: normalizeSupportedMode,
} = require("./mode-policy");

function getElement(documentRef, id) {
  return documentRef?.getElementById?.(id) || null;
}

function registerStateModule(app, env = {}) {
  const runtimeGlobal = typeof globalThis === "undefined" ? {} : globalThis;
  const windowRef = env.windowRef || runtimeGlobal.window || {};
  const documentRef = env.documentRef || windowRef.document || {};
  const navigatorRef = env.navigatorRef || runtimeGlobal.navigator || {};
  const fetchImpl = env.fetchImpl || runtimeGlobal.fetch;
  const api = (app.api ||= {});
  const modeConstants = getModeConstants();
  const resultLimitDefaults = getResultLimitDefaults();

  app.dom = {
    locateBtn: getElement(documentRef, "locateBtn"),
    voiceLocateBtn: getElement(documentRef, "voiceLocateBtn"),
    voiceLocateBtnLabel: getElement(documentRef, "voiceLocateBtnLabel"),
    skeletonEl: getElement(documentRef, "skeleton"),
    segmentControlEl: documentRef?.querySelector?.(".segment-control") || null,
    modeRailBtn: getElement(documentRef, "modeRailBtn"),
    modeTramBtn: getElement(documentRef, "modeTramBtn"),
    modeMetroBtn: getElement(documentRef, "modeMetroBtn"),
    modeBusBtn: getElement(documentRef, "modeBusBtn"),
    busControlsEl: getElement(documentRef, "busControls"),
    busStopSelectEl: getElement(documentRef, "busStopSelect"),
    busStopSelectLabelEl: getElement(documentRef, "busStopSelectLabel"),
    busStopSelectListEl: getElement(documentRef, "busStopSelectList"),
    busStopSelectWrapEl: getElement(documentRef, "busStopSelectWrap"),
    busStopFiltersEl: getElement(documentRef, "busStopFilters"),
    busLineFiltersEl: getElement(documentRef, "busLineFilters"),
    busDestinationFiltersEl: getElement(documentRef, "busDestinationFilters"),
    stopFiltersToggleBtnEl: getElement(documentRef, "stopFiltersToggleBtn"),
    stopFiltersPanelEl: getElement(documentRef, "stopFiltersPanel"),
    stopFilterSummaryEl: getElement(documentRef, "stopFilterSummary"),
    resultsLimitSelectEl: getElement(documentRef, "resultsLimitSelect"),
    resultsLimitSelectLabelEl: getElement(documentRef, "resultsLimitSelectLabel"),
    resultsLimitSelectListEl: getElement(documentRef, "resultsLimitSelectList"),
    resultsLimitSelectWrapEl: getElement(documentRef, "resultsLimitSelectWrap"),
    modeEyebrowEl: getElement(documentRef, "modeEyebrow"),
    statusEl: getElement(documentRef, "status"),
    resolvedLocationEl: getElement(documentRef, "resolvedLocation"),
    voiceLocationChoicesEl: getElement(documentRef, "voiceLocationChoices"),
    voiceLocationChoicesTitleEl: getElement(documentRef, "voiceLocationChoicesTitle"),
    voiceLocationChoicesOptionsEl: getElement(documentRef, "voiceLocationChoicesOptions"),
    voiceLocationChoicesCancelEl: getElement(documentRef, "voiceLocationChoicesCancel"),
    dataScopeEl: getElement(documentRef, "dataScope"),
    resultEl: getElement(documentRef, "result"),
    locationPromptCardEl: getElement(documentRef, "locationPromptCard"),
    locationPromptAllowEl: getElement(documentRef, "locationPromptAllow"),
    permissionCardEl: getElement(documentRef, "permissionCard"),
    permissionRetryBtnEl: getElement(documentRef, "permissionRetryBtn"),
    stationTitleEl: getElement(documentRef, "stationTitle"),
    stationMetaEl: getElement(documentRef, "stationMeta"),
    departuresEl: getElement(documentRef, "departures"),
    nextSummaryEl: getElement(documentRef, "nextSummary"),
    nextLabelEl: getElement(documentRef, "nextLabel"),
    nextMinsEl: getElement(documentRef, "nextMins"),
    nextLineEl: getElement(documentRef, "nextLine"),
    nextTrackEl: getElement(documentRef, "nextTrack"),
    nextDestinationEl: getElement(documentRef, "nextDestination"),
    nowClockEl: getElement(documentRef, "nowClock"),
    lastUpdatedEl: getElement(documentRef, "lastUpdated"),
  };

  app.constants = {
    ...modeConstants,
    STORAGE_MODE_KEY: "prefs:mode",
    STORAGE_BUS_STOP_KEY: "prefs:busStopId",
    STORAGE_BUS_LINES_KEY: "prefs:busLines",
    STORAGE_BUS_DESTINATIONS_KEY: "prefs:busDestinations",
    STORAGE_RESULTS_LIMIT_RAIL_KEY: "prefs:resultsLimitRail",
    STORAGE_RESULTS_LIMIT_TRAM_KEY: "prefs:resultsLimitTram",
    STORAGE_RESULTS_LIMIT_METRO_KEY: "prefs:resultsLimitMetro",
    STORAGE_RESULTS_LIMIT_BUS_KEY: "prefs:resultsLimitBus",
    DEFAULT_RESULTS_LIMIT_RAIL: resultLimitDefaults.rail,
    DEFAULT_RESULTS_LIMIT_TRAM: resultLimitDefaults.tram,
    DEFAULT_RESULTS_LIMIT_METRO: resultLimitDefaults.metro,
    DEFAULT_RESULTS_LIMIT_BUS: resultLimitDefaults.bus,
    RESULT_LIMIT_OPTIONS: [8, 12, 16, 20, 24, 30],
    VOICE_RECOGNITION_TIMEOUT_MS: 8000,
    VOICE_CAPTURE_DURATION_MS: 3500,
    VOICE_QUERY_MIN_LENGTH: 3,
    FETCH_TIMEOUT_MS: 8000,
    ERROR_REPORT_LIMIT: 5,
    METRIC_REPORT_LIMIT: 10,
    METRIC_SAMPLE_RATE: 1,
  };

  const { MODE_RAIL, MODE_TRAM, MODE_METRO, MODE_BUS } = app.constants;

  app.state = {
    locationGranted: false,
    isLoading: false,
    isVoiceListening: false,
    voiceLocationAvailability: "checking",
    currentCoords: null,
    currentCoordsTimestampMs: null,
    currentCoordsAccuracyMeters: null,
    latestResponse: null,
    mode: MODE_RAIL,
    busStopId: null,
    busStopMemberFilterId: null,
    busLineFilters: [],
    busDestinationFilters: [],
    stopFilterPinned: false,
    stopFiltersPanelOpen: false,
    stopFiltersPanelLockUntilMs: 0,
    deferInitialStopContext: false,
    deferredBusStopId: null,
    deferredBusLineFilters: [],
    deferredBusDestinationFilters: [],
    resultsLimitByMode: {
      [MODE_RAIL]: app.constants.DEFAULT_RESULTS_LIMIT_RAIL,
      [MODE_TRAM]: app.constants.DEFAULT_RESULTS_LIMIT_TRAM,
      [MODE_METRO]: app.constants.DEFAULT_RESULTS_LIMIT_METRO,
      [MODE_BUS]: app.constants.DEFAULT_RESULTS_LIMIT_BUS,
    },
    busStops: [],
    busFilterOptions: { lines: [], destinations: [] },
    resolvedLocationHint: null,
    suppressBusStopChange: false,
    hasCompletedInitialStopModeLoad: false,
    errorReportCount: 0,
    metricReportCount: 0,
    isMetricSessionSampled: Math.random() < app.constants.METRIC_SAMPLE_RATE,
    sessionStartedAtMs: Date.now(),
    hasReportedFirstSuccessfulRenderMetric: false,
    hasReportedFirstManualInteractionMetric: false,
    hasReportedFirstManualStopContextMetric: false,
    hasReportedInitialNearestStopResolvedMetric: false,
    latestLoadToken: 0,
  };

  const { dom, state, constants } = app;

  function normalizeVoiceLocationAvailability(value) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    if (normalized === "available" || normalized === "unavailable" || normalized === "checking") {
      return normalized;
    }
    return "checking";
  }

  function getVoiceActionLabel() {
    if (state.isVoiceListening) {
      return "Listening...";
    }
    if (state.voiceLocationAvailability === "unavailable") {
      return "Voice Unavailable";
    }
    if (state.voiceLocationAvailability === "available") {
      return "Voice Search";
    }
    return "Checking Voice...";
  }

  function updateLocationActionButtons() {
    const disableLocate = state.isLoading || state.isVoiceListening;
    const disableVoice = state.isLoading || state.voiceLocationAvailability === "checking";
    const voiceActionLabel = getVoiceActionLabel();
    if (dom.locateBtn) {
      dom.locateBtn.disabled = disableLocate;
    }

    if (dom.voiceLocateBtn) {
      dom.voiceLocateBtn.disabled = disableVoice;
      dom.voiceLocateBtn.classList.toggle("is-listening", state.isVoiceListening);
      dom.voiceLocateBtn.setAttribute("aria-pressed", String(state.isVoiceListening));
      dom.voiceLocateBtn.setAttribute("aria-label", voiceActionLabel);
    }

    if (dom.voiceLocateBtnLabel) {
      dom.voiceLocateBtnLabel.textContent = voiceActionLabel;
    }
  }

  function setLoading(loading) {
    state.isLoading = loading;
    updateLocationActionButtons();
    if (dom.skeletonEl) {
      dom.skeletonEl.classList.toggle("hidden", !loading);
    }
  }

  function setVoiceListening(listening) {
    state.isVoiceListening = Boolean(listening);
    updateLocationActionButtons();
  }

  function setVoiceLocationAvailability(availability) {
    state.voiceLocationAvailability = normalizeVoiceLocationAvailability(availability);
    updateLocationActionButtons();
  }

  function setStatus(text) {
    if (!dom.statusEl) return;
    const normalizedText = String(text || "").trim();
    dom.statusEl.textContent = normalizedText;
    dom.statusEl.classList?.toggle?.("hidden", normalizedText.length === 0);
  }

  function formatCoordinate(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed.toFixed(5);
  }

  function setResolvedLocationHint(hint) {
    const isValidHint = hint && typeof hint === "object";
    state.resolvedLocationHint = isValidHint
      ? {
          query: safeString(hint.query, 120).trim(),
          label: safeString(hint.label, 180).trim(),
          lat: Number(hint.lat),
          lon: Number(hint.lon),
        }
      : null;

    if (!dom.resolvedLocationEl) return;

    if (!state.resolvedLocationHint) {
      dom.resolvedLocationEl.classList.add("hidden");
      dom.resolvedLocationEl.textContent = "";
      return;
    }

    const label = state.resolvedLocationHint.label || "Unknown place";
    const query = state.resolvedLocationHint.query;
    const lat = formatCoordinate(state.resolvedLocationHint.lat);
    const lon = formatCoordinate(state.resolvedLocationHint.lon);
    const queryPart = query ? ` (from "${query}")` : "";
    const coordinatePart = lat && lon ? ` - ${lat}, ${lon}` : "";
    dom.resolvedLocationEl.textContent = `Resolved location: ${label}${queryPart}${coordinatePart}`;
    dom.resolvedLocationEl.classList.remove("hidden");
  }

  function showLocationPrompt() {
    if (dom.locationPromptCardEl) dom.locationPromptCardEl.classList.remove("hidden");
    if (dom.permissionCardEl) dom.permissionCardEl.classList.add("hidden");
  }

  function hideLocationPrompt() {
    if (dom.locationPromptCardEl) dom.locationPromptCardEl.classList.add("hidden");
  }

  function setPermissionRequired(required) {
    hideLocationPrompt();
    if (!dom.permissionCardEl) return;
    dom.permissionCardEl.classList.toggle("hidden", !required);
  }

  function setLastUpdated(date) {
    if (!dom.lastUpdatedEl || !(date instanceof Date)) return;
    dom.lastUpdatedEl.textContent = `Last updated: ${date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })}`;
  }

  function getStorageItem(key) {
    try {
      return windowRef.localStorage?.getItem?.(key) ?? null;
    } catch {
      return null;
    }
  }

  function setStorageItem(key, value) {
    try {
      windowRef.localStorage?.setItem?.(key, value);
    } catch {
      // Ignore localStorage errors (private mode, disabled storage, quota).
    }
  }

  function safeString(value, maxLength) {
    const text = String(value || "");
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength);
  }

  function toError(value) {
    if (value instanceof Error) return value;

    try {
      const message = typeof value === "string" ? value : JSON.stringify(value);
      return new Error(message || "Unknown error");
    } catch {
      return new Error(String(value || "Unknown error"));
    }
  }

  function sendClientReport(payload) {
    const body = JSON.stringify(payload);
    if (navigatorRef.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigatorRef.sendBeacon("/api/v1/client-error", blob);
      return;
    }

    if (!fetchImpl) return;

    fetchImpl("/api/v1/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // Ignore reporting failures.
    });
  }

  function reportClientError(type, rawError, context = null) {
    if (state.errorReportCount >= constants.ERROR_REPORT_LIMIT) return;
    state.errorReportCount += 1;

    const error = toError(rawError);
    const payload = {
      type: safeString(type, 40),
      message: safeString(error.message, 400),
      stack: safeString(error.stack || "", 1200),
      url: safeString(windowRef.location?.href || "", 500),
      userAgent: safeString(navigatorRef.userAgent || "", 300),
      timestamp: new Date().toISOString(),
      context: context && typeof context === "object" ? context : null,
    };
    sendClientReport(payload);
  }

  function getSessionElapsedMs() {
    return Math.max(0, Date.now() - state.sessionStartedAtMs);
  }

  function reportClientMetric(name, context = null) {
    if (!state.isMetricSessionSampled) return false;
    if (state.metricReportCount >= constants.METRIC_REPORT_LIMIT) return false;

    state.metricReportCount += 1;
    const payload = {
      type: "metric",
      message: safeString(name, 400),
      stack: "",
      url: safeString(windowRef.location?.href || "", 500),
      userAgent: safeString(navigatorRef.userAgent || "", 300),
      timestamp: new Date().toISOString(),
      context: {
        metricName: safeString(name, 80),
        sessionElapsedMs: getSessionElapsedMs(),
        mode: state.mode,
        ...(context && typeof context === "object" ? context : {}),
      },
    };

    sendClientReport(payload);
    return true;
  }

  function trackFirstSuccessfulRender(responseData, requestMode) {
    if (state.hasReportedFirstSuccessfulRenderMetric) return;
    state.hasReportedFirstSuccessfulRenderMetric = true;

    const departures = Array.isArray(responseData?.station?.departures)
      ? responseData.station.departures
      : [];
    reportClientMetric("first_successful_render", {
      requestMode: String(requestMode || "").trim(),
      hasStation: Boolean(responseData?.station),
      departureCount: departures.length,
    });
  }

  function trackFirstManualInteraction(interactionType, context = null) {
    if (state.hasReportedFirstManualInteractionMetric) return;
    state.hasReportedFirstManualInteractionMetric = true;
    reportClientMetric("first_manual_interaction", {
      interactionType: safeString(interactionType, 80),
      ...(context && typeof context === "object" ? context : {}),
    });
  }

  function trackFirstManualStopContextChange(changeType, context = null) {
    if (state.hasReportedFirstManualStopContextMetric) return;
    state.hasReportedFirstManualStopContextMetric = true;
    reportClientMetric("first_manual_stop_context_change", {
      changeType: safeString(changeType, 80),
      lineFilterCount: state.busLineFilters.length,
      destinationFilterCount: state.busDestinationFilters.length,
      ...(context && typeof context === "object" ? context : {}),
    });
  }

  function trackInitialNearestStopResolved(responseData, requestMode) {
    if (state.hasReportedInitialNearestStopResolvedMetric) return;

    const selectedStopId = String(responseData?.selectedStopId || "").trim();
    if (!selectedStopId) return;

    state.hasReportedInitialNearestStopResolvedMetric = true;
    const stops = Array.isArray(responseData?.stops) ? responseData.stops : [];
    const selectedStop = stops.find((stop) => stop?.id === selectedStopId) || null;
    const departures = Array.isArray(responseData?.station?.departures)
      ? responseData.station.departures
      : [];

    reportClientMetric("initial_nearest_stop_resolved", {
      requestMode: String(requestMode || "").trim(),
      selectedStopId,
      distanceMeters: Number(selectedStop?.distanceMeters) || null,
      departureCount: departures.length,
    });
  }

  function normalizeMode(value) {
    return normalizeSupportedMode(value);
  }

  function parseBoolean(raw) {
    if (raw == null) return null;
    const normalized = String(raw).trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return null;
  }

  function uniqueNonEmptyStrings(list) {
    if (!Array.isArray(list)) return [];
    return [...new Set(list.map((item) => String(item || "").trim()).filter(Boolean))];
  }

  function parseResultLimit(rawValue) {
    if (rawValue == null || rawValue === "") return null;

    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed)) return null;
    if (!constants.RESULT_LIMIT_OPTIONS.includes(parsed)) return null;
    return parsed;
  }

  function getDefaultResultsLimit(mode = state.mode) {
    if (mode === MODE_BUS) return constants.DEFAULT_RESULTS_LIMIT_BUS;
    if (mode === MODE_METRO) return constants.DEFAULT_RESULTS_LIMIT_METRO;
    if (mode === MODE_TRAM) return constants.DEFAULT_RESULTS_LIMIT_TRAM;
    return constants.DEFAULT_RESULTS_LIMIT_RAIL;
  }

  function getActiveResultsLimit(mode = state.mode) {
    const selected = parseResultLimit(state.resultsLimitByMode?.[mode]);
    if (selected != null) return selected;
    return getDefaultResultsLimit(mode);
  }

  function parseStoredArray(key) {
    const raw = getStorageItem(key);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      return uniqueNonEmptyStrings(parsed);
    } catch {
      return [];
    }
  }

  function readStateFromUrl() {
    const params = new URLSearchParams(windowRef.location?.search || "");

    return {
      mode: normalizeMode(params.get("mode")),
      stopProvided: params.has("stop"),
      busStopId: params.get("stop") ? params.get("stop").trim() : null,
      linesProvided: params.has("line"),
      busLines: uniqueNonEmptyStrings(params.getAll("line")),
      destinationsProvided: params.has("dest"),
      busDestinations: uniqueNonEmptyStrings(params.getAll("dest")),
      resultsProvided: params.has("results"),
      resultsLimit: parseResultLimit(params.get("results")),
    };
  }

  function hydrateInitialState() {
    // Precedence matrix for stop-mode context on session start:
    // 1) Current-session user actions (once interaction happens)
    // 2) Nearest geolocated defaults from first successful API load
    // 3) Persisted URL/localStorage state (deferred, never auto-applied on first load)
    const urlState = readStateFromUrl();
    const storedMode = normalizeMode(getStorageItem(constants.STORAGE_MODE_KEY));

    state.mode = urlState.mode || storedMode || MODE_RAIL;

    const storedStopId = String(getStorageItem(constants.STORAGE_BUS_STOP_KEY) || "").trim() || null;
    const hydratedStopId = urlState.stopProvided ? urlState.busStopId : storedStopId;

    const storedLines = parseStoredArray(constants.STORAGE_BUS_LINES_KEY);
    const storedDestinations = parseStoredArray(constants.STORAGE_BUS_DESTINATIONS_KEY);
    const hydratedLines = urlState.linesProvided ? urlState.busLines : storedLines;
    const hydratedDestinations = urlState.destinationsProvided
      ? urlState.busDestinations
      : storedDestinations;

    const hasPersistedStopContext =
      Boolean(hydratedStopId) || hydratedLines.length > 0 || hydratedDestinations.length > 0;
    state.deferInitialStopContext = hasPersistedStopContext;

    if (hasPersistedStopContext) {
      state.deferredBusStopId = hydratedStopId;
      state.deferredBusLineFilters = [...hydratedLines];
      state.deferredBusDestinationFilters = [...hydratedDestinations];
      state.busStopId = null;
      state.busLineFilters = [];
      state.busDestinationFilters = [];
    } else {
      state.deferredBusStopId = null;
      state.deferredBusLineFilters = [];
      state.deferredBusDestinationFilters = [];
      state.busStopId = hydratedStopId;
      state.busLineFilters = hydratedLines;
      state.busDestinationFilters = hydratedDestinations;
    }

    const storedRailResultsLimit = parseResultLimit(
      getStorageItem(constants.STORAGE_RESULTS_LIMIT_RAIL_KEY)
    );
    const storedTramResultsLimit = parseResultLimit(
      getStorageItem(constants.STORAGE_RESULTS_LIMIT_TRAM_KEY)
    );
    const storedMetroResultsLimit = parseResultLimit(
      getStorageItem(constants.STORAGE_RESULTS_LIMIT_METRO_KEY)
    );
    const storedBusResultsLimit = parseResultLimit(
      getStorageItem(constants.STORAGE_RESULTS_LIMIT_BUS_KEY)
    );

    state.resultsLimitByMode[MODE_RAIL] =
      storedRailResultsLimit ?? constants.DEFAULT_RESULTS_LIMIT_RAIL;
    state.resultsLimitByMode[MODE_TRAM] =
      storedTramResultsLimit ?? constants.DEFAULT_RESULTS_LIMIT_TRAM;
    state.resultsLimitByMode[MODE_METRO] =
      storedMetroResultsLimit ?? constants.DEFAULT_RESULTS_LIMIT_METRO;
    state.resultsLimitByMode[MODE_BUS] =
      storedBusResultsLimit ?? constants.DEFAULT_RESULTS_LIMIT_BUS;

    if (urlState.resultsProvided && urlState.resultsLimit != null) {
      state.resultsLimitByMode[state.mode] = urlState.resultsLimit;
    }
  }

  function syncStateToStorage() {
    setStorageItem(constants.STORAGE_MODE_KEY, state.mode);
    setStorageItem(constants.STORAGE_BUS_STOP_KEY, state.busStopId || "");
    setStorageItem(constants.STORAGE_BUS_LINES_KEY, JSON.stringify(state.busLineFilters));
    setStorageItem(
      constants.STORAGE_BUS_DESTINATIONS_KEY,
      JSON.stringify(state.busDestinationFilters)
    );
    setStorageItem(
      constants.STORAGE_RESULTS_LIMIT_RAIL_KEY,
      String(getActiveResultsLimit(MODE_RAIL))
    );
    setStorageItem(
      constants.STORAGE_RESULTS_LIMIT_TRAM_KEY,
      String(getActiveResultsLimit(MODE_TRAM))
    );
    setStorageItem(
      constants.STORAGE_RESULTS_LIMIT_METRO_KEY,
      String(getActiveResultsLimit(MODE_METRO))
    );
    setStorageItem(
      constants.STORAGE_RESULTS_LIMIT_BUS_KEY,
      String(getActiveResultsLimit(MODE_BUS))
    );
  }

  function syncStateToUrl() {
    const params = new URLSearchParams(windowRef.location?.search || "");

    if (state.mode === MODE_RAIL) {
      params.delete("mode");
    } else {
      params.set("mode", state.mode);
    }

    const activeResultsLimit = getActiveResultsLimit();
    const defaultResultsLimit = getDefaultResultsLimit();
    if (activeResultsLimit === defaultResultsLimit) {
      params.delete("results");
    } else {
      params.set("results", String(activeResultsLimit));
    }

    params.delete("stop");
    params.delete("line");
    params.delete("dest");

    if (state.mode === MODE_BUS || state.mode === MODE_TRAM || state.mode === MODE_METRO || state.mode === MODE_RAIL) {
      if (state.busStopId) {
        params.set("stop", state.busStopId);
      }

      for (const line of state.busLineFilters) {
        params.append("line", line);
      }

      for (const destination of state.busDestinationFilters) {
        params.append("dest", destination);
      }
    }

    const queryString = params.toString();
    const nextUrl = `${windowRef.location?.pathname || "/"}${queryString ? `?${queryString}` : ""}${windowRef.location?.hash || ""}`;
    windowRef.history?.replaceState?.(null, "", nextUrl);
  }

  function persistUiState() {
    syncStateToStorage();
    syncStateToUrl();
  }

  updateLocationActionButtons();

  Object.assign(api, {
    updateLocationActionButtons,
    setLoading,
    setVoiceListening,
    setVoiceLocationAvailability,
    setStatus,
    setResolvedLocationHint,
    showLocationPrompt,
    hideLocationPrompt,
    setPermissionRequired,
    setLastUpdated,
    getStorageItem,
    setStorageItem,
    safeString,
    toError,
    sendClientReport,
    reportClientError,
    reportClientMetric,
    getSessionElapsedMs,
    trackFirstSuccessfulRender,
    trackFirstManualInteraction,
    trackFirstManualStopContextChange,
    trackInitialNearestStopResolved,
    normalizeMode,
    parseBoolean,
    uniqueNonEmptyStrings,
    parseResultLimit,
    getDefaultResultsLimit,
    getActiveResultsLimit,
    parseStoredArray,
    readStateFromUrl,
    hydrateInitialState,
    syncStateToStorage,
    syncStateToUrl,
    persistUiState,
  });
  return app;
}

module.exports = {
  registerStateModule,
};
