import type { CanvasType } from "./canvas-types";
import type { PromptOriginOverride } from "./load-prompt-departures";
import type { Mode } from "@shared/domain/mode";

export type RoutePolicy = "fastest" | "fewest_transfers" | "least_walking";

export interface CanvasVisibleState {
  canvasType: CanvasType;
  degraded: boolean;
  title: string;
  type: "canvas";
}

export interface HomeSetupVisibleState {
  message: string;
  type: "home_setup";
}

export interface LocationClarificationVisibleState {
  message: string;
  prompt: string | null;
  type: "location_clarification";
}

export interface DestinationClarificationVisibleState {
  inputDestination: string;
  message: string;
  mode: Mode;
  originOverride?: PromptOriginOverride | null;
  prompt: string | null;
  suggestions: string[];
  type: "destination_clarification";
}

export interface IntentFallbackVisibleState {
  message: string;
  type: "intent_fallback";
}

export type IntentSessionVisibleState =
  | CanvasVisibleState
  | DestinationClarificationVisibleState
  | HomeSetupVisibleState
  | IntentFallbackVisibleState
  | LocationClarificationVisibleState;

export interface IntentSessionState {
  draftIntent: string;
  policy: RoutePolicy;
  requestVersion: number;
  submittedIntent: string | null;
  visible: IntentSessionVisibleState;
}

export interface CanvasResult {
  canvasType: CanvasType;
  requestId: number;
  title: string;
}

export interface IntentSession {
  applyCanvasResult(result: CanvasResult): void;
  getState(): IntentSessionState;
  markVisibleCanvasDegraded(): void;
  setDraftIntent(intent: string): void;
  setPolicy(policy: RoutePolicy): void;
  showDestinationClarification(input: {
    inputDestination: string;
    message: string;
    mode: Mode;
    originOverride?: PromptOriginOverride | null;
    suggestions: string[];
  }): void;
  showHomeSetup(message: string): void;
  showIntentFallback(message: string): void;
  showLocationClarification(message: string): void;
  startRequest(): number;
  submitDraft(): void;
}

const initialVisibleState: IntentSessionVisibleState = {
  message: "",
  type: "intent_fallback",
};

function createInitialState(): IntentSessionState {
  return {
    draftIntent: "",
    policy: "fastest",
    requestVersion: 0,
    submittedIntent: null,
    visible: initialVisibleState,
  };
}

export function createIntentSession(): IntentSession {
  let state = createInitialState();

  function update(updater: (current: IntentSessionState) => IntentSessionState): void {
    state = updater(state);
  }

  return {
    applyCanvasResult(result) {
      if (result.requestId !== state.requestVersion) {
        return;
      }
      update((current) => ({
        ...current,
        visible: {
          canvasType: result.canvasType,
          degraded: false,
          title: result.title,
          type: "canvas",
        },
      }));
    },
    getState() {
      return state;
    },
    markVisibleCanvasDegraded() {
      if (state.visible.type !== "canvas") {
        return;
      }
      update((current) => ({
        ...current,
        visible: {
          ...current.visible,
          degraded: true,
        },
      }));
    },
    setDraftIntent(intent) {
      update((current) => ({
        ...current,
        draftIntent: intent,
      }));
    },
    setPolicy(policy) {
      update((current) => ({
        ...current,
        policy,
      }));
    },
    showDestinationClarification(input) {
      update((current) => ({
        ...current,
        visible: {
          inputDestination: input.inputDestination,
          message: input.message,
          mode: input.mode,
          originOverride: input.originOverride,
          prompt: current.submittedIntent,
          suggestions: [...input.suggestions],
          type: "destination_clarification",
        },
      }));
    },
    showHomeSetup(message) {
      update((current) => ({
        ...current,
        visible: {
          message,
          type: "home_setup",
        },
      }));
    },
    showIntentFallback(message) {
      update((current) => ({
        ...current,
        visible: {
          message,
          type: "intent_fallback",
        },
      }));
    },
    showLocationClarification(message) {
      update((current) => ({
        ...current,
        visible: {
          message,
          prompt: current.submittedIntent,
          type: "location_clarification",
        },
      }));
    },
    startRequest() {
      const nextRequestVersion = state.requestVersion + 1;
      update((current) => ({
        ...current,
        requestVersion: nextRequestVersion,
      }));
      return nextRequestVersion;
    },
    submitDraft() {
      update((current) => ({
        ...current,
        submittedIntent: current.draftIntent,
      }));
    },
  };
}
