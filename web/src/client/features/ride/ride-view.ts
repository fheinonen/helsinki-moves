import type { AppController } from "@client/app/app-controller";
import type { AppState } from "@client/app/app-store";
import { createRideMapView, type RideMapView } from "@client/features/ride/ride-map-view";
import { fetchRideSnapshot, type RideFetcher } from "@client/services/ride-client";
import type { Departure } from "@shared/domain/departure";
import {
  computeRideProgress,
  type RideExitSummary,
  type RideProgress,
  type RideProgressStop,
  type RideSnapshot,
} from "@shared/domain/ride";

const RIDE_POLL_MS = 5000;
const MAX_QUICK_PICKS = 6;

export interface RideView {
  cleanup(): void;
  element: HTMLElement;
  sync(state: AppState): void;
}

interface CreateRideViewInput {
  controller: AppController;
  destinationColorFor(destination: string): string;
  documentRef: Document;
  fetchRide?: RideFetcher;
}

function formatMinutes(minutes: number): string {
  return minutes <= 0 ? "Now" : `${minutes}m`;
}

function formatStopCount(count: number): string {
  return count === 1 ? "1 stop" : `${count} stops`;
}

function exitEyebrow(urgency: RideExitSummary["urgency"]): string {
  if (urgency === "exit-next") {
    return "Exit next";
  }
  if (urgency === "approaching") {
    return "Approaching exit";
  }
  if (urgency === "arrived") {
    return "Exit passed";
  }
  return "My exit";
}

function departureMinutes(departureIso: string): number {
  return Math.max(0, Math.floor((Date.parse(departureIso) - Date.now()) / 60_000));
}

function buildQuickPickCard(input: {
  color: string;
  departure: Departure;
  documentRef: Document;
  onPick(): void;
}): HTMLButtonElement {
  const { color, departure, documentRef, onPick } = input;
  const button = documentRef.createElement("button");
  button.className = "ride-pick__item";
  button.dataset.ridePick = "true";
  button.type = "button";
  button.style.setProperty("--destination-color", color);

  const line = documentRef.createElement("span");
  line.className = "ride-pick__line";
  line.textContent = departure.line;

  const destination = documentRef.createElement("span");
  destination.className = "ride-pick__destination";
  destination.textContent = departure.destination;
  destination.style.color = color;

  const time = documentRef.createElement("span");
  time.className = "ride-pick__time";
  time.textContent = formatMinutes(departureMinutes(departure.departureIso));

  button.append(line, destination, time);
  button.addEventListener("click", onPick);
  return button;
}

function buildQuickPickPanel(input: {
  controller: AppController;
  destinationColorFor(destination: string): string;
  documentRef: Document;
  state: AppState;
}): HTMLElement {
  const { controller, destinationColorFor, documentRef, state } = input;
  const section = documentRef.createElement("div");
  section.className = "ride-empty";
  section.dataset.rideQuickPick = "true";

  const heading = documentRef.createElement("h2");
  heading.className = "ride-empty__title";
  heading.textContent = "Board a ride";

  const subtitle = documentRef.createElement("p");
  subtitle.className = "ride-empty__copy";

  const departures = (state.station?.departures ?? [])
    .filter((item) => Boolean(item.tripId))
    .slice(0, MAX_QUICK_PICKS);

  if (departures.length === 0) {
    subtitle.textContent = "Pick a departure on Wait to follow your stops live.";
    const back = documentRef.createElement("button");
    back.className = "ride-action ride-action--primary";
    back.type = "button";
    back.textContent = "Back to Wait";
    back.addEventListener("click", () => {
      controller.setActiveView("wait");
    });
    section.append(heading, subtitle, back);
    return section;
  }

  const stopLabel = state.station?.stopName ? ` from ${state.station.stopName}` : "";
  subtitle.textContent = `Tap an imminent departure${stopLabel} to follow your stops live.`;

  const list = documentRef.createElement("div");
  list.className = "ride-pick__list";
  for (const departure of departures) {
    const color = destinationColorFor(departure.destination);
    list.appendChild(
      buildQuickPickCard({
        color,
        departure,
        documentRef,
        onPick() {
          controller.startRide({
            boardedStopId: departure.stopId || state.selectedStopId,
            destination: departure.destination,
            destinationColor: color,
            line: departure.line,
            tripId: departure.tripId || "",
          });
        },
      }),
    );
  }

  section.append(heading, subtitle, list);
  return section;
}

function buildArrivedPanel(input: {
  controller: AppController;
  documentRef: Document;
  line: string;
  stopId: string | null;
  stopName: string;
}): HTMLElement {
  const { controller, documentRef, line, stopId, stopName } = input;
  const card = documentRef.createElement("div");
  card.className = "ride-arrived";
  card.dataset.rideArrived = "true";

  const eyebrow = documentRef.createElement("p");
  eyebrow.className = "ride-eyebrow";
  eyebrow.textContent = line ? `${line} · Trip complete` : "Trip complete";

  const title = documentRef.createElement("h2");
  title.className = "ride-arrived__title";
  title.textContent = `Arrived at ${stopName}`;

  const actions = documentRef.createElement("div");
  actions.className = "ride-arrived__actions";

  if (stopId) {
    const waitHere = documentRef.createElement("button");
    waitHere.className = "ride-action ride-action--primary";
    waitHere.dataset.rideWaitHere = "true";
    waitHere.type = "button";
    waitHere.textContent = "See departures here";
    waitHere.addEventListener("click", () => {
      void controller.openWaitAtStop(stopId);
    });
    actions.appendChild(waitHere);
  }

  const clear = documentRef.createElement("button");
  clear.className = "ride-action";
  clear.dataset.rideClear = "true";
  clear.type = "button";
  clear.textContent = "Clear ride";
  clear.addEventListener("click", () => {
    controller.clearRide();
  });
  actions.appendChild(clear);

  card.append(eyebrow, title, actions);
  return card;
}

function buildIdentityHeader(input: {
  destination: string;
  destinationColor: string;
  documentRef: Document;
  line: string;
  mapOpen: boolean;
  onEnd(): void;
  onToggleMap(): void;
  telemetry: "live" | "timetable";
}): HTMLElement {
  const head = input.documentRef.createElement("div");
  head.className = "ride-head";

  const identity = input.documentRef.createElement("div");
  identity.className = "ride-head__identity";

  const lineBadge = input.documentRef.createElement("span");
  lineBadge.className = "ride-head__line";
  lineBadge.textContent = input.line;

  const destination = input.documentRef.createElement("span");
  destination.className = "ride-head__destination";
  destination.textContent = input.destination;
  destination.style.color = input.destinationColor;

  const telemetry = input.documentRef.createElement("span");
  telemetry.className = "ride-head__telemetry";
  telemetry.dataset.rideTelemetry = input.telemetry;
  telemetry.textContent = input.telemetry === "live" ? "Live" : "Timetable";

  identity.append(lineBadge, destination, telemetry);

  const actions = input.documentRef.createElement("div");
  actions.className = "ride-head__actions";

  const mapToggle = input.documentRef.createElement("button");
  mapToggle.className = "ride-action";
  mapToggle.dataset.rideMapToggle = "true";
  mapToggle.type = "button";
  mapToggle.setAttribute("aria-expanded", String(input.mapOpen));
  mapToggle.classList.toggle("is-active", input.mapOpen);
  mapToggle.textContent = "Map";
  mapToggle.addEventListener("click", input.onToggleMap);

  const endButton = input.documentRef.createElement("button");
  endButton.className = "ride-action";
  endButton.dataset.rideEnd = "true";
  endButton.type = "button";
  endButton.textContent = "End";
  endButton.addEventListener("click", input.onEnd);

  actions.append(mapToggle, endButton);
  head.append(identity, actions);
  return head;
}

function buildNextStopHero(input: {
  documentRef: Document;
  progress: RideProgress;
}): HTMLElement {
  const hero = input.documentRef.createElement("section");
  hero.className = "ride-hero";
  hero.dataset.rideNextStop = "true";

  const eyebrow = input.documentRef.createElement("p");
  eyebrow.className = "ride-eyebrow";
  eyebrow.textContent = "Next stop";

  const row = input.documentRef.createElement("div");
  row.className = "ride-hero__row";

  const stopName = input.documentRef.createElement("h2");
  stopName.className = "ride-hero__stop";
  stopName.textContent = input.progress.nextStop?.name ?? "";

  const eta = input.documentRef.createElement("span");
  eta.className = "ride-hero__eta";
  eta.textContent = formatMinutes(input.progress.nextMinutes ?? 0);

  row.append(stopName, eta);
  hero.append(eyebrow, row);

  const meta = input.progress.nextStop?.platform
    ? `Platform ${input.progress.nextStop.platform}`
    : input.progress.nextStop?.code || "";
  if (meta) {
    const sub = input.documentRef.createElement("p");
    sub.className = "ride-hero__meta";
    sub.textContent = meta;
    hero.appendChild(sub);
  }
  return hero;
}

function buildExitSummaryCard(input: {
  controller: AppController;
  documentRef: Document;
  exit: RideExitSummary;
}): HTMLElement {
  const { controller, documentRef, exit } = input;
  const card = documentRef.createElement("section");
  card.className = "ride-exit";
  card.dataset.rideExitSummary = "true";
  card.dataset.exitUrgency = exit.urgency;

  const info = documentRef.createElement("div");
  info.className = "ride-exit__info";

  const eyebrow = documentRef.createElement("p");
  eyebrow.className = "ride-eyebrow";
  eyebrow.textContent = exitEyebrow(exit.urgency);

  const title = documentRef.createElement("p");
  title.className = "ride-exit__stop";
  title.textContent = exit.stop.name;

  const countdown = documentRef.createElement("p");
  countdown.className = "ride-exit__countdown";
  countdown.textContent =
    exit.stopsRemaining === 0
      ? "Passed"
      : `${formatStopCount(exit.stopsRemaining)} · ${formatMinutes(exit.minutesRemaining)}`;

  info.append(eyebrow, title, countdown);

  const actions = documentRef.createElement("div");
  actions.className = "ride-exit__actions";

  const waitHere = documentRef.createElement("button");
  waitHere.className = "ride-action ride-action--primary";
  waitHere.dataset.rideWaitHere = "true";
  waitHere.type = "button";
  waitHere.textContent = "Wait here";
  waitHere.addEventListener("click", () => {
    void controller.openWaitAtStop(exit.stop.stopId);
  });

  const unpin = documentRef.createElement("button");
  unpin.className = "ride-action";
  unpin.dataset.rideUnpinExit = "true";
  unpin.type = "button";
  unpin.textContent = "Clear";
  unpin.addEventListener("click", () => {
    controller.setRideExitStop(null);
  });

  actions.append(waitHere, unpin);
  card.append(info, actions);
  return card;
}

function buildStopRibbonRow(input: {
  documentRef: Document;
  entry: RideProgressStop;
  onPinExit(stopId: string | null): void;
}): HTMLLIElement {
  const { documentRef, entry, onPinExit } = input;
  const item = documentRef.createElement("li");
  item.className = "ride-ribbon__item";

  const button = documentRef.createElement("button");
  button.className = "ride-ribbon__stop";
  button.dataset.rideStop = entry.stop.stopId;
  button.dataset.stopState = entry.state;
  button.dataset.isExit = String(entry.isExit);
  button.type = "button";
  button.disabled = entry.state === "past";

  const dot = documentRef.createElement("span");
  dot.className = "ride-ribbon__dot";
  dot.setAttribute("aria-hidden", "true");

  const name = documentRef.createElement("span");
  name.className = "ride-ribbon__name";
  name.textContent = entry.stop.name;

  const eta = documentRef.createElement("span");
  eta.className = "ride-ribbon__eta";
  eta.textContent = entry.state === "past" ? "Passed" : formatMinutes(entry.minutesUntil);

  button.append(dot, name);
  if (entry.isExit) {
    const tag = documentRef.createElement("span");
    tag.className = "ride-ribbon__exit-tag";
    tag.textContent = "Exit";
    button.appendChild(tag);
  }
  button.appendChild(eta);

  if (entry.state !== "past") {
    button.addEventListener("click", () => {
      onPinExit(entry.isExit ? null : entry.stop.stopId);
    });
  }

  item.appendChild(button);
  return item;
}

function buildStopRibbon(input: {
  controller: AppController;
  documentRef: Document;
  onTogglePast(): void;
  progress: RideProgress;
  showPast: boolean;
}): HTMLElement {
  const { controller, documentRef, onTogglePast, progress, showPast } = input;
  const wrap = documentRef.createElement("section");
  wrap.className = "ride-ribbon";

  if (progress.pastCount > 0) {
    const toggle = documentRef.createElement("button");
    toggle.className = "ride-ribbon__past-toggle";
    toggle.dataset.ridePastToggle = "true";
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", String(showPast));
    toggle.textContent = showPast
      ? `Hide ${formatStopCount(progress.pastCount)} passed`
      : `${formatStopCount(progress.pastCount)} passed`;
    toggle.addEventListener("click", onTogglePast);
    wrap.appendChild(toggle);
  }

  const list = documentRef.createElement("ol");
  list.className = "ride-ribbon__list";
  for (const entry of progress.stops) {
    if (entry.state === "past" && !showPast) {
      continue;
    }
    list.appendChild(
      buildStopRibbonRow({
        documentRef,
        entry,
        onPinExit(stopId) {
          controller.setRideExitStop(stopId);
        },
      }),
    );
  }
  wrap.appendChild(list);
  return wrap;
}

export function createRideView(input: CreateRideViewInput): RideView {
  const { controller, destinationColorFor, documentRef } = input;
  const fetchRide: RideFetcher =
    input.fetchRide ??
    (({ signal, tripId }) => fetchRideSnapshot({ signal, tripId }));

  const element = documentRef.createElement("div");
  element.className = "ride-view";
  element.dataset.rideView = "true";

  const content = documentRef.createElement("div");
  content.className = "ride-view__content";
  element.appendChild(content);

  let latestState: AppState = controller.store.getState();
  let activeTripId: string | null = null;
  let snapshot: RideSnapshot | null = null;
  let loadStatus: "idle" | "loading" | "ready" | "error" = "idle";
  let mapOpen = false;
  let showPast = false;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let inFlight: AbortController | null = null;
  let requestToken = 0;

  const mapView: RideMapView = createRideMapView({
    documentRef,
    onClose() {
      mapOpen = false;
      render();
    },
  });

  function stopPolling(): void {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    inFlight?.abort();
    inFlight = null;
  }

  async function pollOnce(tripId: string): Promise<void> {
    inFlight?.abort();
    const abort = new AbortController();
    inFlight = abort;
    const token = ++requestToken;

    try {
      const next = await fetchRide({ signal: abort.signal, tripId });
      if (token !== requestToken || activeTripId !== tripId) {
        return;
      }
      if (!next) {
        snapshot = null;
        loadStatus = "error";
        render();
        return;
      }
      snapshot = next;
      loadStatus = "ready";
      render();
    } catch {
      if (token !== requestToken || abort.signal.aborted) {
        return;
      }
      if (!snapshot) {
        loadStatus = "error";
        render();
      }
    }
  }

  function startPolling(tripId: string): void {
    stopPolling();
    void pollOnce(tripId);
    pollTimer = setInterval(() => {
      void pollOnce(tripId);
    }, RIDE_POLL_MS);
  }

  function renderLoading(state: AppState): void {
    const card = documentRef.createElement("div");
    card.className = "ride-loading";
    card.dataset.rideLoading = "true";
    const label = [state.ride.line, state.ride.destination].filter(Boolean).join(" · ");
    card.textContent = label ? `Loading live stops for ${label}...` : "Loading live stops...";
    content.replaceChildren(card);
  }

  function renderActiveRide(state: AppState, activeSnapshot: RideSnapshot): void {
    const progress = computeRideProgress(activeSnapshot, Date.now(), {
      boardedStopId: state.ride.boardedStopId,
      exitStopId: state.ride.exitStopId,
    });
    const color =
      state.ride.destinationColor || destinationColorFor(activeSnapshot.destination);
    element.style.setProperty("--destination-color", color);

    if (progress.status === "arrived") {
      const stop = progress.exit?.stop ?? progress.finalStop;
      content.replaceChildren(
        buildArrivedPanel({
          controller,
          documentRef,
          line: activeSnapshot.line,
          stopId: stop?.stopId ?? null,
          stopName: stop?.name || activeSnapshot.destination,
        }),
      );
      return;
    }

    const nodes: HTMLElement[] = [
      buildIdentityHeader({
        destination: activeSnapshot.destination,
        destinationColor: color,
        documentRef,
        line: activeSnapshot.line,
        mapOpen,
        onEnd() {
          controller.clearRide();
        },
        onToggleMap() {
          mapOpen = !mapOpen;
          render();
        },
        telemetry: progress.telemetry,
      }),
      buildNextStopHero({ documentRef, progress }),
    ];

    if (progress.exit) {
      nodes.push(
        buildExitSummaryCard({
          controller,
          documentRef,
          exit: progress.exit,
        }),
      );
    }

    mapView.setOpen(mapOpen);
    if (mapOpen) {
      mapView.sync({
        destinationColor: color,
        progress,
        snapshot: activeSnapshot,
      });
    }
    nodes.push(mapView.element);

    nodes.push(
      buildStopRibbon({
        controller,
        documentRef,
        onTogglePast() {
          showPast = !showPast;
          render();
        },
        progress,
        showPast,
      }),
    );

    content.replaceChildren(...nodes);
  }

  function render(): void {
    const state = latestState;
    if (!state.ride.tripId) {
      mapView.setOpen(false);
      content.replaceChildren(
        buildQuickPickPanel({
          controller,
          destinationColorFor,
          documentRef,
          state,
        }),
      );
      return;
    }

    if (snapshot && snapshot.tripId === state.ride.tripId) {
      renderActiveRide(state, snapshot);
      return;
    }

    if (loadStatus === "error") {
      content.replaceChildren(
        buildArrivedPanel({
          controller,
          documentRef,
          line: state.ride.line || "",
          stopId: state.ride.exitStopId || state.ride.boardedStopId,
          stopName: state.ride.destination || "your destination",
        }),
      );
      return;
    }

    renderLoading(state);
  }

  return {
    cleanup() {
      stopPolling();
      mapView.destroy();
    },
    element,
    sync(state) {
      latestState = state;
      const tripId = state.ride.tripId;
      const tripChanged = tripId !== activeTripId;

      if (tripChanged) {
        activeTripId = tripId;
        snapshot = null;
        mapOpen = false;
        showPast = false;
        loadStatus = tripId ? "loading" : "idle";
      }

      if (state.activeView === "ride" && tripId) {
        if (tripChanged || !pollTimer) {
          startPolling(tripId);
        }
      } else {
        stopPolling();
      }

      if (state.activeView === "ride") {
        render();
      }
    },
  };
}
