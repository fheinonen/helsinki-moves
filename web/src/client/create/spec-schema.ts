import { z } from "zod";
import {
  COMPONENT_TYPES,
  createBoardModeSchema,
} from "./create-route-catalog";

export const componentTypeSchema = z.enum(COMPONENT_TYPES);

export const stateBindingSchema = z.object({
  $state: z.string(),
});

export const itemBindingSchema = z.object({
  $item: z.string(),
});

export const dynamicStringSchema = z.union([z.string(), stateBindingSchema, itemBindingSchema]);
export const dynamicNumberSchema = z.union([z.number(), stateBindingSchema, itemBindingSchema]);

export const repeatSchema = z.object({
  key: z.string(),
  statePath: z.string(),
});

export const generatedElementSchema = z.object({
  children: z.array(z.string()).optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  repeat: repeatSchema.optional(),
  type: componentTypeSchema.optional(),
  visible: z.unknown().optional(),
});

export const generatedSpecSchema = z.object({
  elements: z.record(z.string(), generatedElementSchema).default({}),
  root: z.string().optional(),
});

export type GeneratedElement = z.infer<typeof generatedElementSchema>;
export type GeneratedSpec = z.infer<typeof generatedSpecSchema>;

export const stopHeaderSpecPropsSchema = z.object({
  code: z.union([stateBindingSchema, z.null()]).optional(),
  name: stateBindingSchema,
  track: z.union([stateBindingSchema, z.null()]).optional(),
});

export const departureRowSpecPropsSchema = z.object({
  destination: dynamicStringSchema,
  groupStart: z.union([z.boolean(), stateBindingSchema, itemBindingSchema]).optional(),
  line: dynamicStringSchema,
  minutes: dynamicNumberSchema,
  mode: z.union([createBoardModeSchema, stateBindingSchema, itemBindingSchema]),
  modeGroupLabel: z.union([dynamicStringSchema, z.null()]).optional(),
  modeGroupSummary: z.union([dynamicStringSchema, z.null()]).optional(),
  platformLabel: z.union([dynamicStringSchema, z.null()]).optional(),
  stopLabel: z.union([dynamicStringSchema, z.null()]).optional(),
});

export const modeGroupHeaderSpecPropsSchema = z.object({
  label: dynamicStringSchema,
  summary: z.union([dynamicStringSchema, z.null()]).optional(),
});

export const routeBlockSpecPropsSchema = z.object({
  block: z.enum(["backup_route", "primary_route"]),
  slot: z.enum(["primary", "secondary"]),
});

export const supportBlockSpecPropsSchema = z.object({
  block: z.enum([
    "confidence_notice",
    "disruption_notice",
    "disruption_recovery",
    "service_note",
    "policy_recovery",
    "policy_switch",
    "route_explanation",
    "itinerary_details",
  ]),
  slot: z.literal("support"),
});

export const cardSpecPropsSchema = z.object({
  centered: z.boolean().nullable().optional(),
  description: z.string().nullable().optional(),
  maxWidth: z.enum(["sm", "md", "lg", "full"]).nullable().optional(),
  title: z.string().nullable().optional(),
});

export const stackSpecPropsSchema = z.object({
  align: z.enum(["start", "center", "end", "stretch"]).nullable().optional(),
  direction: z.enum(["horizontal", "vertical"]).nullable().optional(),
  gap: z.enum(["none", "sm", "md", "lg"]).nullable().optional(),
  justify: z.enum(["start", "center", "end", "between", "around"]).nullable().optional(),
});
