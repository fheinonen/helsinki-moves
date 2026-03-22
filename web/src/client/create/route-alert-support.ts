import type { NormalizedAlert } from "@shared/contracts/alerts-contract";
import type { RouteCanvasViewModel } from "./canvas-view-model";

export type PreferredAlertTone = "advisory" | "disruption";

function formatAlertMessage(input: {
  alert: NormalizedAlert;
  fallbackLine: string | null;
}): string | null {
  if (input.alert.effect === "DETOUR") {
    const routeEntity = input.alert.entities.find((entity) => entity.type === "route");
    const line = routeEntity?.routeShortName || input.fallbackLine;
    if (line) {
      return `Detour on line ${line}`;
    }
  }

  if (input.alert.effect === "STOP_MOVED") {
    const stopEntity = input.alert.entities.find(
      (entity) =>
        entity.type === "stop" || entity.type === "stop_on_route" || entity.type === "stop_on_trip"
    );
    if (stopEntity?.stopName) {
      return `Stop moved near ${stopEntity.stopName}`;
    }
  }

  if (input.alert.effect === "NO_SERVICE") {
    const routeEntity = input.alert.entities.find((entity) => entity.type === "route");
    const line = routeEntity?.routeShortName || input.fallbackLine;
    if (line) {
      return `Line ${line} not running right now`;
    }
  }

  if (input.alert.effect === "SIGNIFICANT_DELAYS") {
    const routeEntity = input.alert.entities.find((entity) => entity.type === "route");
    const line = routeEntity?.routeShortName || input.fallbackLine;
    if (line) {
      return `Major delays on line ${line}`;
    }
  }

  if (input.alert.effect === "REDUCED_SERVICE") {
    const routeEntity = input.alert.entities.find((entity) => entity.type === "route");
    const line = routeEntity?.routeShortName || input.fallbackLine;
    if (line) {
      return `Reduced service on line ${line}`;
    }
  }

  if (input.alert.effect === "MODIFIED_SERVICE") {
    return input.alert.headerText || "Service modified";
  }

  return input.alert.headerText;
}

export function selectPreferredAlert(routeCanvas: RouteCanvasViewModel): NormalizedAlert | null {
  const alerts = routeCanvas.alerts || [];
  if (alerts.length === 0) {
    return null;
  }

  if (routeCanvas.state === "ready" && routeCanvas.primary.routeId) {
    const matchedAlert = alerts.find((alert) =>
      alert.entities.some(
        (entity) =>
          (entity.type === "route" || entity.type === "stop_on_route") &&
          entity.routeId === routeCanvas.primary.routeId
      )
    );
    if (matchedAlert) {
      return matchedAlert;
    }
  }

  return alerts[0] || null;
}

export function getPreferredAlertMessage(routeCanvas: RouteCanvasViewModel): string | null {
  const alert = selectPreferredAlert(routeCanvas);
  if (!alert) {
    return null;
  }

  return formatAlertMessage({
    alert,
    fallbackLine: routeCanvas.state === "ready" ? routeCanvas.primary.line : null,
  });
}

export function getPreferredAlertTone(routeCanvas: RouteCanvasViewModel): PreferredAlertTone | null {
  const alert = selectPreferredAlert(routeCanvas);
  if (!alert) {
    return null;
  }

  if (alert.effect === "REDUCED_SERVICE" || alert.effect === "MODIFIED_SERVICE") {
    return "advisory";
  }

  return "disruption";
}

export function preferredAlertDegradesConfidence(routeCanvas: RouteCanvasViewModel): boolean {
  const alert = selectPreferredAlert(routeCanvas);
  if (!alert) {
    return false;
  }

  if (alert.effect === "REDUCED_SERVICE" || alert.effect === "MODIFIED_SERVICE") {
    return false;
  }

  return (
    alert.effect === "NO_SERVICE" ||
    alert.effect === "SIGNIFICANT_DELAYS" ||
    alert.severityLevel === "SEVERE"
  );
}
