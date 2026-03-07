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

export function renderModeSelector(options: RenderModeSelectorOptions): void {
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

  const syncButtons = (activeMode: Mode) => {
    for (const [mode, button] of buttons.entries()) {
      const isActive = mode === activeMode;
      button.setAttribute("aria-checked", String(isActive));
      button.classList.toggle("is-active", isActive);
    }
  };

  syncButtons(controller.getActiveMode());
  controller.subscribe((mode) => {
    syncButtons(mode);
  });

  container.appendChild(group);
}
