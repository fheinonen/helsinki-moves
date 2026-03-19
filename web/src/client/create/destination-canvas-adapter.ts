import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { RoutePolicy } from "./intent-session";
import {
  assembleDestinationRouteCanvas,
  type RouteCanvasViewModel,
} from "./route-canvas-assembler";

export function createDestinationCanvasViewModel(input: {
  disruptionConfidenceAvailable?: boolean;
  nowMs: number;
  policy: RoutePolicy;
  responses: DeparturesSuccessResponse[];
  title: string;
}): RouteCanvasViewModel {
  return assembleDestinationRouteCanvas(input);
}
