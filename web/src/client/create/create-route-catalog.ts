import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";
import { z } from "zod";

export const COMPONENT_TYPES = [
  "Card",
  "Stack",
  "StopHeader",
  "ModeGroupHeader",
  "DepartureRow",
  "RouteBlock",
  "SupportBlock",
] as const;
export const CREATE_ROUTE_COMPONENT_DESCRIPTIONS = {
  Card: "Container card for the generated board shell.",
  DepartureRow: "Single live departure row with route, destination, mode, and minutes.",
  ModeGroupHeader: "Visual divider for a contiguous mode section in the live departure list.",
  RouteBlock: "Deterministic route recommendation block for primary or backup route slots.",
  Stack: "Vertical or horizontal layout wrapper for generated board sections.",
  StopHeader: "Stop header bound to the current stop name and optional platform code.",
  SupportBlock: "Deterministic support block such as explanation or policy switch.",
} as const;

export const createBoardModeSchema = z.enum(["BUS", "FERRY", "RAIL", "SUBWAY", "TRAM"]);

export const stopHeaderPropsSchema = z.object({
  code: z.string().nullable(),
  name: z.string(),
  track: z.string().nullable().optional(),
});

export const departureRowPropsSchema = z.object({
  destination: z.string(),
  groupStart: z.boolean().optional(),
  line: z.string(),
  minutes: z.number(),
  mode: createBoardModeSchema,
  modeGroupLabel: z.string().nullable().optional(),
  modeGroupSummary: z.string().nullable().optional(),
  platformLabel: z.string().nullable().optional(),
  stopLabel: z.string().nullable().optional(),
});

export const modeGroupHeaderPropsSchema = z.object({
  label: z.string(),
  summary: z.string().nullable().optional(),
});

export const routeBlockPropsSchema = z.object({
  block: z.enum(["backup_route", "primary_route"]),
  slot: z.enum(["primary", "secondary"]),
});

export const supportBlockPropsSchema = z.object({
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

export type StopHeaderProps = z.infer<typeof stopHeaderPropsSchema>;
export type DepartureRowProps = z.infer<typeof departureRowPropsSchema>;
export type ModeGroupHeaderProps = z.infer<typeof modeGroupHeaderPropsSchema>;
export type RouteBlockProps = z.infer<typeof routeBlockPropsSchema>;
export type SupportBlockProps = z.infer<typeof supportBlockPropsSchema>;

export const createRouteCatalog = defineCatalog(schema, {
  actions: {},
  components: {
    Card: shadcnComponentDefinitions.Card,
    DepartureRow: {
      description: CREATE_ROUTE_COMPONENT_DESCRIPTIONS.DepartureRow,
      example: {
        destination: "Lasipalatsi",
        groupStart: true,
        line: "7",
        minutes: 4,
        mode: "TRAM",
        modeGroupLabel: "Tram",
        modeGroupSummary: "Line 7",
        platformLabel: "Track 41",
        stopLabel: "Päärautatieasema",
      },
      props: departureRowPropsSchema,
    },
    ModeGroupHeader: {
      description: CREATE_ROUTE_COMPONENT_DESCRIPTIONS.ModeGroupHeader,
      example: {
        label: "Tram",
        summary: "Lines 6, 2",
      },
      props: modeGroupHeaderPropsSchema,
    },
    RouteBlock: {
      description: CREATE_ROUTE_COMPONENT_DESCRIPTIONS.RouteBlock,
      example: {
        block: "primary_route",
        slot: "primary",
      },
      props: routeBlockPropsSchema,
    },
    Stack: shadcnComponentDefinitions.Stack,
    StopHeader: {
      description: CREATE_ROUTE_COMPONENT_DESCRIPTIONS.StopHeader,
      example: {
        code: "H0401",
        name: "Rautatientori",
        track: "Platform 1",
      },
      props: stopHeaderPropsSchema,
    },
    SupportBlock: {
      description: CREATE_ROUTE_COMPONENT_DESCRIPTIONS.SupportBlock,
      example: {
        block: "route_explanation",
        slot: "support",
      },
      props: supportBlockPropsSchema,
    },
  },
});
