import type { AppController } from "@client/app/app-controller";
import { scrollMapIntoView } from "@client/features/map/map-chrome";
import { createTransferWalkMapView } from "@client/features/ride/transfer-walk-map-view";
import { fetchTransfers, type TransfersFetcher } from "@client/services/transfers-client";
import { fetchWalkRoute } from "@client/services/walk-client";
import { createDestinationColorBook } from "@shared/domain/destination-color";
import type { Mode } from "@shared/domain/mode";
import type { RideStop } from "@shared/domain/ride";
import {
  evaluateTransfer,
  filterDisplayableTransfers,
  findRecoveryTransfer,
  formatTransferMargin,
  type EvaluatedTransfer,
  type TransferOption,
  type TransfersResponse,
} from "@shared/domain/transfer";
import { formatWalkMinutes, type WalkRequest, type WalkRoute } from "@shared/domain/walk-route";

const TRANSFERS_POLL_MS = 15_000;
const MODE_LABELS: Record<Mode, string> = {
  BUS: "Bus",
  METRO: "Metro",
  RAIL: "Rail",
  TRAM: "Tram",
};

export interface RideTransfersSyncInput {
  readonly active: boolean;
  readonly exitStop: RideStop | null;
  readonly rideMode: Mode | null;
  readonly transferMode: Mode | null;
  readonly transferTripId: string | null;
}

export interface RideTransfersController {
  boardTransfer(option: TransferOption): void;
  cleanup(): void;
  getWatchedOption(): TransferOption | null;
  isDrawerOpen(): boolean;
  renderDrawer(input: { arrivalIso: string; transferTripId: string | null }): HTMLElement | null;
  renderWatchCard(input: { arrivalIso: string; transferTripId: string | null }): HTMLElement | null;
  sync(input: RideTransfersSyncInput): void;
  toggleDrawer(): void;
}

interface CreateRideTransfersControllerInput {
  controller: AppController;
  destinationColorFor(destination: string): string;
  documentRef: Document;
  fetchTransfers?: TransfersFetcher;
  fetchWalk?: (request: WalkRequest) => Promise<WalkRoute | null>;
  onChange(): void;
}

function formatClock(iso: string): string {
  const date = new Date(iso);
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function walkCacheKey(exitStopId: string, transferStopId: string): string {
  return `${exitStopId}->${transferStopId}`;
}

function buildModeTabs(input: {
  activeMode: Mode;
  availableModes: readonly Mode[];
  documentRef: Document;
  onSelect(mode: Mode): void;
}): HTMLElement {
  const bar = input.documentRef.createElement("div");
  bar.className = "ride-transfers__modes";
  bar.setAttribute("role", "tablist");
  bar.setAttribute("aria-label", "Transfer modes");

  for (const mode of input.availableModes) {
    const button = input.documentRef.createElement("button");
    button.className = "ride-transfers__mode";
    button.dataset.transferModeTab = mode;
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(mode === input.activeMode));
    button.classList.toggle("is-active", mode === input.activeMode);
    button.textContent = MODE_LABELS[mode];
    button.addEventListener("click", () => {
      input.onSelect(mode);
    });
    bar.appendChild(button);
  }
  return bar;
}

function buildTransferRow(input: {
  color: string;
  documentRef: Document;
  evaluated: EvaluatedTransfer;
  isWatched: boolean;
  onSelect(): void;
}): HTMLButtonElement {
  const { color, documentRef, evaluated, isWatched, onSelect } = input;
  const { option } = evaluated;
  const row = documentRef.createElement("button");
  row.className = "ride-transfers__row";
  row.dataset.transferOption = option.tripId;
  row.dataset.feasibility = evaluated.feasibility;
  row.dataset.watched = String(isWatched);
  row.type = "button";
  row.style.setProperty("--destination-color", color);

  const line = documentRef.createElement("span");
  line.className = "ride-transfers__line";
  line.textContent = option.line;

  const main = documentRef.createElement("span");
  main.className = "ride-transfers__main";

  const dest = documentRef.createElement("span");
  dest.className = "ride-transfers__destination";
  dest.textContent = option.destination;
  dest.style.color = color;

  const metaText = [option.stopName, option.platform ? `Platform ${option.platform}` : null]
    .filter(Boolean)
    .join(" · ");
  const meta = documentRef.createElement("span");
  meta.className = "ride-transfers__meta";
  meta.textContent = metaText;
  main.append(dest, meta);

  const timing = documentRef.createElement("span");
  timing.className = "ride-transfers__timing";

  const clock = documentRef.createElement("span");
  clock.className = "ride-transfers__clock";
  clock.textContent = formatClock(option.departureIso);

  const badge = documentRef.createElement("span");
  badge.className = "ride-transfers__badge";
  badge.dataset.feasibility = evaluated.feasibility;
  badge.textContent = formatTransferMargin(evaluated);

  timing.append(clock, badge);
  row.append(line, main, timing);
  row.addEventListener("click", onSelect);
  return row;
}

function buildWatchCardElement(input: {
  color: string;
  documentRef: Document;
  evaluated: EvaluatedTransfer;
  onBoard(): void;
  onToggleWalkMap(): void;
  onUnwatch(): void;
  onWatchNext?(next: EvaluatedTransfer): void;
  recovery: EvaluatedTransfer | null;
  walkMap: HTMLElement;
  walkMapOpen: boolean;
}): HTMLElement {
  const {
    color,
    documentRef,
    evaluated,
    onBoard,
    onToggleWalkMap,
    onUnwatch,
    onWatchNext,
    recovery,
    walkMap,
    walkMapOpen,
  } = input;
  const { option } = evaluated;

  const card = documentRef.createElement("div");
  card.className = "ride-transfer-watch";
  card.dataset.transferWatch = "true";
  card.dataset.feasibility = evaluated.feasibility;
  card.style.setProperty("--destination-color", color);

  const top = documentRef.createElement("div");
  top.className = "ride-transfer-watch__top";

  const identity = documentRef.createElement("div");
  identity.className = "ride-transfer-watch__identity";

  const line = documentRef.createElement("span");
  line.className = "ride-transfer-watch__line";
  line.textContent = option.line;

  const dest = documentRef.createElement("span");
  dest.className = "ride-transfer-watch__dest";
  dest.textContent = option.destination;
  dest.style.color = color;

  identity.append(line, dest);

  const badge = documentRef.createElement("span");
  badge.className = "ride-transfers__badge";
  badge.dataset.feasibility = evaluated.feasibility;
  badge.textContent = formatTransferMargin(evaluated);

  top.append(identity, badge);

  const detail = documentRef.createElement("p");
  detail.className = "ride-transfer-watch__detail";
  const parts = [
    formatClock(option.departureIso),
    option.platform ? `Platform ${option.platform}` : option.stopName,
    `~${formatWalkMinutes(evaluated.walkSeconds)} walk`,
  ].filter(Boolean);
  detail.textContent = parts.join(" · ");

  card.append(top, detail);

  if (evaluated.feasibility === "missed" && recovery && onWatchNext) {
    const recoveryBar = documentRef.createElement("div");
    recoveryBar.className = "ride-transfer-watch__recovery";
    recoveryBar.dataset.transferRecovery = "true";

    const label = documentRef.createElement("span");
    label.className = "ride-transfer-watch__recovery-text";
    label.textContent = `Next: ${recovery.option.line} ${recovery.option.destination} · ${formatClock(recovery.option.departureIso)} (${formatTransferMargin(recovery)})`;

    const watchNext = documentRef.createElement("button");
    watchNext.className = "ride-action ride-action--primary";
    watchNext.dataset.transferWatchNext = "true";
    watchNext.type = "button";
    watchNext.textContent = "Watch next";
    watchNext.addEventListener("click", () => {
      onWatchNext(recovery);
    });

    recoveryBar.append(label, watchNext);
    card.appendChild(recoveryBar);
  }

  const actions = documentRef.createElement("div");
  actions.className = "ride-transfer-watch__actions";

  const boardBtn = documentRef.createElement("button");
  boardBtn.className = "ride-action ride-action--primary";
  boardBtn.dataset.transferBoard = "true";
  boardBtn.type = "button";
  boardBtn.textContent = `Board ${option.line}`;
  boardBtn.addEventListener("click", onBoard);

  const walkMapBtn = documentRef.createElement("button");
  walkMapBtn.className = "ride-action";
  walkMapBtn.dataset.transferWalkMapToggle = "true";
  walkMapBtn.type = "button";
  walkMapBtn.setAttribute("aria-expanded", String(walkMapOpen));
  walkMapBtn.classList.toggle("is-active", walkMapOpen);
  walkMapBtn.textContent = "Walk map";
  walkMapBtn.addEventListener("click", onToggleWalkMap);

  const unwatchBtn = documentRef.createElement("button");
  unwatchBtn.className = "ride-action";
  unwatchBtn.dataset.transferUnwatch = "true";
  unwatchBtn.type = "button";
  unwatchBtn.textContent = "Unwatch";
  unwatchBtn.addEventListener("click", onUnwatch);

  actions.append(boardBtn, walkMapBtn, unwatchBtn);
  card.append(actions, walkMap);
  return card;
}

export function createRideTransfersController(
  input: CreateRideTransfersControllerInput,
): RideTransfersController {
  const { controller, destinationColorFor, documentRef, onChange } = input;
  const loadTransfers: TransfersFetcher =
    input.fetchTransfers ?? ((req) => fetchTransfers(req));
  const loadWalk = input.fetchWalk ?? fetchWalkRoute;

  let drawerOpen = false;
  let walkMapOpen = false;
  let currentExit: RideStop | null = null;
  let currentRideMode: Mode = "BUS";
  let requestedMode: Mode | null = null;
  let activeTransferTripId: string | null = null;
  let response: TransfersResponse | null = null;
  let loading = false;
  let lastWatchedOption: TransferOption | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let inFlight: AbortController | null = null;
  let requestToken = 0;

  const transferColors = createDestinationColorBook();
  const walkCache = new Map<string, WalkRoute | null>();
  const walkInFlight = new Set<string>();
  const walkMapView = createTransferWalkMapView({
    documentRef,
    onClose() {
      walkMapOpen = false;
      onChange();
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

  function refineWalkForWatched(option: TransferOption): void {
    if (!currentExit) {
      return;
    }
    const key = walkCacheKey(currentExit.stopId, option.stopId);
    if (walkCache.has(key) || walkInFlight.has(key)) {
      return;
    }
    walkInFlight.add(key);
    void loadWalk({
      lat: currentExit.lat,
      lon: currentExit.lon,
      stopId: option.stopId,
    })
      .then((route) => {
        walkInFlight.delete(key);
        walkCache.set(key, route ?? null);
        onChange();
      })
      .catch(() => {
        walkInFlight.delete(key);
        walkCache.set(key, null);
        onChange();
      });
  }

  async function pollOnce(notifyLoading = true): Promise<void> {
    if (!currentExit) {
      return;
    }
    inFlight?.abort();
    const abort = new AbortController();
    inFlight = abort;
    const token = ++requestToken;
    loading = !response;
    if (loading && notifyLoading) {
      onChange();
    }

    try {
      const next = await loadTransfers({
        arrivalIso: currentExit.arrivalIso,
        lat: currentExit.lat,
        lon: currentExit.lon,
        mode: requestedMode,
        rideMode: currentRideMode,
        signal: abort.signal,
      });
      if (token !== requestToken) {
        return;
      }
      loading = false;
      if (next) {
        response = next;
        if (activeTransferTripId) {
          const matched = next.options.find((item) => item.tripId === activeTransferTripId);
          if (matched) {
            lastWatchedOption = matched;
            refineWalkForWatched(matched);
          }
        }
      }
      onChange();
    } catch {
      if (token !== requestToken || abort.signal.aborted) {
        return;
      }
      loading = false;
      onChange();
    }
  }

  function ensurePolling(shouldPoll: boolean, forceFetch: boolean, notifyLoading = true): void {
    if (!shouldPoll) {
      stopPolling();
      return;
    }
    if (forceFetch || !pollTimer) {
      stopPolling();
      pollTimer = setInterval(() => {
        void pollOnce(false);
      }, TRANSFERS_POLL_MS);
      void pollOnce(notifyLoading);
    }
  }

  function evaluateAll(arrivalIso: string): EvaluatedTransfer[] {
    if (!response) {
      return [];
    }
    const arrivalMs = Date.parse(arrivalIso);
    return response.options.map((option) => {
      const key = currentExit ? walkCacheKey(currentExit.stopId, option.stopId) : "";
      const cachedWalk = key ? walkCache.get(key) : null;
      const walkOverride =
        option.tripId === activeTransferTripId && cachedWalk ? cachedWalk.seconds : null;
      return evaluateTransfer({
        arrivalMs,
        option,
        walkSecondsOverride: walkOverride,
      });
    });
  }

  function boardTransfer(option: TransferOption): void {
    const color =
      transferColors.peekColor(option.destination) ?? destinationColorFor(option.destination);
    drawerOpen = false;
    walkMapOpen = false;
    walkMapView.setOpen(false);
    lastWatchedOption = null;
    stopPolling();
    controller.startRide({
      boardedStopId: option.stopId,
      destination: option.destination,
      destinationColor: color,
      line: option.line,
      tripId: option.tripId,
    });
  }

  return {
    boardTransfer,
    cleanup() {
      stopPolling();
      walkMapView.destroy();
    },
    getWatchedOption() {
      return lastWatchedOption;
    },
    isDrawerOpen() {
      return drawerOpen;
    },
    renderDrawer({ arrivalIso, transferTripId }) {
      if (!drawerOpen) {
        return null;
      }
      const panel = documentRef.createElement("section");
      panel.className = "ride-transfers";
      panel.dataset.transfersDrawer = "true";

      if (loading && !response) {
        const copy = documentRef.createElement("p");
        copy.className = "ride-transfers__status";
        copy.textContent = "Checking nearby transfers...";
        panel.appendChild(copy);
        return panel;
      }

      if (!response || response.availableModes.length === 0) {
        const empty = documentRef.createElement("p");
        empty.className = "ride-transfers__status";
        empty.textContent = "No onward stops within 350 m of this exit.";
        panel.appendChild(empty);
        return panel;
      }

      panel.appendChild(
        buildModeTabs({
          activeMode: response.mode,
          availableModes: response.availableModes,
          documentRef,
          onSelect(mode) {
            if (mode === requestedMode && response?.mode === mode) {
              return;
            }
            requestedMode = mode;
            response = null;
            ensurePolling(true, true);
          },
        }),
      );

      const evaluated = filterDisplayableTransfers(evaluateAll(arrivalIso));
      if (evaluated.length === 0) {
        const none = documentRef.createElement("p");
        none.className = "ride-transfers__status";
        none.textContent = "No upcoming departures around your arrival.";
        panel.appendChild(none);
        return panel;
      }

      const rowColors = transferColors.colorsFor(evaluated.map((item) => item.option.destination));
      const list = documentRef.createElement("div");
      list.className = "ride-transfers__list";
      evaluated.forEach((item, index) => {
        const color = rowColors[index];
        list.appendChild(
          buildTransferRow({
            color,
            documentRef,
            evaluated: item,
            isWatched: item.option.tripId === transferTripId,
            onSelect() {
              lastWatchedOption = item.option;
              requestedMode = item.option.mode;
              drawerOpen = false;
              walkMapOpen = false;
              refineWalkForWatched(item.option);
              controller.setRideTransfer({
                mode: item.option.mode,
                tripId: item.option.tripId,
              });
            },
          }),
        );
      });
      panel.appendChild(list);
      return panel;
    },
    renderWatchCard({ arrivalIso, transferTripId }) {
      if (!transferTripId) {
        walkMapView.setOpen(false);
        return null;
      }
      const evaluated = evaluateAll(arrivalIso);
      const watched = evaluated.find((item) => item.option.tripId === transferTripId);
      if (!watched) {
        walkMapView.setOpen(false);
        return null;
      }
      lastWatchedOption = watched.option;
      const color =
        transferColors.peekColor(watched.option.destination) ??
        destinationColorFor(watched.option.destination);
      const key = currentExit ? walkCacheKey(currentExit.stopId, watched.option.stopId) : "";
      walkMapView.setOpen(walkMapOpen);
      if (walkMapOpen) {
        refineWalkForWatched(watched.option);
        walkMapView.sync({
          color,
          evaluated: watched,
          exitStopName: currentExit?.name || "Exit stop",
          loading: Boolean(key && walkInFlight.has(key)),
          route: key ? (walkCache.get(key) ?? null) : null,
          routeKey: key,
        });
      }
      const recovery =
        watched.feasibility === "missed" ? findRecoveryTransfer(watched, evaluated) : null;
      return buildWatchCardElement({
        color,
        documentRef,
        evaluated: watched,
        onBoard() {
          boardTransfer(watched.option);
        },
        onToggleWalkMap() {
          walkMapOpen = !walkMapOpen;
          if (walkMapOpen) {
            refineWalkForWatched(watched.option);
          }
          onChange();
          if (walkMapOpen) {
            scrollMapIntoView(walkMapView.element, documentRef);
          }
        },
        onUnwatch() {
          lastWatchedOption = null;
          walkMapOpen = false;
          walkMapView.setOpen(false);
          controller.setRideTransfer({ mode: null, tripId: null });
        },
        onWatchNext(next) {
          lastWatchedOption = next.option;
          refineWalkForWatched(next.option);
          controller.setRideTransfer({
            mode: next.option.mode,
            tripId: next.option.tripId,
          });
        },
        recovery,
        walkMap: walkMapView.element,
        walkMapOpen,
      });
    },
    sync(next) {
      const exitChanged = next.exitStop?.stopId !== currentExit?.stopId;
      if (exitChanged) {
        response = null;
        drawerOpen = false;
        walkMapOpen = false;
        walkMapView.setOpen(false);
        requestedMode = next.transferMode;
        if (!next.transferTripId) {
          lastWatchedOption = null;
        }
      }
      if (next.transferMode && next.transferTripId && !requestedMode) {
        requestedMode = next.transferMode;
      }
      currentExit = next.exitStop;
      if (next.rideMode) {
        currentRideMode = next.rideMode;
      }
      activeTransferTripId = next.transferTripId;
      if (!next.transferTripId) {
        lastWatchedOption = null;
        walkMapOpen = false;
        walkMapView.setOpen(false);
      }

      const shouldPoll = next.active && Boolean(currentExit) && (drawerOpen || Boolean(activeTransferTripId));
      ensurePolling(shouldPoll, exitChanged && shouldPoll, false);
    },
    toggleDrawer() {
      drawerOpen = !drawerOpen;
      ensurePolling(Boolean(currentExit) && (drawerOpen || Boolean(activeTransferTripId)), drawerOpen, false);
      onChange();
    },
  };
}
