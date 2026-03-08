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

interface FilterButtonGroupRenderer {
  sync(activeValues: string[], options: Array<{ count: number; value: string }>): void;
}

function resolveSelectedStopName(state: AppState): string | null {
  return (
    state.stops.find((stop) => stop.id === state.filters.stopId)?.name ||
    state.station?.stopName ||
    null
  );
}

function buildFilterGroupSignature(
  activeValues: string[],
  options: Array<{ count: number; value: string }>
): string {
  const activeValueSet = new Set(activeValues);
  return options
    .map((option) => `${option.value}:${option.count}:${activeValueSet.has(option.value) ? "1" : "0"}`)
    .join("\u001f");
}

function createButtonGroupRenderer(input: {
  container: HTMLElement;
  dataAttribute: "lineFilter" | "destinationFilter";
  documentRef: Document;
  onSelect(value: string): void;
}): FilterButtonGroupRenderer {
  const { container, dataAttribute, documentRef, onSelect } = input;
  const buttonsByValue = new Map<string, HTMLButtonElement>();
  let previousSignature = "";

  return {
    sync(activeValues, options) {
      const signature = buildFilterGroupSignature(activeValues, options);
      if (signature === previousSignature) {
        return;
      }
      previousSignature = signature;

      const activeValueSet = new Set(activeValues);
      const renderedValues = new Set<string>();

      for (const option of options) {
        let button = buttonsByValue.get(option.value);
        if (!button) {
          button = documentRef.createElement("button");
          button.className = "filter-chip";
          button.type = "button";
          button.addEventListener("click", () => {
            onSelect(option.value);
          });
          buttonsByValue.set(option.value, button);
        }

        button.dataset[dataAttribute] = option.value;
        button.textContent = `${option.value} (${option.count})`;
        button.classList.toggle("is-active", activeValueSet.has(option.value));
        container.appendChild(button);
        renderedValues.add(option.value);
      }

      for (const [value, button] of buttonsByValue.entries()) {
        if (renderedValues.has(value)) {
          continue;
        }
        button.remove();
        buttonsByValue.delete(value);
      }
    },
  };
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
  const lineButtons = createButtonGroupRenderer({
    container: lines,
    dataAttribute: "lineFilter",
    documentRef,
    onSelect(value) {
      void controller.toggleLineFilter(value);
    },
  });
  const destinationButtons = createButtonGroupRenderer({
    container: destinations,
    dataAttribute: "destinationFilter",
    documentRef,
    onSelect(value) {
      void controller.toggleDestinationFilter(value);
    },
  });
  let previousSummary = "";

  return {
    element: section,
    sync(state) {
      const nextSummary = buildFilterSummary(state.filters, resolveSelectedStopName(state));
      if (nextSummary !== previousSummary) {
        summary.textContent = nextSummary;
        previousSummary = nextSummary;
      }

      lineButtons.sync(state.filters.lines, state.filterOptions.lines);
      destinationButtons.sync(state.filters.destinations, state.filterOptions.destinations);
    },
  };
}
