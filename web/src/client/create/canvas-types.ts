import { z } from "zod";

export const canvasTypeSchema = z.enum(["home_fast", "destination_route"]);
export const blockTypeSchema = z.enum([
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
  "clarification_choices",
]);

export type CanvasType = z.infer<typeof canvasTypeSchema>;
export type BlockType = z.infer<typeof blockTypeSchema>;
