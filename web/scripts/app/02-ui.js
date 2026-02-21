/* UI Rendering + Presentation Helpers */
(() => {
  const app = window.HMApp;
  const { api, dom, state, constants } = app;
  const { MODE_RAIL, MODE_BUS } = constants;

  function formatMinutes(iso) {
    const diffMin = minutesUntil(iso);
    if (diffMin <= 0) return "Now";
    return `${diffMin}m`;
  }

  function minutesUntil(iso) {
    const departure = new Date(iso);
    return Math.floor((departure.getTime() - Date.now()) / 60000);
  }

  function departureRowClass(iso) {
    const diffMin = minutesUntil(iso);

    if (diffMin <= 0 || diffMin < 5) return "departure-now";
    if (diffMin <= 15) return "departure-soon";
    return "departure-later";
  }

  function isHelsinkiBound(departure) {
    const destination = departure?.destination || "";
    return /\bhelsinki\b/i.test(destination);
  }

  function sanitizeBusSelections() {
    const allowedLines = new Set((state.busFilterOptions.lines || []).map((option) => option.value));
    const allowedDestinations = new Set(
      (state.busFilterOptions.destinations || []).map((option) => option.value)
    );

    state.busLineFilters = state.busLineFilters.filter((value) => allowedLines.has(value));
    state.busDestinationFilters = state.busDestinationFilters.filter((value) =>
      allowedDestinations.has(value)
    );
  }

  function getVisibleDepartures(departures) {
    if (!Array.isArray(departures)) return [];

    if (state.mode === MODE_RAIL) {
      if (!state.helsinkiOnly) return departures;
      return departures.filter(isHelsinkiBound);
    }

    // BUS filtering is applied server-side via query params.
    return departures;
  }

  function updateModeButtons() {
    if (dom.modeRailBtn) {
      const railActive = state.mode === MODE_RAIL;
      dom.modeRailBtn.setAttribute("aria-pressed", String(railActive));
      dom.modeRailBtn.classList.toggle("is-active", railActive);
    }

    if (dom.modeBusBtn) {
      const busActive = state.mode === MODE_BUS;
      dom.modeBusBtn.setAttribute("aria-pressed", String(busActive));
      dom.modeBusBtn.classList.toggle("is-active", busActive);
    }
  }

  function updateModeLabels() {
    if (dom.modeEyebrowEl) {
      dom.modeEyebrowEl.textContent =
        state.mode === MODE_BUS ? "Helsinki Moves • Bus" : "Helsinki Moves • Rail";
    }

    if (dom.nextLabelEl) {
      dom.nextLabelEl.textContent = state.mode === MODE_BUS ? "Next Bus" : "Next Train";
    }
  }

  function renderResultsLimitControl() {
    if (!dom.resultsLimitSelectEl) return;

    const options = Array.isArray(constants.RESULT_LIMIT_OPTIONS)
      ? constants.RESULT_LIMIT_OPTIONS
      : [];
    const activeValue = api.getActiveResultsLimit();
    dom.resultsLimitSelectEl.innerHTML = "";

    for (const value of options) {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = `${value}`;
      dom.resultsLimitSelectEl.appendChild(option);
    }

    dom.resultsLimitSelectEl.value = String(activeValue);
  }

  function updateHelsinkiFilterButton() {
    if (!dom.helsinkiOnlyBtn) return;

    if (state.mode !== MODE_RAIL) {
      dom.helsinkiOnlyBtn.setAttribute("aria-pressed", "false");
      dom.helsinkiOnlyBtn.classList.remove("is-active");
      dom.helsinkiOnlyBtn.disabled = true;
      dom.helsinkiOnlyBtn.textContent = "Helsinki Only (Rail)";
      return;
    }

    dom.helsinkiOnlyBtn.disabled = false;
    dom.helsinkiOnlyBtn.setAttribute("aria-pressed", String(state.helsinkiOnly));
    dom.helsinkiOnlyBtn.classList.toggle("is-active", state.helsinkiOnly);
    dom.helsinkiOnlyBtn.textContent = state.helsinkiOnly ? "Helsinki Only: On" : "Helsinki Only: Off";
  }

  function setBusControlsVisibility(visible) {
    if (!dom.busControlsEl) return;
    dom.busControlsEl.classList.toggle("hidden", !visible);
  }

  function getBusStopMeta(stopId) {
    return state.busStops.find((stop) => stop.id === stopId) || null;
  }

  function getBusStopCodes(stop) {
    const stopCodes = api.uniqueNonEmptyStrings([
      ...(Array.isArray(stop?.stopCodes) ? stop.stopCodes : []),
      stop?.code,
    ]);

    if (stopCodes.length === 0 && stop?.id) {
      stopCodes.push(String(stop.id));
    }

    return stopCodes;
  }

  function buildBusStopDisplay(station, departure = null) {
    const selectedStop = getBusStopMeta(state.busStopId);
    const stopName = String(departure?.stopName || station?.stopName || selectedStop?.name || "").trim();
    const stopCodes = api.uniqueNonEmptyStrings([
      departure?.stopCode,
      ...(Array.isArray(station?.stopCodes) ? station.stopCodes : []),
      station?.stopCode,
      ...getBusStopCodes(selectedStop),
    ]);
    const primaryCode = stopCodes[0] || "";

    if (stopName && primaryCode) return `${stopName} ${primaryCode}`;
    if (stopName) return stopName;
    if (primaryCode) return primaryCode;
    return "—";
  }

  function updateDataScope(data) {
    if (!dom.dataScopeEl) return;

    if (state.mode !== MODE_BUS) {
      dom.dataScopeEl.classList.add("hidden");
      dom.dataScopeEl.textContent = "";
      return;
    }

    const stopName = String(data?.station?.stopName || getBusStopMeta(state.busStopId)?.name || "").trim();
    const selectedStopCodes = api.uniqueNonEmptyStrings([
      ...(Array.isArray(data?.station?.stopCodes) ? data.station.stopCodes : []),
      data?.station?.stopCode,
      ...getBusStopCodes(getBusStopMeta(state.busStopId)),
    ]);
    const stopIdsScope = selectedStopCodes.join(", ");
    const lineScope =
      state.busLineFilters.length === 0
        ? "all lines"
        : `${state.busLineFilters.length} line${state.busLineFilters.length === 1 ? "" : "s"} selected`;
    const destinationScope =
      state.busDestinationFilters.length === 0
        ? "all destinations"
        : `${state.busDestinationFilters.length} destination${state.busDestinationFilters.length === 1 ? "" : "s"} selected`;
    const resultScope = `${api.getActiveResultsLimit()} results`;

    if (!stopName) {
      dom.dataScopeEl.textContent = `Selecting stop... (${lineScope}, ${destinationScope}, ${resultScope})`;
    } else {
      dom.dataScopeEl.textContent = `Selected stop ${stopName} (${stopIdsScope || "—"}) - ${lineScope}, ${destinationScope}, ${resultScope}`;
    }

    dom.dataScopeEl.classList.remove("hidden");
  }

  function renderFilterButtons(container, options, activeValues, onToggle) {
    if (!container) return;
    container.innerHTML = "";

    if (!Array.isArray(options) || options.length === 0) {
      const empty = document.createElement("span");
      empty.className = "chip-empty";
      empty.textContent = "No options";
      container.appendChild(empty);
      return;
    }

    const activeSet = new Set(activeValues);
    for (const option of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip-toggle";
      if (activeSet.has(option.value)) {
        button.classList.add("is-active");
        button.setAttribute("aria-pressed", "true");
      } else {
        button.setAttribute("aria-pressed", "false");
      }

      button.textContent = `${option.value} (${option.count})`;
      button.addEventListener("click", () => onToggle(option.value));
      container.appendChild(button);
    }
  }

  function renderBusControls() {
    const visible = state.mode === MODE_BUS;
    setBusControlsVisibility(visible);
    if (!visible) return;

    if (dom.busStopSelectEl) {
      state.suppressBusStopChange = true;
      dom.busStopSelectEl.innerHTML = "";

      if (state.busStops.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "No nearby bus stops";
        dom.busStopSelectEl.appendChild(option);
        dom.busStopSelectEl.disabled = true;
      } else {
        dom.busStopSelectEl.disabled = false;
        for (const stop of state.busStops) {
          const option = document.createElement("option");
          option.value = stop.id;
          option.textContent = `${stop.name} (${stop.distanceMeters}m)`;
          dom.busStopSelectEl.appendChild(option);
        }

        if (state.busStopId && state.busStops.some((stop) => stop.id === state.busStopId)) {
          dom.busStopSelectEl.value = state.busStopId;
        } else {
          dom.busStopSelectEl.value = state.busStops[0].id;
        }
      }

      state.suppressBusStopChange = false;
    }

    renderFilterButtons(
      dom.busLineFiltersEl,
      state.busFilterOptions.lines,
      state.busLineFilters,
      (value) => {
        if (state.busLineFilters.includes(value)) {
          state.busLineFilters = state.busLineFilters.filter((item) => item !== value);
        } else {
          state.busLineFilters = [...state.busLineFilters, value];
        }

        api.persistUiState();
        api.refreshDeparturesOnly?.();
      }
    );

    renderFilterButtons(
      dom.busDestinationFiltersEl,
      state.busFilterOptions.destinations,
      state.busDestinationFilters,
      (value) => {
        if (state.busDestinationFilters.includes(value)) {
          state.busDestinationFilters = state.busDestinationFilters.filter((item) => item !== value);
        } else {
          state.busDestinationFilters = [...state.busDestinationFilters, value];
        }

        api.persistUiState();
        api.refreshDeparturesOnly?.();
      }
    );
  }

  function updateNextSummary(nextDeparture, station = null) {
    if (!dom.nextSummaryEl || !dom.nextMinsEl || !dom.nextLineEl || !dom.nextTrackEl || !dom.nextDestinationEl) {
      return;
    }

    if (!nextDeparture) {
      dom.nextSummaryEl.classList.add("hidden");
      dom.nextSummaryEl.classList.remove("next-summary-now", "next-summary-soon", "next-summary-later");
      return;
    }

    const diffMin = minutesUntil(nextDeparture.departureIso);

    dom.nextMinsEl.textContent = formatMinutes(nextDeparture.departureIso);
    dom.nextLineEl.textContent = nextDeparture.line || "—";
    dom.nextLineEl.classList.toggle("next-letter-now", diffMin < 5);
    dom.nextTrackEl.textContent =
      state.mode === MODE_BUS
        ? `Stop ${buildBusStopDisplay(station, nextDeparture)}`
        : nextDeparture.track
          ? `Track ${nextDeparture.track}`
          : "Track —";
    dom.nextDestinationEl.textContent = nextDeparture.destination || "—";
    dom.nextSummaryEl.classList.remove("next-summary-now", "next-summary-soon", "next-summary-later");
    if (diffMin < 5) {
      dom.nextSummaryEl.classList.add("next-summary-now");
    } else if (diffMin <= 15) {
      dom.nextSummaryEl.classList.add("next-summary-soon");
    } else {
      dom.nextSummaryEl.classList.add("next-summary-later");
    }
    dom.nextSummaryEl.classList.remove("hidden");
  }

  function buildStatusFromResponse(data) {
    if (!data || !data.station) {
      if (state.mode === MODE_BUS) {
        return data?.message || "No nearby bus stops found.";
      }

      return data?.message || "No nearby train stations found.";
    }

    const visibleDepartures = getVisibleDepartures(data.station.departures);
    const next = visibleDepartures[0];
    if (!next) {
      if (state.mode === MODE_BUS) {
        if (state.busLineFilters.length > 0 || state.busDestinationFilters.length > 0) {
          return "No upcoming buses match selected filters.";
        }
        return "No upcoming buses right now.";
      }

      return state.helsinkiOnly
        ? "No Helsinki-bound trains in upcoming departures."
        : "No upcoming commuter trains right now.";
    }

    const destination = next.destination ? ` • ${next.destination}` : "";
    const nextTrack =
      state.mode === MODE_RAIL
        ? next.track
          ? ` • Track ${next.track}`
          : ""
        : data.station.stopName || data.station.stopCode
          ? ` • ${buildBusStopDisplay(data.station)}`
          : "";
    const serviceName = state.mode === MODE_BUS ? "bus" : "train";
    return `Next ${next.line || serviceName} in ${formatMinutes(next.departureIso)}${destination}${nextTrack}`;
  }

  function getLoadErrorStatus(error) {
    if (!(error instanceof Error)) {
      return "Could not refresh departures. Please try again.";
    }

    if (error.name === "AbortError") {
      return "Request timed out. Please try again.";
    }

    const message = (error.message || "").trim();
    if (message === "Temporary server error. Please try again.") {
      return message;
    }
    if (message === "Invalid lat/lon") {
      return "Location coordinates were invalid. Please refresh your location.";
    }
    if (message === "Invalid mode") {
      return "Unsupported transport mode.";
    }

    return "Could not refresh departures. Please try again.";
  }

  function getGeolocationErrorStatus(error) {
    if (error?.code === 1) return "Location permission denied.";
    if (error?.code === 2) return "Location unavailable. Please try again.";
    if (error?.code === 3) return "Location request timed out. Please try again.";
    return "Unable to get your location.";
  }

  function alignDepartureColumns() {
    const rows = [...document.querySelectorAll(".departure-row .train-top")];
    if (rows.length === 0) return;

    const destinations = rows.map((row) => row.querySelector(".destination")).filter(Boolean);

    for (const destination of destinations) {
      destination.style.width = "auto";
    }

    let widestDestination = 0;
    for (const destination of destinations) {
      widestDestination = Math.max(widestDestination, Math.ceil(destination.scrollWidth));
    }

    let maxAllowed = Number.POSITIVE_INFINITY;
    for (const row of rows) {
      const time = row.querySelector(".time");
      if (!time) continue;

      const rowStyle = getComputedStyle(row);
      const gap = parseFloat(rowStyle.columnGap || rowStyle.gap || "0") || 0;
      const available = row.clientWidth - time.offsetWidth - gap;
      if (available > 0) {
        maxAllowed = Math.min(maxAllowed, available);
      }
    }

    const targetWidth = Math.max(0, Math.min(widestDestination, maxAllowed));
    for (const destination of destinations) {
      destination.style.width = `${targetWidth}px`;
    }
  }

  function render(data) {
    renderBusControls();
    updateDataScope(data);

    if (!data || !data.station) {
      dom.resultEl.classList.add("hidden");
      updateNextSummary(null);
      return;
    }

    const station = data.station;
    dom.resultEl.classList.remove("hidden");

    dom.stationTitleEl.textContent = station.stopName;
    dom.stationMetaEl.textContent = `${station.distanceMeters}m away`;

    dom.departuresEl.innerHTML = "";
    const visibleDepartures = getVisibleDepartures(station.departures);

    if (visibleDepartures.length === 0) {
      updateNextSummary(null);
      const li = document.createElement("li");
      li.className = "empty-row";
      if (state.mode === MODE_BUS) {
        li.textContent =
          state.busLineFilters.length > 0 || state.busDestinationFilters.length > 0
            ? "No upcoming buses match selected filters."
            : "No upcoming buses right now.";
      } else {
        li.textContent = state.helsinkiOnly
          ? "No Helsinki-bound trains in upcoming departures."
          : "No upcoming commuter trains right now.";
      }
      dom.departuresEl.appendChild(li);
      return;
    }

    updateNextSummary(visibleDepartures[0], station);
    const listDepartures = visibleDepartures.slice(1);

    if (listDepartures.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-row";
      li.textContent =
        state.mode === MODE_BUS
          ? "No additional upcoming buses right now."
          : "No additional upcoming commuter trains right now.";
      dom.departuresEl.appendChild(li);
      return;
    }

    for (let i = 0; i < listDepartures.length; i++) {
      const item = listDepartures[i];
      const li = document.createElement("li");
      li.className = `departure-row ${departureRowClass(item.departureIso)}`;
      li.style.setProperty("--i", i);

      const letterBadge = document.createElement("div");
      letterBadge.className = "letter-badge";
      letterBadge.textContent = item.line || "?";

      const left = document.createElement("div");
      left.className = "train";

      const top = document.createElement("div");
      top.className = "train-top";

      const destination = document.createElement("div");
      destination.className = "destination";
      destination.textContent = item.destination || "—";
      top.appendChild(destination);

      const time = document.createElement("div");
      time.className = "time";
      const remaining = document.createElement("span");
      remaining.className = "remaining";
      remaining.textContent = formatMinutes(item.departureIso);

      const clockTime = document.createElement("span");
      clockTime.className = "clock-time";
      clockTime.textContent = new Date(item.departureIso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      time.appendChild(remaining);
      time.appendChild(clockTime);
      top.appendChild(time);
      left.appendChild(top);

      const track = document.createElement("span");
      track.className = "track";
      if (state.mode === MODE_BUS) {
        track.textContent = `Stop ${buildBusStopDisplay(station, item)}`;
      } else {
        track.textContent = item.track ? `Track ${item.track}` : "Track —";
      }
      left.appendChild(track);

      li.appendChild(letterBadge);
      li.appendChild(left);
      dom.departuresEl.appendChild(li);
    }

    requestAnimationFrame(alignDepartureColumns);
  }

  function updateClock() {
    if (!dom.nowClockEl) return;
    dom.nowClockEl.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }

  Object.assign(api, {
    formatMinutes,
    minutesUntil,
    departureRowClass,
    isHelsinkiBound,
    sanitizeBusSelections,
    getVisibleDepartures,
    updateModeButtons,
    updateModeLabels,
    renderResultsLimitControl,
    updateHelsinkiFilterButton,
    setBusControlsVisibility,
    getBusStopMeta,
    getBusStopCodes,
    buildBusStopDisplay,
    updateDataScope,
    renderFilterButtons,
    renderBusControls,
    updateNextSummary,
    buildStatusFromResponse,
    getLoadErrorStatus,
    getGeolocationErrorStatus,
    alignDepartureColumns,
    render,
    updateClock,
  });
})();
