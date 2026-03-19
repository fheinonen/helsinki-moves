import type { BlockType } from "./canvas-types";
import type { RouteCanvasViewModel } from "./canvas-view-model";
import { describeRouteAlertRenderSupport } from "./route-alert-render-support";

export function getRouteSupportBlocks(routeCanvas: RouteCanvasViewModel): BlockType[] {
  const blocks: BlockType[] = [];
  const routeAlertSupport = describeRouteAlertRenderSupport(routeCanvas);

  if (routeAlertSupport.showDisruptionNotice) {
    blocks.push("disruption_notice");
  } else if (routeCanvas.degraded) {
    blocks.push("confidence_notice");
  }

  if (routeAlertSupport.serviceNote) {
    blocks.push("service_note");
  }

  blocks.push("route_explanation");

  if (routeCanvas.state === "no_route" && routeCanvas.reason === "policy_restricted") {
    blocks.push("policy_recovery");
  }

  if (routeCanvas.state === "no_route" && routeCanvas.reason === "service_disruption") {
    blocks.push("disruption_recovery");
  }

  if (routeCanvas.state === "ready" && routeCanvas.primary.itineraryLegs?.length) {
    blocks.push("itinerary_details");
  }

  blocks.push("policy_switch");
  return blocks;
}
