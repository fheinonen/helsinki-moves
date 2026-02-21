/* Startup + Event Wiring */
(() => {
  const app = window.HMApp;
  const { api, dom, state, constants } = app;
  const { MODE_RAIL, MODE_BUS } = constants;

  function refreshWithCurrentLocationOrRequest() {
    if (state.currentCoords) {
      api.load(state.currentCoords.lat, state.currentCoords.lon);
      return;
    }

    api.requestLocationAndLoad();
  }

  dom.locateBtn?.addEventListener("click", () => {
    api.requestLocationAndLoad();
  });

  dom.modeRailBtn?.addEventListener("click", () => {
    if (state.mode === MODE_RAIL) return;
    state.mode = MODE_RAIL;
    api.applyModeUiState();
    api.persistUiState();
    refreshWithCurrentLocationOrRequest();
  });

  dom.modeBusBtn?.addEventListener("click", () => {
    if (state.mode === MODE_BUS) return;
    state.mode = MODE_BUS;
    state.helsinkiOnly = false;
    api.applyModeUiState();
    api.persistUiState();
    refreshWithCurrentLocationOrRequest();
  });

  dom.busStopSelectEl?.addEventListener("change", () => {
    if (state.suppressBusStopChange || state.mode !== MODE_BUS) return;

    const nextStopId = String(dom.busStopSelectEl.value || "").trim();
    if (!nextStopId || nextStopId === state.busStopId) return;

    state.busStopId = nextStopId;
    api.persistUiState();

    if (state.currentCoords) {
      api.load(state.currentCoords.lat, state.currentCoords.lon);
    }
  });

  dom.helsinkiOnlyBtn?.addEventListener("click", () => {
    if (state.mode !== MODE_RAIL) return;
    state.helsinkiOnly = !state.helsinkiOnly;
    api.persistUiState();
    api.updateHelsinkiFilterButton();

    if (state.latestResponse) {
      api.render(state.latestResponse);
      api.setStatus(api.buildStatusFromResponse(state.latestResponse));
    }
  });

  api.hydrateInitialState();
  api.persistUiState();
  api.applyModeUiState();
  api.updateClock();
  setInterval(api.updateClock, 1000);
  api.requestLocationAndLoad();
  setInterval(api.refreshDeparturesOnly, 30000);

  window.addEventListener("resize", () => {
    requestAnimationFrame(api.alignDepartureColumns);
  });

  window.addEventListener("error", (event) => {
    api.reportClientError("error", event.error || event.message || "Unknown error", {
      source: event.filename || "",
      line: event.lineno || null,
      column: event.colno || null,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    api.reportClientError("unhandledrejection", event.reason || "Unhandled promise rejection");
  });

  /* ─── Theme Toggle ─── */
  (() => {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;

    const root = document.documentElement;
    const darkSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const getStoredTheme = () => {
      const value = api.getStorageItem("theme");
      return value === "dark" || value === "light" ? value : null;
    };

    const applyEffectiveTheme = (theme) => {
      root.setAttribute("data-theme", theme === "light" ? "light" : "dark");
    };

    const applyCurrentTheme = () => {
      const storedTheme = getStoredTheme();
      if (storedTheme) {
        applyEffectiveTheme(storedTheme);
        return;
      }

      applyEffectiveTheme(darkSchemeQuery.matches ? "dark" : "light");
    };

    const handleSystemThemeChange = (event) => {
      if (getStoredTheme()) return;
      applyEffectiveTheme(event.matches ? "dark" : "light");
    };

    applyCurrentTheme();

    if (typeof darkSchemeQuery.addEventListener === "function") {
      darkSchemeQuery.addEventListener("change", handleSystemThemeChange);
    } else if (typeof darkSchemeQuery.addListener === "function") {
      darkSchemeQuery.addListener(handleSystemThemeChange);
    }

    btn.addEventListener("click", () => {
      const nextTheme = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyEffectiveTheme(nextTheme);
      api.setStorageItem("theme", nextTheme);
    });
  })();
})();
