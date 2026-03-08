import { error, ok, type Result } from "../../shared/utils/result.js";
import type { SpeechTranscribeRequest } from "../../shared/contracts/speech-contract.js";

type ValidationError = "invalid payload";

function normalizeOptionalText(value: unknown): string {
  return String(value || "").trim();
}

export function validateSpeechTranscribePayload(
  payload: unknown
): Result<SpeechTranscribeRequest, ValidationError> {
  if (!payload || typeof payload !== "object") {
    return error("invalid payload");
  }

  const content = normalizeOptionalText((payload as SpeechTranscribeRequest).content);
  if (!content) {
    return error("invalid payload");
  }

  return ok({
    content,
    fileName: normalizeOptionalText((payload as SpeechTranscribeRequest).fileName) || undefined,
    mimeType: normalizeOptionalText((payload as SpeechTranscribeRequest).mimeType) || undefined,
  });
}
