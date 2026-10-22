import type { AppStore, ThemeMode } from "@client/app/app-store";
import type { AppController } from "@client/app/app-controller";
import {
  readLineAndDestinationFilters,
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
  controller: AppController;
  documentRef: Document;
  historyRef?: HistoryLike;
  locationRef?: LocationLike;
  root: HTMLElement;
  storage?: StorageLike;
}

function resolveTheme(storage?: StorageLike): ThemeMode {
  const savedTheme = storage?.getItem("theme");
  return savedTheme === "light" ? "light" : "dark";
}

export function bootstrapApp(options: BootstrapOptions): AppStore {
  const { controller, documentRef, historyRef, locationRef, root, storage } = options;
  const store = controller.store;
  const theme = resolveTheme(storage);
  documentRef.documentElement.setAttribute("data-theme", theme);
  store.setTheme(theme);
  if (locationRef) {
    const search = locationRef.search;
    store.setMode(readModeFromSearch(search));
    const selections = readLineAndDestinationFilters(search);
    store.setLineAndDestinationFilters(selections.lines, selections.destinations);
  }
  renderAppShell({
    controller,
    documentRef,
    root,
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
