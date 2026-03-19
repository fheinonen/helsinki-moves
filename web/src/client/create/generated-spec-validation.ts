import { autoFixSpec, deepMergeSpec, validateSpec, type Spec } from "@json-render/core";
import { defaultSpec } from "./default-spec";
import { captureInvalidGeneratedSpec } from "./invalid-generated-spec-capture";
import type { GeneratedElement, GeneratedSpec } from "./spec-schema";
import {
  cardSpecPropsSchema,
  departureRowSpecPropsSchema,
  generatedSpecSchema,
  modeGroupHeaderSpecPropsSchema,
  routeBlockSpecPropsSchema,
  stackSpecPropsSchema,
  stopHeaderSpecPropsSchema,
  supportBlockSpecPropsSchema,
} from "./spec-schema";

type ValidationResult =
  | { ok: true; spec: GeneratedSpec }
  | { error: string; ok: false; spec?: undefined };

type CreateRouteSpecValidationResult =
  | { ok: true; spec: Spec }
  | { error: string; ok: false; spec?: undefined };

function getFirstErrorMessage(issues: Array<{ message: string }>): string {
  return issues[0]?.message || "Generated spec is invalid.";
}

export function sanitizeCreateRouteSpec(input: Spec): Spec {
  const forbiddenKeys = new Set(
    Object.entries(input.elements || {})
      .filter(([, element]) => element?.type === "StopHeader")
      .map(([key]) => key)
  );

  if (forbiddenKeys.size === 0) {
    return input;
  }

  const nextElements = Object.fromEntries(
    Object.entries(input.elements || {})
      .filter(([key]) => !forbiddenKeys.has(key))
      .map(([key, element]) => [
        key,
        {
          ...element,
          children: element.children?.filter((childKey) => !forbiddenKeys.has(childKey)),
        },
      ])
  );

  return {
    ...input,
    elements: nextElements,
  };
}

function validateElementProps(element: GeneratedElement): string | null {
  if (element.type === "Card") {
    return cardSpecPropsSchema.safeParse(element.props || {}).success
      ? null
      : "Card props are invalid for the create route.";
  }
  if (element.type === "Stack") {
    return stackSpecPropsSchema.safeParse(element.props || {}).success
      ? null
      : "Stack props are invalid for the create route.";
  }
  if (element.type === "ModeGroupHeader") {
    return modeGroupHeaderSpecPropsSchema.safeParse(element.props || {}).success
      ? null
      : "ModeGroupHeader props are invalid for the create route.";
  }
  if (element.type === "StopHeader") {
    return stopHeaderSpecPropsSchema.safeParse(element.props || {}).success
      ? "StopHeader is not supported on create-route generated boards."
      : "StopHeader is not supported on create-route generated boards.";
  }
  if (element.type === "DepartureRow") {
    return departureRowSpecPropsSchema.safeParse(element.props || {}).success
      ? null
      : "DepartureRow props are invalid for the create route.";
  }
  if (element.type === "RouteBlock") {
    return routeBlockSpecPropsSchema.safeParse(element.props || {}).success
      ? null
      : "RouteBlock props are invalid for the create route.";
  }
  if (element.type === "SupportBlock") {
    return supportBlockSpecPropsSchema.safeParse(element.props || {}).success
      ? null
      : "SupportBlock props are invalid for the create route.";
  }
  return null;
}

function validateSemanticRules(spec: GeneratedSpec): string | null {
  if (!spec.root) {
    return "Generated spec is missing a root element.";
  }

  const visit = (key: string, insideDeparturesRepeat: boolean): string | null => {
    const element = spec.elements[key];
    if (!element) {
      return null;
    }

    const propsError = validateElementProps(element);
    if (propsError) {
      return propsError;
    }

    const nextInsideDeparturesRepeat =
      insideDeparturesRepeat || element.repeat?.statePath === "/departures";
    if (element.type === "DepartureRow" && !nextInsideDeparturesRepeat) {
      return "DepartureRow must stay inside the /departures repeat.";
    }

    for (const childKey of element.children || []) {
      const childError = visit(childKey, nextInsideDeparturesRepeat);
      if (childError) {
        return childError;
      }
    }

    return null;
  };

  return visit(spec.root, false);
}

function normalizeSpecRoot(spec: Spec): Spec {
  const trimmedRoot = typeof spec.root === "string" ? spec.root.trim() : "";
  const root = trimmedRoot || defaultSpec.root;
  return {
    ...spec,
    root,
  };
}

function isNoOpPatch(spec: GeneratedSpec): boolean {
  const hasElements = Object.keys(spec.elements || {}).length > 0;
  const trimmedRoot = typeof spec.root === "string" ? spec.root.trim() : "";
  const changesRoot = Boolean(trimmedRoot) && trimmedRoot !== defaultSpec.root;
  return !hasElements && !changesRoot;
}

function invalidResult(input: unknown, error: string): ValidationResult {
  captureInvalidGeneratedSpec(input, error);
  return {
    error,
    ok: false,
  };
}

function invalidCreateRouteSpecResult(input: unknown, error: string): CreateRouteSpecValidationResult {
  captureInvalidGeneratedSpec(input, error);
  return {
    error,
    ok: false,
  };
}

export function validateCreateRouteSpec(input: Spec): CreateRouteSpecValidationResult {
  const fixedSpec = autoFixSpec(normalizeSpecRoot(sanitizeCreateRouteSpec(input))).spec as GeneratedSpec;
  const structuralValidation = validateSpec(fixedSpec as Spec);
  if (!structuralValidation.valid) {
    return invalidCreateRouteSpecResult(input, getFirstErrorMessage(structuralValidation.issues));
  }

  const semanticError = validateSemanticRules(fixedSpec);
  if (semanticError) {
    return invalidCreateRouteSpecResult(input, semanticError);
  }

  return {
    ok: true,
    spec: fixedSpec as Spec,
  };
}

export function validateGeneratedSpec(input: unknown): ValidationResult {
  const parsed = generatedSpecSchema.safeParse(input);
  if (!parsed.success) {
    return invalidResult(input, "Generated spec is invalid.");
  }

  if (isNoOpPatch(parsed.data)) {
    return invalidResult(input, "Generated board made no changes.");
  }

  const mergedSpec = deepMergeSpec(
    defaultSpec as unknown as Record<string, unknown>,
    parsed.data as unknown as Record<string, unknown>
  ) as unknown as Spec;
  const validation = validateCreateRouteSpec(mergedSpec);
  if (!validation.ok) {
    return {
      error: validation.error,
      ok: false,
    };
  }
  return {
    ok: true,
    spec: validation.spec as GeneratedSpec,
  };
}
