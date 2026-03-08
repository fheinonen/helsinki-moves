import type { SpeechTranscribeRequest } from "../../../shared/contracts/speech-contract.js";

const DEFAULT_TRANSCRIPTION_LANGUAGE = "fi";
const DEFAULT_AUDIO_FILE_NAME = "voice-query.webm";
const DEFAULT_AUDIO_MIME_TYPE = "audio/webm";
const DEFAULT_API_URL = "https://api.openai.com/v1/audio/transcriptions";
const TRANSCRIBE_TIMEOUT_MS = 7_000;

export interface SpeechTranscriptionService {
  transcribe(input: SpeechTranscribeRequest): Promise<string>;
}

function normalizeOptionalText(value: unknown): string {
  return String(value || "").trim();
}

function normalizeAudioFileName(fileName: string | undefined): string {
  const normalized = normalizeOptionalText(fileName).replace(/[^\w.-]+/g, "-");
  return normalized || DEFAULT_AUDIO_FILE_NAME;
}

function normalizeAudioMimeType(mimeType: string | undefined): string {
  return normalizeOptionalText(mimeType).toLowerCase() || DEFAULT_AUDIO_MIME_TYPE;
}

function decodeBase64AudioContent(content: string): ArrayBuffer {
  const decoded = Buffer.from(content, "base64");
  const buffer = new ArrayBuffer(decoded.length);
  const bytes = new Uint8Array(buffer);
  bytes.set(decoded);
  return buffer;
}

function createAudioFile(input: SpeechTranscribeRequest): File {
  return new File([decodeBase64AudioContent(input.content)], normalizeAudioFileName(input.fileName), {
    type: normalizeAudioMimeType(input.mimeType),
  });
}

function createRequestFormData(input: {
  audioFile: File;
  language: string;
  model: string;
}): FormData {
  const formData = new FormData();
  formData.append("file", input.audioFile, input.audioFile.name);
  formData.append("model", input.model);
  if (input.language) {
    formData.append("language", input.language);
  }
  return formData;
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function extractTranscript(payload: Record<string, unknown>): string {
  return normalizeOptionalText(payload.text || payload.transcript);
}

export function createSpeechTranscriptionService(input: {
  apiKey?: string;
  apiUrl?: string;
  fetchImpl?: typeof fetch;
  language?: string;
  model?: string;
  timeoutMs?: number;
} = {}): SpeechTranscriptionService | null {
  const apiKey = normalizeOptionalText(input.apiKey || process.env.SPEECH_TRANSCRIBE_API_KEY || process.env.OPENAI_API_KEY);
  const apiUrl = normalizeOptionalText(input.apiUrl || process.env.SPEECH_TRANSCRIBE_API_URL || DEFAULT_API_URL);
  const language = normalizeOptionalText(input.language || process.env.SPEECH_TRANSCRIBE_LANGUAGE || DEFAULT_TRANSCRIPTION_LANGUAGE);
  const model = normalizeOptionalText(input.model || process.env.SPEECH_TRANSCRIBE_MODEL);
  const fetchImpl = input.fetchImpl || fetch;
  const timeoutMs = input.timeoutMs || TRANSCRIBE_TIMEOUT_MS;

  if (!apiKey || !apiUrl || !model) {
    return null;
  }

  return {
    async transcribe(payload) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(apiUrl, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
          },
          body: createRequestFormData({
            audioFile: createAudioFile(payload),
            language,
            model,
          }),
          signal: controller.signal,
        });
        const responseJson = await readJsonResponse(response);
        if (!response.ok) {
          throw new Error(`Speech transcription request failed with HTTP ${response.status}`);
        }

        return extractTranscript(responseJson);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("Speech transcription request timed out");
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}
