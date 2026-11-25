import type { AppView } from "@shared/domain/ride";

const SVG_NS = "http://www.w3.org/2000/svg";
const DRAG_THRESHOLD_PX = 8;

const WAIT_ICON_PATH = "M12 6.5v5.5l3.5 2M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Z";
const RIDE_ICON_PATH = "M5.5 16.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm13-5a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM7.5 14.5h3.5a2 2 0 0 0 2-2v-1a2 2 0 0 1 2-2h1.5";

export interface LiquidGlassSwitchSync {
  readonly activeView: AppView;
  readonly hasActiveRide: boolean;
  readonly rideColor: string | null;
}

export interface LiquidGlassSwitchView {
  cleanup(): void;
  element: HTMLElement;
  sync(state: LiquidGlassSwitchSync): void;
}

interface CreateLiquidGlassSwitchInput {
  documentRef: Document;
  onSelect(view: AppView): void;
}

interface ScrubSession {
  active: boolean;
  pointerId: number;
  progress: number;
  startX: number;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function progressForView(view: AppView): number {
  return view === "ride" ? 1 : 0;
}

function createTabIcon(documentRef: Document, path: string): SVGSVGElement {
  const svg = documentRef.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "glass-dock__icon");
  svg.setAttribute("fill", "none");
  svg.setAttribute("viewBox", "0 0 24 24");

  const shape = documentRef.createElementNS(SVG_NS, "path");
  shape.setAttribute("d", path);
  shape.setAttribute("stroke", "currentColor");
  shape.setAttribute("stroke-linecap", "round");
  shape.setAttribute("stroke-linejoin", "round");
  shape.setAttribute("stroke-width", "1.8");
  svg.appendChild(shape);
  return svg;
}

function createTabButton(input: {
  documentRef: Document;
  iconPath: string;
  label: string;
  view: AppView;
}): HTMLButtonElement {
  const button = input.documentRef.createElement("button");
  button.className = "glass-dock__tab";
  button.dataset.viewTab = input.view;
  button.type = "button";
  button.setAttribute("role", "tab");
  button.setAttribute("aria-controls", `view-panel-${input.view}`);

  const text = input.documentRef.createElement("span");
  text.className = "glass-dock__label";
  text.textContent = input.label;

  button.append(createTabIcon(input.documentRef, input.iconPath), text);
  return button;
}

function computeScrubProgress(capsule: HTMLElement, clientX: number): number {
  const rect = capsule.getBoundingClientRect();
  if (rect.width <= 0) {
    return 0;
  }
  const half = rect.width / 2;
  return clampUnit((clientX - rect.left - half / 2) / half);
}

function nextKeyboardView(key: string): AppView | null {
  if (key === "ArrowLeft" || key === "Home") {
    return "wait";
  }
  if (key === "ArrowRight" || key === "End") {
    return "ride";
  }
  return null;
}

export function createLiquidGlassSwitch(
  input: CreateLiquidGlassSwitchInput,
): LiquidGlassSwitchView {
  const { documentRef, onSelect } = input;
  const nav = documentRef.createElement("nav");
  nav.className = "glass-dock";
  nav.dataset.viewSwitch = "true";
  nav.setAttribute("aria-label", "App view");

  const capsule = documentRef.createElement("div");
  capsule.className = "glass-dock__capsule";
  capsule.dataset.glassCapsule = "true";
  capsule.setAttribute("role", "tablist");
  capsule.setAttribute("aria-label", "Wait or Ride");
  capsule.style.setProperty("--lens-progress", "0");

  const lens = documentRef.createElement("span");
  lens.className = "glass-dock__lens";
  lens.dataset.glassLens = "true";
  lens.setAttribute("aria-hidden", "true");

  const waitTab = createTabButton({
    documentRef,
    iconPath: WAIT_ICON_PATH,
    label: "Wait",
    view: "wait",
  });
  const rideTab = createTabButton({
    documentRef,
    iconPath: RIDE_ICON_PATH,
    label: "Ride",
    view: "ride",
  });

  const pulse = documentRef.createElement("span");
  pulse.className = "glass-dock__pulse";
  pulse.dataset.rideIndicator = "true";
  pulse.setAttribute("aria-hidden", "true");
  pulse.hidden = true;
  rideTab.appendChild(pulse);

  capsule.append(lens, waitTab, rideTab);
  nav.appendChild(capsule);

  let currentView: AppView = "wait";
  let scrub: ScrubSession | null = null;
  let suppressNextClick = false;

  const setLensProgress = (value: number) => {
    capsule.style.setProperty("--lens-progress", String(value));
  };

  const selectView = (nextView: AppView, focusTab = false) => {
    setLensProgress(progressForView(nextView));
    if (focusTab) {
      (nextView === "ride" ? rideTab : waitTab).focus();
    }
    if (nextView !== currentView) {
      onSelect(nextView);
    }
  };

  const onTabClick = (view: AppView) => () => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    selectView(view);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const target = nextKeyboardView(event.key);
    if (!target) {
      return;
    }
    event.preventDefault();
    selectView(target, true);
  };

  const onPointerDown = (event: PointerEvent) => {
    scrub = {
      active: false,
      pointerId: event.pointerId,
      progress: progressForView(currentView),
      startX: event.clientX,
    };
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!scrub || event.pointerId !== scrub.pointerId) {
      return;
    }
    if (!scrub.active && Math.abs(event.clientX - scrub.startX) < DRAG_THRESHOLD_PX) {
      return;
    }
    scrub.active = true;
    scrub.progress = computeScrubProgress(capsule, event.clientX);
    capsule.dataset.scrubbing = "true";
    setLensProgress(scrub.progress);
  };

  const finishScrub = (event: PointerEvent) => {
    if (!scrub || event.pointerId !== scrub.pointerId) {
      return;
    }
    const completed = scrub;
    scrub = null;
    delete capsule.dataset.scrubbing;
    if (!completed.active) {
      return;
    }
    suppressNextClick = true;
    const nextView: AppView = completed.progress >= 0.5 ? "ride" : "wait";
    selectView(nextView);
  };

  const onWaitClick = onTabClick("wait");
  const onRideClick = onTabClick("ride");
  waitTab.addEventListener("click", onWaitClick);
  rideTab.addEventListener("click", onRideClick);
  capsule.addEventListener("keydown", onKeyDown);
  capsule.addEventListener("pointerdown", onPointerDown);
  documentRef.addEventListener("pointermove", onPointerMove);
  documentRef.addEventListener("pointerup", finishScrub);
  documentRef.addEventListener("pointercancel", finishScrub);

  return {
    cleanup() {
      waitTab.removeEventListener("click", onWaitClick);
      rideTab.removeEventListener("click", onRideClick);
      capsule.removeEventListener("keydown", onKeyDown);
      capsule.removeEventListener("pointerdown", onPointerDown);
      documentRef.removeEventListener("pointermove", onPointerMove);
      documentRef.removeEventListener("pointerup", finishScrub);
      documentRef.removeEventListener("pointercancel", finishScrub);
    },
    element: nav,
    sync(state) {
      currentView = state.activeView;
      if (!scrub?.active) {
        setLensProgress(progressForView(state.activeView));
      }
      const isRide = state.activeView === "ride";
      waitTab.setAttribute("aria-selected", String(!isRide));
      rideTab.setAttribute("aria-selected", String(isRide));
      waitTab.tabIndex = isRide ? -1 : 0;
      rideTab.tabIndex = isRide ? 0 : -1;
      waitTab.classList.toggle("is-active", !isRide);
      rideTab.classList.toggle("is-active", isRide);
      pulse.hidden = !state.hasActiveRide;
      nav.dataset.hasActiveRide = state.hasActiveRide ? "true" : "false";
      if (state.hasActiveRide && state.rideColor) {
        nav.style.setProperty("--ride-tint", state.rideColor);
      } else {
        nav.style.removeProperty("--ride-tint");
      }
    },
  };
}
