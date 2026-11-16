const END_GAP_PX = 1;

const DOWN_KEYS = new Set(["ArrowDown", "End", "PageDown", " "]);
const UP_KEYS = new Set(["ArrowUp", "Home", "PageUp"]);

export type ScrollMetrics = {
  readonly clientHeight: number;
  readonly scrollHeight: number;
  readonly scrollTop: number;
};

export type PointerPush =
  | { readonly kind: "wheel"; readonly deltaY: number }
  | { readonly kind: "touch"; readonly previousClientY: number; readonly clientY: number }
  | { readonly kind: "key"; readonly key: string };

export type ExtendOutcome =
  | { readonly type: "grew" }
  | { readonly type: "empty" }
  | { readonly type: "failed" };

export type HoldStep = {
  readonly extend: boolean;
};

type Phase = "idle" | "arrived" | "held";
type Direction = "down" | "none" | "up";

export interface HoldSession {
  push(push: PointerPush, metrics: ScrollMetrics): HoldStep;
  reset(): void;
  settle(outcome: ExtendOutcome): void;
}

function wheelDirection(deltaY: number): Direction {
  if (deltaY > 0) {
    return "down";
  }
  if (deltaY < 0) {
    return "up";
  }
  return "none";
}

function touchDirection(previousClientY: number, clientY: number): Direction {
  if (clientY < previousClientY) {
    return "down";
  }
  if (clientY > previousClientY) {
    return "up";
  }
  return "none";
}

function keyDirection(key: string): Direction {
  if (DOWN_KEYS.has(key)) {
    return "down";
  }
  if (UP_KEYS.has(key)) {
    return "up";
  }
  return "none";
}

function pushDirection(push: PointerPush): Direction {
  switch (push.kind) {
    case "wheel":
      return wheelDirection(push.deltaY);
    case "touch":
      return touchDirection(push.previousClientY, push.clientY);
    case "key":
      return keyDirection(push.key);
    default: {
      const unreachable: never = push;
      return unreachable;
    }
  }
}

function isDocumentEnd(metrics: ScrollMetrics): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= END_GAP_PX;
}

function applySettle(phase: Phase, outcome: ExtendOutcome): Phase {
  switch (outcome.type) {
    case "grew":
    case "failed":
      return "arrived";
    case "empty":
      return phase;
    default: {
      const unreachable: never = outcome;
      throw new Error(`Unexpected extend outcome: ${String(unreachable)}`);
    }
  }
}

export function createHoldSession(): HoldSession {
  let phase: Phase = "idle";
  let generation = 0;
  let armedGeneration = 0;

  function arriveOrExtend(): HoldStep {
    if (phase === "idle") {
      phase = "arrived";
      return { extend: false };
    }
    if (phase === "arrived") {
      phase = "held";
      armedGeneration = generation;
      return { extend: true };
    }
    return { extend: false };
  }

  function extendIsArmed(): boolean {
    return phase === "held" && armedGeneration === generation;
  }

  return {
    push(pointer, metrics) {
      const direction = pushDirection(pointer);
      if (direction === "none") {
        return { extend: false };
      }
      if (direction === "up" || !isDocumentEnd(metrics)) {
        phase = "idle";
        return { extend: false };
      }
      return arriveOrExtend();
    },
    reset() {
      phase = "idle";
      generation += 1;
    },
    settle(outcome) {
      if (!extendIsArmed()) {
        return;
      }
      phase = applySettle(phase, outcome);
    },
  };
}
