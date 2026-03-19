import type { PromptOriginOverride } from "./load-prompt-departures";
import type { IntentSessionVisibleState } from "./intent-session";
import type { Mode } from "@shared/domain/mode";

export type ClarificationState =
  | {
      deniedMessage?: string | null;
      message: string;
      prompt: string;
      type: "location";
    }
  | {
      inputDestination: string;
      message: string;
      mode: Mode;
      originOverride?: PromptOriginOverride | null;
      prompt: string;
      suggestions: string[];
      type: "destination";
    };

export interface PendingPromptRequest {
  destinationOverride?: string | null;
  originOverride?: PromptOriginOverride | null;
  prompt: string;
}

export interface PromptFlowState {
  clarification: ClarificationState | null;
  pendingRequest: PendingPromptRequest | null;
  typedDestination: string;
  typedLocation: string;
}

export function createPromptFlowEmptyState(): PromptFlowState {
  return {
    clarification: null,
    pendingRequest: null,
    typedDestination: "",
    typedLocation: "",
  };
}

export function beginPromptFlowRequest(prompt: string): PromptFlowState {
  return {
    clarification: null,
    pendingRequest: { prompt },
    typedDestination: "",
    typedLocation: "",
  };
}

export function clearPromptFlowClarification(
  state: PromptFlowState
): PromptFlowState {
  return {
    clarification: null,
    pendingRequest: state.pendingRequest,
    typedDestination: "",
    typedLocation: "",
  };
}

export function showPromptFlowClarification(
  visible: IntentSessionVisibleState
): PromptFlowState {
  if (visible.type === "location_clarification" && visible.prompt) {
    return {
      clarification: {
        deniedMessage: null,
        message: visible.message,
        prompt: visible.prompt,
        type: "location",
      },
      pendingRequest: null,
      typedDestination: "",
      typedLocation: "",
    };
  }

  if (visible.type === "destination_clarification" && visible.prompt) {
    return {
      clarification: {
        inputDestination: visible.inputDestination,
        message: visible.message,
        mode: visible.mode,
        originOverride: visible.originOverride,
        prompt: visible.prompt,
        suggestions: [...visible.suggestions],
        type: "destination",
      },
      pendingRequest: null,
      typedDestination: "",
      typedLocation: "",
    };
  }

  return createPromptFlowEmptyState();
}

export function setPromptFlowTypedLocation(
  state: PromptFlowState,
  typedLocation: string
): PromptFlowState {
  return {
    ...state,
    typedLocation,
  };
}

export function setPromptFlowTypedDestination(
  state: PromptFlowState,
  typedDestination: string
): PromptFlowState {
  return {
    ...state,
    typedDestination,
  };
}

export function markPromptFlowLocationDenied(
  state: PromptFlowState,
  deniedMessage: string
): PromptFlowState {
  if (state.clarification?.type !== "location") {
    return state;
  }

  return {
    ...state,
    clarification: {
      ...state.clarification,
      deniedMessage,
    },
  };
}

export function continuePromptFlowWithTypedLocation(
  state: PromptFlowState
): PromptFlowState {
  if (state.clarification?.type !== "location") {
    return state;
  }

  return {
    clarification: null,
    pendingRequest: {
      originOverride: {
        query: state.typedLocation.trim(),
        type: "typed-location",
      },
      prompt: state.clarification.prompt,
    },
    typedDestination: "",
    typedLocation: "",
  };
}

export function continuePromptFlowWithSuggestedDestination(
  state: PromptFlowState,
  destinationOverride: string
): PromptFlowState {
  if (state.clarification?.type !== "destination") {
    return state;
  }

  return {
    clarification: null,
    pendingRequest: {
      destinationOverride,
      originOverride: state.clarification.originOverride,
      prompt: state.clarification.prompt,
    },
    typedDestination: "",
    typedLocation: "",
  };
}

export function continuePromptFlowWithTypedDestination(
  state: PromptFlowState
): PromptFlowState {
  if (state.clarification?.type !== "destination") {
    return state;
  }

  return {
    clarification: null,
    pendingRequest: {
      destinationOverride: state.typedDestination.trim(),
      originOverride: state.clarification.originOverride,
      prompt: state.clarification.prompt,
    },
    typedDestination: "",
    typedLocation: "",
  };
}

export function createPromptFlowCurrentLocationRequest(
  prompt: string,
  coords: { lat: number; lon: number }
): PromptFlowState {
  return {
    clarification: null,
    pendingRequest: {
      originOverride: {
        coords,
        type: "current-location",
      },
      prompt,
    },
    typedDestination: "",
    typedLocation: "",
  };
}
