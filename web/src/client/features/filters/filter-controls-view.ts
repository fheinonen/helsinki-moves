import type { AppController } from "@client/app/app-controller";
import type { AppState } from "@client/app/app-store";
import { buildFilterSummary } from "@shared/domain/filter";

interface CreateFilterControlsViewOptions {
  controller: AppController;
  documentRef: Document;
}

export interface FilterControlsView {
  element: HTMLElement;
  sync(state: AppState): void;
}

function renderButtons(input: {
  activeValues: string[];
  container: HTMLElement;
  dataAttribute: "lineFilter" | "destinationFilter";
  documentRef: Document;
  onSelect(value: string): void;
  options: Array<{ count: number; value: string }>;
}): void {
  const { activeValues, container, dataAttribute, documentRef, onSelect, options } = input;
  container.innerHTML = "";

  for (const option of options) {
    const button = documentRef.createElement("button");
    button.className = "filter-chip";
    button.dataset[dataAttribute] = option.value;
    button.type = "button";
    button.textContent = `${option.value} · ${option.count}`;
    button.classList.toggle("is-active", activeValues.includes(option.value));
    button.addEventListener("click", () => {
      onSelect(option.value);
    });
    container.appendChild(button);
  }
}

export function createFilterControlsView(
  options: CreateFilterControlsViewOptions
): FilterControlsView {
  const { controller, documentRef } = options;

  const section = documentRef.createElement("section");
  section.className = "filter-controls";

  const summary = documentRef.createElement("p");
  summary.className = "filter-controls__summary";
  summary.dataset.filterSummary = "true";

  const linesLabel = documentRef.createElement("p");
  linesLabel.className = "filter-controls__label";
  linesLabel.textContent = "Lines";

  const lines = documentRef.createElement("div");
  lines.className = "filter-controls__group";

  const destinationsLabel = documentRef.createElement("p");
  destinationsLabel.className = "filter-controls__label";
  destinationsLabel.textContent = "Destinations";

  const destinations = documentRef.createElement("div");
  destinations.className = "filter-controls__group";

  section.append(summary, linesLabel, lines, destinationsLabel, destinations);

  return {
    element: section,
    sync(state) {
      const stopName =
        state.stops.find((stop) => stop.id === state.filters.stopId)?.name ||
        state.station?.stopName ||
        null;
      summary.textContent = buildFilterSummary(state.filters, stopName);

      renderButtons({
        activeValues: state.filters.lines,
        container: lines,
        dataAttribute: "lineFilter",
        documentRef,
        onSelect(value) {
          void controller.toggleLineFilter(value);
        },
        options: state.filterOptions.lines,
      });

      renderButtons({
        activeValues: state.filters.destinations,
        container: destinations,
        dataAttribute: "destinationFilter",
        documentRef,
        onSelect(value) {
          void controller.toggleDestinationFilter(value);
        },
        options: state.filterOptions.destinations,
      });
    },
  };
}
