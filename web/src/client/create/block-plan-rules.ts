import type { BlockPlan } from "./block-plan-schema";
import { blockPlanSchema } from "./block-plan-schema";
import type { BlockType, CanvasType } from "./canvas-types";

export const allowedBlocksByCanvas: Record<CanvasType, BlockType[]> = {
  destination_route: [
    "primary_route",
    "backup_route",
    "confidence_notice",
    "disruption_notice",
    "disruption_recovery",
    "service_note",
    "policy_recovery",
    "policy_switch",
    "route_explanation",
    "itinerary_details",
    "clarification_choices",
  ],
  home_fast: [
    "primary_route",
    "backup_route",
    "confidence_notice",
    "disruption_notice",
    "disruption_recovery",
    "service_note",
    "policy_recovery",
    "policy_switch",
    "route_explanation",
    "itinerary_details",
    "home_setup",
  ],
};

export const requiredBlocksByCanvas: Record<CanvasType, BlockType[]> = {
  destination_route: ["primary_route"],
  home_fast: ["primary_route"],
};

const canonicalBlockOrder: BlockType[] = [
  "home_setup",
  "clarification_choices",
  "primary_route",
  "backup_route",
  "confidence_notice",
  "disruption_notice",
  "disruption_recovery",
  "service_note",
  "policy_recovery",
  "route_explanation",
  "itinerary_details",
  "policy_switch",
];

export function normalizeBlockOrder(blocks: BlockType[]): BlockType[] {
  return [...new Set(blocks)].sort(
    (left, right) => canonicalBlockOrder.indexOf(left) - canonicalBlockOrder.indexOf(right)
  );
}

function forbiddenBlocksForState(input: {
  canvasType: CanvasType;
  destinationResolved: boolean;
  homeSaved: boolean;
}): Set<BlockType> {
  const forbidden = new Set<BlockType>();

  if (input.canvasType === "home_fast" && input.homeSaved) {
    forbidden.add("home_setup");
  }

  if (input.canvasType === "destination_route" && input.destinationResolved) {
    forbidden.add("clarification_choices");
  }

  return forbidden;
}

export type BlockPlanValidationResult =
  | { ok: true; plan: BlockPlan }
  | { error: string; ok: false };

export function validateBlockPlan(input: {
  destinationResolved: boolean;
  homeSaved: boolean;
  plan: BlockPlan;
}): BlockPlanValidationResult {
  const parsed = blockPlanSchema.safeParse(input.plan);
  if (!parsed.success) {
    return { error: "Invalid block plan shape", ok: false };
  }

  const allowed = new Set(allowedBlocksByCanvas[parsed.data.canvasType]);
  const forbidden = forbiddenBlocksForState({
    canvasType: parsed.data.canvasType,
    destinationResolved: input.destinationResolved,
    homeSaved: input.homeSaved,
  });

  const filtered = normalizeBlockOrder(
    parsed.data.blocks.filter((block) => allowed.has(block) && !forbidden.has(block))
  );

  for (const required of requiredBlocksByCanvas[parsed.data.canvasType]) {
    if (!filtered.includes(required)) {
      filtered.unshift(required);
    }
  }

  const normalized = normalizeBlockOrder(filtered).slice(0, 6);
  if (normalized.length === 0) {
    return { error: "No valid blocks remain after validation", ok: false };
  }

  return {
    ok: true,
    plan: {
      blocks: normalized,
      canvasType: parsed.data.canvasType,
    },
  };
}
