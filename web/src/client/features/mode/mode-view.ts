import type { Mode } from "@shared/domain/mode";
import { MODES } from "@shared/domain/mode";

export interface ModeController {
  getActiveMode(): Mode;
  setMode(mode: Mode): void;
  subscribe(listener: (mode: Mode) => void): () => void;
}

interface RenderModeSelectorOptions {
  container: HTMLElement;
  controller: ModeController;
  documentRef: Document;
}

export function renderModeSelector(options: RenderModeSelectorOptions): () => void {
  const { container, controller, documentRef } = options;
  const group = documentRef.createElement("div");
  group.className = "mode-selector";
  group.setAttribute("aria-label", "Transport mode");
  group.setAttribute("role", "radiogroup");

  const buttons = new Map<Mode, HTMLButtonElement>();

  for (const mode of MODES) {
    const button = documentRef.createElement("button");
    button.className = "mode-selector__button";
    button.type = "button";
    button.dataset.mode = mode;
    button.setAttribute("role", "radio");
    button.textContent = mode;
    button.addEventListener("click", () => {
      controller.setMode(mode);
    });
    buttons.set(mode, button);
    group.appendChild(button);
  }

  const modeList = [...buttons.keys()];

  const syncButtons = (activeMode: Mode) => {
    for (const [mode, button] of buttons.entries()) {
      const isActive = mode === activeMode;
      button.setAttribute("aria-checked", String(isActive));
      button.setAttribute("tabindex", isActive ? "0" : "-1");
      button.classList.toggle("is-active", isActive);
    }
  };

  group.addEventListener("keydown", (event) => {
    const activeMode = controller.getActiveMode();
    const currentIndex = modeList.indexOf(activeMode);
    let nextIndex = -1;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % modeList.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + modeList.length) % modeList.length;
    }

    if (nextIndex >= 0) {
      event.preventDefault();
      const nextMode = modeList[nextIndex];
      controller.setMode(nextMode);
      buttons.get(nextMode)?.focus();
    }
  });

  syncButtons(controller.getActiveMode());
  const unsubscribe = controller.subscribe((mode) => {
    syncButtons(mode);
  });

  container.appendChild(group);
  return unsubscribe;
}
