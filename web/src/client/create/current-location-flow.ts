import type { LocationPermissionState, LocationResult } from "@client/services/location-service";
import {
  createPromptFlowCurrentLocationRequest,
  markPromptFlowLocationDenied,
  type PromptFlowState,
} from "./prompt-flow-state";

export interface CurrentLocationFlowState {
  promptFlow: PromptFlowState;
  useCurrentLocationPreference: boolean;
}

export function shouldAutoResolveCurrentLocation(input: {
  hasResolver: boolean;
  permissionState?: LocationPermissionState;
  useCurrentLocationPreference: boolean;
}): boolean {
  if (!input.hasResolver) {
    return false;
  }
  if (input.useCurrentLocationPreference) {
    return true;
  }
  return input.permissionState === "granted";
}

export function applyCurrentLocationResult(input: {
  prompt: string;
  promptFlow: PromptFlowState;
  result: LocationResult;
  useCurrentLocationPreference: boolean;
}): CurrentLocationFlowState {
  if (input.result.ok) {
    return {
      promptFlow: createPromptFlowCurrentLocationRequest(input.prompt, input.result.value),
      useCurrentLocationPreference: true,
    };
  }

  return {
    promptFlow: markPromptFlowLocationDenied(
      input.promptFlow,
      "Location access was denied. Enter your starting place to continue."
    ),
    useCurrentLocationPreference: input.useCurrentLocationPreference,
  };
}
