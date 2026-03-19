import { z } from "zod";
import { blockTypeSchema, canvasTypeSchema } from "./canvas-types";

export const blockPlanSchema = z.object({
  blocks: z.array(blockTypeSchema).min(1).max(6),
  canvasType: canvasTypeSchema,
});

export type BlockPlan = z.infer<typeof blockPlanSchema>;
