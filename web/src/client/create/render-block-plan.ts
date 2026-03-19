import type { Spec } from "@json-render/core";
import type { BlockPlan } from "./block-plan-schema";

interface SlotElement {
  children?: string[];
  props: Record<string, unknown>;
  type: "RouteBlock" | "Stack" | "SupportBlock";
}

function createBlockElement(input: { block: string; id: string; slot: string }): SlotElement {
  return {
    props: {
      block: input.block,
      slot: input.slot,
    },
    type: input.slot === "support" ? "SupportBlock" : "RouteBlock",
  };
}

export function renderBlockPlan(plan: BlockPlan): Spec {
  const elements: Spec["elements"] = {
    "canvas-shell": {
      children: ["primary-region", "secondary-region", "support-region"],
      props: {
        align: "stretch",
        direction: "vertical",
        gap: "md",
      },
      type: "Stack",
    },
    "primary-region": {
      props: {
        block: "primary_route",
        slot: "primary",
      },
      type: "RouteBlock",
    },
    "secondary-region": {
      props: {
        block: "backup_route",
        slot: "secondary",
      },
      type: "RouteBlock",
    },
    "support-region": {
      children: [],
      props: {
        align: "stretch",
        direction: "vertical",
        gap: "sm",
      },
      type: "Stack",
    },
  };

  for (const block of plan.blocks) {
    if (block === "primary_route") {
      elements["primary-region"] = createBlockElement({
        block,
        id: "primary-region",
        slot: "primary",
      });
      continue;
    }
    if (block === "backup_route") {
      elements["secondary-region"] = createBlockElement({
        block,
        id: "secondary-region",
        slot: "secondary",
      });
      continue;
    }

    if (
      block === "confidence_notice" ||
      block === "disruption_notice" ||
      block === "disruption_recovery" ||
      block === "service_note" ||
      block === "policy_recovery" ||
      block === "policy_switch" ||
      block === "route_explanation" ||
      block === "itinerary_details"
    ) {
      const childId = `support-${block.replace(/_/g, "-")}`;
      elements[childId] = createBlockElement({
        block,
        id: childId,
        slot: "support",
      });
      elements["support-region"].children?.push(childId);
    }
  }

  return {
    elements,
    root: "canvas-shell",
  };
}
