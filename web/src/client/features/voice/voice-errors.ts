export type VoiceErrorCode =
  | "voice_no_microphone"
  | "voice_no_speech"
  | "voice_not_understood"
  | "voice_permission_denied"
  | "voice_unsupported";

export interface VoiceError extends Error {
  code: VoiceErrorCode;
}

export function createVoiceError(code: VoiceErrorCode, message: string): VoiceError {
  const error = new Error(message) as VoiceError;
  error.code = code;
  return error;
}

export function getVoiceErrorCode(error: unknown): string {
  return String((error as { code?: unknown } | null)?.code || "")
    .trim()
    .toLowerCase();
}
