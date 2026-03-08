import { createAppStore, type AppStore, type ThemeMode } from "@client/app/app-store";
import type { AppController } from "@client/app/app-controller";
import {
  readModeFromSearch,
  syncUrlFromState,
  type HistoryLike,
  type LocationLike,
} from "@client/lib/persistence/query-state";
import { renderAppShell } from "@client/app/app-shell";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface BootstrapOptions {
  controller?: AppController;
  documentRef: Document;
  historyRef?: HistoryLike;
  locationRef?: LocationLike;
  root: HTMLElement;
  storage?: StorageLike;
  store?: AppStore;
}

function resolveTheme(storage?: StorageLike): ThemeMode {
  const savedTheme = storage?.getItem("theme");
  return savedTheme === "light" ? "light" : "dark";
}

export function bootstrapApp(options: BootstrapOptions): AppStore {
  const {
    controller,
    documentRef,
    historyRef,
    locationRef,
    root,
    storage,
    store = createAppStore(),
  } = options;
  const theme = resolveTheme(storage);
  documentRef.documentElement.setAttribute("data-theme", theme);
  store.setTheme(theme);
  if (locationRef) {
    store.setMode(readModeFromSearch(locationRef.search));
  }
  const fallbackController: AppController = {
    async chooseVoiceLocation() {},
    getActiveMode() {
      return store.getState().activeMode;
    },
    async refreshNearbyDepartures() {},
    getVoiceAvailability() {
      return store.getState().voice.availability;
    },
    initializeVoice() {
      store.setVoiceAvailability(store.getState().voice.availability);
    },
    setMode(mode) {
      store.setMode(mode);
    },
    async setSelectedStop(stopId) {
      store.setSelectedStop(stopId);
    },
    async startVoiceSearch() {},
    store,
    subscribe(listener) {
      return store.subscribe((state) => {
        listener(state.activeMode);
      });
    },
    async toggleDestinationFilter(destination) {
      store.toggleDestinationFilter(destination);
    },
    async toggleLineFilter(line) {
      store.toggleLineFilter(line);
    },
  };
  renderAppShell({
    controller: controller || fallbackController,
    documentRef,
    root,
    store,
  });
  if (historyRef && locationRef) {
    store.subscribe((state) => {
      syncUrlFromState({
        historyRef,
        locationRef,
        state,
      });
    });
  }
  return store;
}
