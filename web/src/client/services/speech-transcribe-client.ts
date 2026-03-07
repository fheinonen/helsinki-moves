import type { SpeechTranscribeErrorResponse, SpeechTranscribeRequest, SpeechTranscribeSuccessResponse } from "@shared/contracts/speech-contract";
import { createVoiceError } from "@client/features/voice/voice-errors";

export interface SpeechTranscribeClient {
  transcribe(payload: SpeechTranscribeRequest): Promise<string>;
}

function isSuccessPayload(value: unknown): value is SpeechTranscribeSuccessResponse {
  return typeof value === "object" && value !== null && "transcript" in value;
}

function isErrorPayload(value: unknown): value is SpeechTranscribeErrorResponse {
  return typeof value === "object" && value !== null && "error" in value;
}

function mapSpeechTranscribeError(
  status: number,
  message: string
): Error {
  if ([404, 405, 501, 503].includes(status)) {
    return createVoiceError(
      "voice_unsupported",
      "Voice recognition is unavailable right now."
    );
  }

  const normalizedMessage = String(message || "")
    .trim()
    .toLowerCase();
  if (status === 400 || status === 422 || normalizedMessage.includes("no speech")) {
    return createVoiceError("voice_no_speech", "No speech detected.");
  }

  return createVoiceError(
    "voice_not_understood",
    message || "Could not transcribe speech"
  );
}

export function createBrowserSpeechTranscribeClient(input: {
  fetchImpl?: typeof fetch;
} = {}): SpeechTranscribeClient {
  const fetchImpl = input.fetchImpl || fetch;

  return {
    async transcribe(payload) {
      const response = await fetchImpl("/api/v1/speech-transcribe", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const json = (await response.json()) as SpeechTranscribeSuccessResponse | SpeechTranscribeErrorResponse;
      if (!response.ok) {
        throw mapSpeechTranscribeError(
          response.status,
          isErrorPayload(json) ? json.error || "" : ""
        );
      }
      return isSuccessPayload(json) ? json.transcript : "";
    },
  };
}
