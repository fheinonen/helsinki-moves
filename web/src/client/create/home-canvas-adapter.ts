import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { RoutePolicy } from "./intent-session";
import { assembleHomeRouteCanvas, type RouteCanvasViewModel } from "./route-canvas-assembler";

export function createHomeCanvasViewModel(input: {
  disruptionConfidenceAvailable?: boolean;
  nowMs: number;
  policy: RoutePolicy;
  responses: DeparturesSuccessResponse[];
}): RouteCanvasViewModel {
  return assembleHomeRouteCanvas(input);
}
