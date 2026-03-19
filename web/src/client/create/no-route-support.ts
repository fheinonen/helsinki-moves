import type { NoRouteCanvasViewModel } from "./canvas-view-model";
import { describeNoRouteCanvas } from "./no-route-copy";

export interface NoRouteSupport {
  disruptionRecovery: string | null;
  explanation: string;
  policyRecovery: string | null;
}

export function describeNoRouteSupport(routeCanvas: NoRouteCanvasViewModel): NoRouteSupport {
  const copy = describeNoRouteCanvas(routeCanvas);

  if (routeCanvas.reason === "policy_restricted") {
    return {
      disruptionRecovery: null,
      explanation: copy.explanation,
      policyRecovery: copy.recovery,
    };
  }

  if (routeCanvas.reason === "service_disruption") {
    return {
      disruptionRecovery: copy.recovery,
      explanation: copy.explanation,
      policyRecovery: null,
    };
  }

  return {
    disruptionRecovery: null,
    explanation: copy.recovery ? `${copy.explanation} ${copy.recovery}` : copy.explanation,
    policyRecovery: null,
  };
}
