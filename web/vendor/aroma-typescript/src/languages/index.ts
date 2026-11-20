import type { Language } from "../language.ts";
import { python } from "./python.ts";
import { typescript } from "./typescript.ts";

/** The front ends an index uses unless it is given others. */
export const LANGUAGES: readonly Language[] = [python, typescript];
