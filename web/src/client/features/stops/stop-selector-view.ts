import type { AppController } from "@client/app/app-controller";
import type { AppState } from "@client/app/app-store";

interface CreateStopSelectorViewOptions {
  controller: AppController;
  documentRef: Document;
}

export interface StopSelectorView {
  element: HTMLElement;
  sync(state: AppState): void;
}

export function createStopSelectorView(
  options: CreateStopSelectorViewOptions
): StopSelectorView {
  const { controller, documentRef } = options;

  const section = documentRef.createElement("section");
  section.className = "stop-selector";

  const label = documentRef.createElement("label");
  label.className = "stop-selector__label";
  label.htmlFor = "stop-selector";
  label.textContent = "Active stop";

  const select = documentRef.createElement("select");
  select.className = "stop-selector__select";
  select.dataset.stopSelect = "true";
  select.id = "stop-selector";
  select.addEventListener("change", () => {
    void controller.setSelectedStop(select.value || null);
  });

  section.append(label, select);

  return {
    element: section,
    sync(state) {
      section.hidden = state.stops.length === 0;
      select.innerHTML = "";

      for (const stop of state.stops) {
        const option = documentRef.createElement("option");
        option.value = stop.id;
        option.textContent = `${stop.name} · ${stop.distanceMeters}m`;
        option.selected = stop.id === (state.filters.stopId || state.selectedStopId);
        select.appendChild(option);
      }

      select.value = state.filters.stopId || state.selectedStopId || "";
    },
  };
}
