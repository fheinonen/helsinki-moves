import type { RouteCanvasViewModel } from "./canvas-view-model";
import { getPreferredAlertMessage, getPreferredAlertTone } from "./route-alert-support";

export interface RouteAlertRenderSupport {
  explanationSuffix: string | null;
  serviceNote: string | null;
  showDisruptionNotice: boolean;
}

export function describeRouteAlertRenderSupport(
  routeCanvas: RouteCanvasViewModel
): RouteAlertRenderSupport {
  const preferredAlertMessage = getPreferredAlertMessage(routeCanvas);
  const preferredAlertTone = getPreferredAlertTone(routeCanvas);

  return {
    explanationSuffix:
      preferredAlertMessage && preferredAlertTone === "disruption"
        ? `Alert: ${preferredAlertMessage}.`
        : null,
    serviceNote:
      preferredAlertMessage && preferredAlertTone === "advisory"
        ? `Service note: ${preferredAlertMessage}.`
        : null,
    showDisruptionNotice:
      (routeCanvas.state === "no_route" && routeCanvas.reason === "service_disruption") ||
      (preferredAlertTone === "disruption" && routeCanvas.degraded),
  };
}
