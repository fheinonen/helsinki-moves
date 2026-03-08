import { getVoiceErrorCode } from "@client/features/voice/voice-errors";

export interface VoiceTypedFallbackPrompt {
  request(error: unknown): string | null;
}

const DEFAULT_TYPED_FALLBACK_EXAMPLE = "Example: Kamppi Helsinki, A-train, bus 52, 200";
const VOICE_UNSUPPORTED_PROMPT =
  "Voice recognition is unavailable right now. Type your location or line (number or letter) instead:";

export function shouldOfferVoiceTypedFallback(error: unknown): boolean {
  return getVoiceErrorCode(error) === "voice_unsupported";
}

export function buildVoiceTypedFallbackPromptMessage(error: unknown): string {
  const code = getVoiceErrorCode(error);
  const hint =
    code === "voice_unsupported"
      ? VOICE_UNSUPPORTED_PROMPT
      : "Could not capture your voice right now. Type your location:";

  return `${hint}\n${DEFAULT_TYPED_FALLBACK_EXAMPLE}`;
}

export function createBrowserVoiceTypedFallbackPrompt(input: {
  promptImpl?: ((message?: string, defaultValue?: string) => string | null) | null;
} = {}): VoiceTypedFallbackPrompt {
  const { promptImpl = null } = input;

  return {
    request(error) {
      if (!promptImpl || !shouldOfferVoiceTypedFallback(error)) {
        return null;
      }

      const response = promptImpl(buildVoiceTypedFallbackPromptMessage(error), "");
      const trimmed = String(response || "").trim();
      return trimmed || null;
    },
  };
}
