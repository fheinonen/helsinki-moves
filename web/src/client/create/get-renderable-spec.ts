import type { GeneratedElement, GeneratedSpec } from "./spec-schema";
import { generatedSpecSchema } from "./spec-schema";

function cloneRenderableTree(
  key: string,
  elements: GeneratedSpec["elements"],
  nextElements: GeneratedSpec["elements"]
): GeneratedElement | null {
  const element = elements[key];
  if (!element) {
    return null;
  }

  const nextChildren = (element.children || []).filter((childKey) => {
    if (nextElements[childKey]) {
      return true;
    }
    const child = cloneRenderableTree(childKey, elements, nextElements);
    return child !== null;
  });

  const nextElement: GeneratedElement = { ...element };
  if (element.children) {
    nextElement.children = nextChildren;
  }
  nextElements[key] = nextElement;
  return nextElement;
}

export function getRenderableSpec(input: unknown): GeneratedSpec | null {
  const parsed = generatedSpecSchema.safeParse(input);
  if (!parsed.success) {
    return null;
  }

  const spec = parsed.data;
  if (!spec.root || !spec.elements[spec.root]) {
    return null;
  }

  const elements: GeneratedSpec["elements"] = {};
  cloneRenderableTree(spec.root, spec.elements, elements);
  return {
    elements,
    root: spec.root,
  };
}
