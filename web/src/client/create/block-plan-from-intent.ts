import type { BlockType, CanvasType } from "./canvas-types";
import { blockTypeSchema } from "./canvas-types";
import type { BlockPlan } from "./block-plan-schema";
import type { RouteCanvasViewModel } from "./canvas-view-model";
import { validateBlockPlan } from "./block-plan-rules";
import { getRouteSupportBlocks } from "./route-support-blocks";

export interface IntentBlockSelectionInput {
  destinationResolved: boolean;
  homeSaved: boolean;
  intentKind: "destination" | "home";
  proposedBlocks: string[];
}

export interface BlockPlanSelectionResult {
  canvasType: CanvasType;
  plan: BlockPlan;
}

function toCanvasType(intentKind: IntentBlockSelectionInput["intentKind"]): CanvasType {
  return intentKind === "home" ? "home_fast" : "destination_route";
}

function toKnownBlocks(proposedBlocks: string[]): BlockType[] {
  const blocks: BlockType[] = [];
  for (const proposedBlock of proposedBlocks) {
    const parsed = blockTypeSchema.safeParse(proposedBlock);
    if (parsed.success) {
      blocks.push(parsed.data);
    }
  }
  return blocks;
}

function getProposedBlocksForRouteCanvas(routeCanvas: RouteCanvasViewModel): BlockType[] {
  const blocks: BlockType[] = ["primary_route"];
  if (routeCanvas.state === "ready" && routeCanvas.backup) {
    blocks.push("backup_route");
  }
  return [...blocks, ...getRouteSupportBlocks(routeCanvas)];
}

export function createBlockPlanFromIntent(
  input: IntentBlockSelectionInput
): BlockPlanSelectionResult {
  const canvasType = toCanvasType(input.intentKind);
  const validation = validateBlockPlan({
    destinationResolved: input.destinationResolved,
    homeSaved: input.homeSaved,
    plan: {
      blocks: toKnownBlocks(input.proposedBlocks),
      canvasType,
    },
  });
  const fallbackPlan: BlockPlan = {
    blocks: input.intentKind === "destination"
      ? ["primary_route", "itinerary_details"]
      : ["primary_route"],
    canvasType,
  };

  return {
    canvasType,
    plan: validation.ok ? validation.plan : fallbackPlan,
  };
}

export function createBlockPlanForRouteCanvas(
  routeCanvas: RouteCanvasViewModel
): BlockPlanSelectionResult {
  return createBlockPlanFromIntent({
    destinationResolved: true,
    homeSaved: routeCanvas.canvasType === "home_fast",
    intentKind: routeCanvas.canvasType === "home_fast" ? "home" : "destination",
    proposedBlocks: getProposedBlocksForRouteCanvas(routeCanvas),
  });
}
