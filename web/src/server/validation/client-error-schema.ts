import type {
  ClientErrorPayload,
  ClientErrorRejectedResponse,
} from "../../shared/contracts/client-error-contract.js";
import { error, ok, type Result } from "../../shared/utils/result.js";

type ClientErrorValidationError = ClientErrorRejectedResponse["error"];

function isContextObject(value: unknown): value is Record<string, unknown> {
  return value == null || (typeof value === "object" && !Array.isArray(value));
}

export function validateClientErrorPayload(
  payload: unknown
): Result<ClientErrorPayload, ClientErrorValidationError> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return error("invalid payload");
  }

  const candidate = payload as Partial<ClientErrorPayload>;
  if (typeof candidate.message !== "string" || candidate.message.trim() === "") {
    return error("invalid payload");
  }
  if (candidate.type !== "error" && candidate.type !== "metric") {
    return error("invalid type");
  }
  if (!isContextObject(candidate.context)) {
    return error("invalid payload");
  }

  return ok({
    context: candidate.context,
    message: candidate.message.trim(),
    type: candidate.type,
  });
}
