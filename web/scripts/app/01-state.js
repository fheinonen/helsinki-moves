/* App State + Shared Helpers */
(() => {
  const app = window.HMApp || (window.HMApp = {});
  const api = (app.api ||= {});

  app.dom = {
    locateBtn: document.getElementById("locateBtn"),
    modeRailBtn: document.getElementById("modeRailBtn"),
    modeBusBtn: document.getElementById("modeBusBtn"),
    helsinkiOnlyBtn: document.getElementById("helsinkiOnlyBtn"),
    busControlsEl: document.getElementById("busControls"),
    busStopSelectEl: document.getElementById("busStopSelect"),
    busLineFiltersEl: document.getElementById("busLineFilters"),
    busDestinationFiltersEl: document.getElementById("busDestinationFilters"),
    modeEyebrowEl: document.getElementById("modeEyebrow"),
    statusEl: document.getElementById("status"),
    dataScopeEl: document.getElementById("dataScope"),
    resultEl: document.getElementById("result"),
    permissionCardEl: document.getElementById("permissionCard"),
    stationTitleEl: document.getElementById("stationTitle"),
    stationMetaEl: document.getElementById("stationMeta"),
    departuresEl: document.getElementById("departures"),
    nextSummaryEl: document.getElementById("nextSummary"),
    nextLabelEl: document.getElementById("nextLabel"),
    nextMinsEl: document.getElementById("nextMins"),
    nextLineEl: document.getElementById("nextLine"),
    nextTrackEl: document.getElementById("nextTrack"),
    nextDestinationEl: document.getElementById("nextDestination"),
    nowClockEl: document.getElementById("nowClock"),
    lastUpdatedEl: document.getElementById("lastUpdated"),
  };

  app.constants = {
    MODE_RAIL: "rail",
    MODE_BUS: "bus",
    STORAGE_MODE_KEY: "prefs:mode",
    STORAGE_HELSINKI_ONLY_KEY: "prefs:helsinkiOnly",
    STORAGE_BUS_STOP_KEY: "prefs:busStopId",
    STORAGE_BUS_LINES_KEY: "prefs:busLines",
    STORAGE_BUS_DESTINATIONS_KEY: "prefs:busDestinations",
    FETCH_TIMEOUT_MS: 8000,
    ERROR_REPORT_LIMIT: 5,
  };

  const { MODE_RAIL, MODE_BUS } = app.constants;

  app.state = {
    isLoading: false,
    currentCoords: null,
    latestResponse: null,
    mode: MODE_RAIL,
    helsinkiOnly: false,
    busStopId: null,
    busLineFilters: [],
    busDestinationFilters: [],
    busStops: [],
    busFilterOptions: { lines: [], destinations: [] },
    suppressBusStopChange: false,
    errorReportCount: 0,
    latestLoadToken: 0,
  };

  const { dom, state, constants } = app;

  function setLoading(loading) {
    state.isLoading = loading;
    if (dom.locateBtn) {
      dom.locateBtn.disabled = loading;
    }
  }

  function setStatus(text) {
    if (!dom.statusEl) return;
    dom.statusEl.textContent = text;
  }

  function setPermissionRequired(required) {
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
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function setStorageItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
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

  function reportClientError(type, rawError, context = null) {
    if (state.errorReportCount >= constants.ERROR_REPORT_LIMIT) return;
    state.errorReportCount += 1;

    const error = toError(rawError);
    const payload = {
      type: safeString(type, 40),
      message: safeString(error.message, 400),
      stack: safeString(error.stack || "", 1200),
      url: safeString(window.location.href, 500),
      userAgent: safeString(navigator.userAgent || "", 300),
      timestamp: new Date().toISOString(),
      context: context && typeof context === "object" ? context : null,
    };

    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/v1/client-error", blob);
      return;
    }

    fetch("/api/v1/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // Ignore reporting failures.
    });
  }

  function normalizeMode(value) {
    if (!value) return null;
    const lowered = String(value).trim().toLowerCase();
    if (lowered === MODE_RAIL || lowered === MODE_BUS) return lowered;
    return null;
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
    const params = new URLSearchParams(window.location.search);

    return {
      mode: normalizeMode(params.get("mode")),
      helsinkiOnly: parseBoolean(params.get("helsinkiOnly")),
      stopProvided: params.has("stop"),
      busStopId: params.get("stop") ? params.get("stop").trim() : null,
      linesProvided: params.has("line"),
      busLines: uniqueNonEmptyStrings(params.getAll("line")),
      destinationsProvided: params.has("dest"),
      busDestinations: uniqueNonEmptyStrings(params.getAll("dest")),
    };
  }

  function hydrateInitialState() {
    const urlState = readStateFromUrl();
    const storedMode = normalizeMode(getStorageItem(constants.STORAGE_MODE_KEY));
    const storedHelsinkiOnly = parseBoolean(getStorageItem(constants.STORAGE_HELSINKI_ONLY_KEY));

    state.mode = urlState.mode || storedMode || MODE_RAIL;
    state.helsinkiOnly = urlState.helsinkiOnly ?? storedHelsinkiOnly ?? false;
    if (state.mode !== MODE_RAIL) {
      state.helsinkiOnly = false;
    }

    const storedStopId = String(getStorageItem(constants.STORAGE_BUS_STOP_KEY) || "").trim() || null;
    state.busStopId = urlState.stopProvided ? urlState.busStopId : storedStopId;

    const storedLines = parseStoredArray(constants.STORAGE_BUS_LINES_KEY);
    const storedDestinations = parseStoredArray(constants.STORAGE_BUS_DESTINATIONS_KEY);
    state.busLineFilters = urlState.linesProvided ? urlState.busLines : storedLines;
    state.busDestinationFilters = urlState.destinationsProvided
      ? urlState.busDestinations
      : storedDestinations;
  }

  function syncStateToStorage() {
    setStorageItem(constants.STORAGE_MODE_KEY, state.mode);
    setStorageItem(constants.STORAGE_HELSINKI_ONLY_KEY, state.helsinkiOnly ? "1" : "0");
    setStorageItem(constants.STORAGE_BUS_STOP_KEY, state.busStopId || "");
    setStorageItem(constants.STORAGE_BUS_LINES_KEY, JSON.stringify(state.busLineFilters));
    setStorageItem(
      constants.STORAGE_BUS_DESTINATIONS_KEY,
      JSON.stringify(state.busDestinationFilters)
    );
  }

  function syncStateToUrl() {
    const params = new URLSearchParams(window.location.search);

    if (state.mode === MODE_RAIL) {
      params.delete("mode");
    } else {
      params.set("mode", state.mode);
    }

    if (state.mode === MODE_RAIL && state.helsinkiOnly) {
      params.set("helsinkiOnly", "1");
    } else {
      params.delete("helsinkiOnly");
    }

    params.delete("stop");
    params.delete("line");
    params.delete("dest");

    if (state.mode === MODE_BUS) {
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
    const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", nextUrl);
  }

  function persistUiState() {
    syncStateToStorage();
    syncStateToUrl();
  }

  Object.assign(api, {
    setLoading,
    setStatus,
    setPermissionRequired,
    setLastUpdated,
    getStorageItem,
    setStorageItem,
    safeString,
    toError,
    reportClientError,
    normalizeMode,
    parseBoolean,
    uniqueNonEmptyStrings,
    parseStoredArray,
    readStateFromUrl,
    hydrateInitialState,
    syncStateToStorage,
    syncStateToUrl,
    persistUiState,
  });
})();
