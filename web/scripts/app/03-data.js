/* Data Loading + Geolocation Flow */
(() => {
  const app = window.HMApp;
  const { api, dom, state, constants } = app;
  const { MODE_BUS } = constants;

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = constants.FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function fetchWithRetryOnce(url, options = {}) {
    let res;

    try {
      res = await fetchWithTimeout(url, options);
    } catch {
      await delay(350);
      return fetchWithTimeout(url, options);
    }

    if (res.status >= 500) {
      await delay(350);
      return fetchWithTimeout(url, options);
    }

    return res;
  }

  function updateBusStateFromResponse(responseData) {
    const stops = Array.isArray(responseData?.stops)
      ? responseData.stops
          .filter((stop) => stop && stop.id && stop.name)
          .map((stop) => ({
            id: stop.id,
            name: stop.name,
            code: String(stop.code || "").trim() || null,
            stopCodes: api.uniqueNonEmptyStrings([
              ...(Array.isArray(stop.stopCodes) ? stop.stopCodes : []),
              stop.code,
            ]),
            distanceMeters: Number(stop.distanceMeters) || 0,
          }))
      : [];

    state.busStops = stops;

    const selectedFromResponse = String(responseData?.selectedStopId || "").trim() || null;
    const stopExists = (id) => stops.some((stop) => stop.id === id);

    if (selectedFromResponse && stopExists(selectedFromResponse)) {
      state.busStopId = selectedFromResponse;
    } else if (!state.busStopId || !stopExists(state.busStopId)) {
      state.busStopId = stops[0]?.id || null;
    }

    const lines = Array.isArray(responseData?.filterOptions?.lines)
      ? responseData.filterOptions.lines
          .filter((item) => item && item.value)
          .map((item) => ({ value: String(item.value), count: Number(item.count) || 0 }))
      : [];

    const destinations = Array.isArray(responseData?.filterOptions?.destinations)
      ? responseData.filterOptions.destinations
          .filter((item) => item && item.value)
          .map((item) => ({ value: String(item.value), count: Number(item.count) || 0 }))
      : [];

    state.busFilterOptions = { lines, destinations };
    api.sanitizeBusSelections();
  }

  async function load(lat, lon) {
    const loadToken = ++state.latestLoadToken;
    const requestMode = state.mode;
    const requestBusStopId = state.busStopId;
    const requestBusLineFilters = [...state.busLineFilters];
    const requestBusDestinationFilters = [...state.busDestinationFilters];

    api.setLoading(true);
    api.setStatus("Loading departures...");

    try {
      const params = new URLSearchParams({
        lat: String(lat),
        lon: String(lon),
        mode: requestMode.toUpperCase(),
        results: String(api.getActiveResultsLimit(requestMode)),
      });

      if (requestMode === MODE_BUS && requestBusStopId) {
        params.set("stopId", requestBusStopId);
        for (const line of requestBusLineFilters) {
          params.append("line", line);
        }
        for (const destination of requestBusDestinationFilters) {
          params.append("dest", destination);
        }
      }

      const res = await fetchWithRetryOnce(`/api/v1/departures?${params.toString()}`);
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        if (!res.ok) {
          throw new Error("Request failed");
        }
        throw new Error("Unexpected server response.");
      }

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Request failed");
      }

      if (loadToken !== state.latestLoadToken) {
        return;
      }

      if (requestMode === MODE_BUS) {
        updateBusStateFromResponse(json);
        api.persistUiState();
      }

      state.latestResponse = json;
      api.render(json);
      api.setPermissionRequired(false);
      api.setLastUpdated(new Date());
      api.setStatus(api.buildStatusFromResponse(json));
    } catch (err) {
      if (loadToken !== state.latestLoadToken) {
        return;
      }

      state.latestResponse = null;
      console.error("load departures error:", err);
      api.reportClientError("load", err, { mode: requestMode });
      api.setStatus(api.getLoadErrorStatus(err));
      dom.resultEl.classList.add("hidden");
      api.updateNextSummary(null);
    } finally {
      if (loadToken === state.latestLoadToken) {
        api.setLoading(false);
      }
    }
  }

  function requestLocationAndLoad() {
    if (!navigator.geolocation) {
      api.setStatus("Geolocation not supported in this browser.");
      api.setPermissionRequired(true);
      return false;
    }

    if (state.isLoading) return false;

    api.setStatus("Getting your location...");
    api.setLoading(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.currentCoords = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        };
        api.setPermissionRequired(false);
        api.setLoading(false);
        load(state.currentCoords.lat, state.currentCoords.lon);
      },
      (err) => {
        api.setLoading(false);
        if (err.code === 1) {
          api.setPermissionRequired(true);
          api.setStatus(api.getGeolocationErrorStatus(err));
          state.latestResponse = null;
          dom.resultEl.classList.add("hidden");
          api.updateNextSummary(null);
          return;
        }

        api.setPermissionRequired(false);
        api.setStatus(api.getGeolocationErrorStatus(err));
        state.latestResponse = null;
        dom.resultEl.classList.add("hidden");
        api.updateNextSummary(null);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
    );

    return true;
  }

  function refreshDeparturesOnly() {
    if (state.currentCoords) {
      load(state.currentCoords.lat, state.currentCoords.lon);
      return;
    }

    requestLocationAndLoad();
  }

  function applyModeUiState() {
    api.updateModeButtons();
    api.updateModeLabels();
    api.renderResultsLimitControl();
    api.updateHelsinkiFilterButton();
    api.renderBusControls();
    api.updateDataScope(state.latestResponse);
  }

  Object.assign(api, {
    delay,
    fetchWithTimeout,
    fetchWithRetryOnce,
    updateBusStateFromResponse,
    load,
    requestLocationAndLoad,
    refreshDeparturesOnly,
    applyModeUiState,
  });
})();
