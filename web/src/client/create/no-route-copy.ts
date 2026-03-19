import type { NoRouteCanvasViewModel } from "./canvas-view-model";

export interface NoRouteCopy {
  explanation: string;
  recovery: string | null;
}

export function describeNoRouteCanvas(routeCanvas: NoRouteCanvasViewModel): NoRouteCopy {
  const nearestAlternative = routeCanvas.alternatives[0]
    ? `Nearest alternative stop: ${routeCanvas.alternatives[0].stopName}.`
    : null;

  if (routeCanvas.reason === "service_disruption") {
    return {
      explanation: "No full route available because of current service disruption. Service disruption affects this route.",
      recovery: nearestAlternative || "Check nearby alternatives.",
    };
  }

  if (routeCanvas.reason === "policy_restricted") {
    return {
      explanation: "No full route available with this policy right now.",
      recovery: nearestAlternative
        ? `Try fastest instead. ${nearestAlternative}`
        : "Try fastest instead.",
    };
  }

  return {
    explanation: "No full route available right now.",
    recovery: nearestAlternative,
  };
}
