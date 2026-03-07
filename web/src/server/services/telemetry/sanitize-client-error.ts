import type { ClientErrorPayload } from "../../../shared/contracts/client-error-contract.js";

const SENSITIVE_KEYS = ["authorization", "cookie", "password", "token"];
const MAX_DEPTH = 3;

function sanitizeValue(value: unknown, depth: number): unknown {
  if (Array.isArray(value)) {
    if (depth > MAX_DEPTH) {
      return value.map(() => "[Truncated]");
    }
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (depth > MAX_DEPTH) {
    return Object.fromEntries(Object.keys(value).map((key) => [key, "[Truncated]"]));
  }

  const sanitizedEntries = Object.entries(value).map(([key, entryValue]) => {
    if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
      return [key, "[Redacted]"];
    }
    return [key, sanitizeValue(entryValue, depth + 1)];
  });

  return Object.fromEntries(sanitizedEntries);
}

export function sanitizeClientErrorPayload(payload: ClientErrorPayload): ClientErrorPayload {
  return {
    ...payload,
    context:
      payload.context && typeof payload.context === "object"
        ? (sanitizeValue(payload.context, 1) as Record<string, unknown>)
        : undefined,
  };
}
