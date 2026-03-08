import type { AppController } from "@client/app/app-controller";
import type { AppState } from "@client/app/app-store";

interface CreateStopSelectorViewOptions {
  controller: AppController;
  documentRef: Document;
}

export interface StopSelectorView {
  cleanup(): void;
  element: HTMLElement;
  sync(state: AppState): void;
}

interface StopSelectorIds {
  labelId: string;
  menuId: string;
  triggerId: string;
  valueId: string;
}

let nextStopSelectorId = 0;

function buildStopOptionsSignature(state: AppState): string {
  return state.stops
    .map((stop) => `${stop.id}:${stop.name}:${stop.distanceMeters}`)
    .join("\u001f");
}

function getSelectedStopId(state: AppState): string {
  return state.filters.stopId || state.selectedStopId || "";
}

function createStopSelectorIds(): StopSelectorIds {
  const id = nextStopSelectorId;
  nextStopSelectorId += 1;
  return {
    labelId: `stop-selector-label-${id}`,
    menuId: `stop-selector-menu-${id}`,
    triggerId: `stop-selector-${id}`,
    valueId: `stop-selector-value-${id}`,
  };
}

function formatStopLabel(stop: AppState["stops"][number]): string {
  return `${stop.name} (${stop.distanceMeters} m)`;
}

function getMenuOptions(menu: HTMLElement): HTMLButtonElement[] {
  return Array.from(menu.querySelectorAll<HTMLButtonElement>("[data-stop-option]"));
}

function setMenuOpen(input: {
  menu: HTMLElement;
  trigger: HTMLButtonElement;
  isOpen: boolean;
}): void {
  input.menu.hidden = !input.isOpen;
  input.trigger.setAttribute("aria-expanded", String(input.isOpen));
  if (input.isOpen) {
    const selected = input.menu.querySelector<HTMLButtonElement>(".is-selected");
    (selected || getMenuOptions(input.menu)[0])?.focus();
  }
}

function moveFocus(menu: HTMLElement, direction: 1 | -1): void {
  const options = getMenuOptions(menu);
  if (options.length === 0) {
    return;
  }
  const active = menu.ownerDocument.activeElement;
  const currentIndex = options.indexOf(active as HTMLButtonElement);
  const nextIndex = (currentIndex + direction + options.length) % options.length;
  options[nextIndex].focus();
}

function reconcileStopOptions(input: {
  buttonsById: Map<string, HTMLButtonElement>;
  documentRef: Document;
  menu: HTMLElement;
  onSelect(stopId: string): void;
  state: AppState;
}): void {
  const { buttonsById, documentRef, menu, onSelect, state } = input;
  const selectedStopId = getSelectedStopId(state);
  const visibleOptionIds = new Set<string>();

  for (const stop of state.stops) {
    let button = buttonsById.get(stop.id);
    if (!button) {
      button = documentRef.createElement("button");
      button.className = "stop-selector__option";
      button.type = "button";
      button.dataset.stopOption = stop.id;
      button.setAttribute("role", "option");
      button.addEventListener("click", () => {
        onSelect(stop.id);
      });
      buttonsById.set(stop.id, button);
    }
    button.textContent = formatStopLabel(stop);
    button.classList.toggle("is-selected", stop.id === selectedStopId);
    button.setAttribute("aria-selected", String(stop.id === selectedStopId));
    menu.appendChild(button);
    visibleOptionIds.add(stop.id);
  }

  for (const [stopId, button] of buttonsById.entries()) {
    if (visibleOptionIds.has(stopId)) {
      continue;
    }
    button.remove();
    buttonsById.delete(stopId);
  }
}

function resolveSelectedStop(state: AppState, selectedStopId: string) {
  return state.stops.find((stop) => stop.id === selectedStopId) || state.stops[0] || null;
}

export function createStopSelectorView(
  options: CreateStopSelectorViewOptions
): StopSelectorView {
  const { controller, documentRef } = options;
  const ids = createStopSelectorIds();

  const section = documentRef.createElement("section");
  section.className = "stop-selector";

  const label = documentRef.createElement("p");
  label.className = "stop-selector__label";
  label.id = ids.labelId;
  label.textContent = "Active stop";

  const field = documentRef.createElement("div");
  field.className = "stop-selector__field";

  const trigger = documentRef.createElement("button");
  trigger.className = "stop-selector__select stop-selector__trigger";
  trigger.dataset.stopSelect = "true";
  trigger.id = ids.triggerId;
  trigger.type = "button";
  trigger.setAttribute("aria-controls", ids.menuId);
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-labelledby", `${ids.labelId} ${ids.valueId}`);

  const value = documentRef.createElement("span");
  value.className = "stop-selector__value";
  value.id = ids.valueId;
  trigger.appendChild(value);
  trigger.addEventListener("click", () => {
    setMenuOpen({
      isOpen: trigger.getAttribute("aria-expanded") !== "true",
      menu,
      trigger,
    });
  });

  const menu = documentRef.createElement("div");
  menu.className = "stop-selector__menu";
  menu.dataset.stopMenu = "true";
  menu.id = ids.menuId;
  menu.setAttribute("role", "listbox");
  menu.hidden = true;

  menu.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(menu, 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(menu, -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      getMenuOptions(menu)[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      const options = getMenuOptions(menu);
      options[options.length - 1]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setMenuOpen({ isOpen: false, menu, trigger });
      trigger.focus();
    }
  });

  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setMenuOpen({ isOpen: true, menu, trigger });
    }
  });

  const handleDocumentClick = (event: Event) => {
    if (menu.hidden) {
      return;
    }
    const target = event.target;
    if (target instanceof Node && !field.contains(target)) {
      setMenuOpen({ isOpen: false, menu, trigger });
    }
  };
  documentRef.addEventListener("click", handleDocumentClick);

  const caret = documentRef.createElement("span");
  caret.className = "stop-selector__caret";
  caret.setAttribute("aria-hidden", "true");
  caret.textContent = "\u2304";

  field.append(trigger, caret, menu);
  section.append(label, field);
  const buttonsById = new Map<string, HTMLButtonElement>();
  let previousSignature = "";
  let previousSelectedStopId = "";

  return {
    cleanup() {
      documentRef.removeEventListener("click", handleDocumentClick);
    },
    element: section,
    sync(state) {
      section.hidden = state.stops.length === 0;
      const nextSignature = buildStopOptionsSignature(state);
      const selectedStopId = getSelectedStopId(state);
      const optionsChanged = nextSignature !== previousSignature;
      const selectionChanged = selectedStopId !== previousSelectedStopId;
      if (optionsChanged) {
        reconcileStopOptions({
          buttonsById,
          documentRef,
          menu,
          onSelect(stopId) {
            setMenuOpen({ isOpen: false, menu, trigger });
            void controller.setSelectedStop(stopId);
          },
          state,
        });
        previousSignature = nextSignature;
      }
      if (optionsChanged || selectionChanged) {
        const selectedStop = resolveSelectedStop(state, selectedStopId);
        value.textContent = selectedStop ? formatStopLabel(selectedStop) : "";
        trigger.dataset.selectedStopId = selectedStop?.id || "";
        if (selectionChanged) {
          setMenuOpen({ isOpen: false, menu, trigger });
        }
        previousSelectedStopId = selectedStopId;
      }
      if (state.stops.length === 0) {
        setMenuOpen({ isOpen: false, menu, trigger });
      }
    },
  };
}
