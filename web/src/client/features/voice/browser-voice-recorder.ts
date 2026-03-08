import type { SpeechTranscribeRequest } from "@shared/contracts/speech-contract";
import { createVoiceError } from "@client/features/voice/voice-errors";

const DEFAULT_CAPTURE_DURATION_MS = 4500;
const DEFAULT_CAPTURE_TIMESLICE_MS = 250;
const DEFAULT_FILE_NAME_ROOT = "voice-query";
const DEFAULT_MIME_TYPE = "audio/webm";
export const PREFERRED_VOICE_MICROPHONE_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    autoGainControl: { ideal: true },
    channelCount: { ideal: 1 },
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    sampleRate: { ideal: 16000 },
  },
};
const DEFAULT_PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

export interface VoiceRecorder {
  capture(): Promise<SpeechTranscribeRequest>;
}

type TimeoutHandle = ReturnType<typeof setTimeout>;

interface CreateBrowserVoiceRecorderOptions {
  captureDurationMs?: number;
  clearTimeoutImpl?: (timeoutId: TimeoutHandle) => void;
  fileName?: string;
  MediaRecorderCtor?: typeof MediaRecorder;
  mediaDevices?: {
    getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  } | null;
  preferredMimeTypes?: string[];
  setTimeoutImpl?: (callback: () => void, delay: number) => TimeoutHandle;
}

function stopMediaStream(stream: MediaStream | null): void {
  const tracks = typeof stream?.getTracks === "function" ? stream.getTracks() : [];
  for (const track of tracks) {
    try {
      track.stop();
    } catch {
      // Ignore track cleanup failures.
    }
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer =
    typeof blob.arrayBuffer === "function"
      ? await blob.arrayBuffer()
      : await new Response(blob).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function getSupportedMimeType(
  MediaRecorderCtor: typeof MediaRecorder,
  preferredMimeTypes: string[]
): string {
  if (typeof MediaRecorderCtor.isTypeSupported !== "function") {
    return "";
  }

  return preferredMimeTypes.find((mimeType) => MediaRecorderCtor.isTypeSupported(mimeType)) || "";
}

function normalizeAudioMimeType(mimeType: string): string {
  return String(mimeType || "")
    .trim()
    .toLowerCase()
    .split(";")[0] || DEFAULT_MIME_TYPE;
}

function getDefaultAudioFileName(mimeType: string): string {
  const normalizedMimeType = normalizeAudioMimeType(mimeType);
  if (normalizedMimeType === "audio/mp4") {
    return `${DEFAULT_FILE_NAME_ROOT}.m4a`;
  }
  if (normalizedMimeType === "audio/ogg") {
    return `${DEFAULT_FILE_NAME_ROOT}.ogg`;
  }
  return `${DEFAULT_FILE_NAME_ROOT}.webm`;
}

function buildAudioFileName(fileName: string | undefined, mimeType: string): string {
  return String(fileName || "").trim() || getDefaultAudioFileName(mimeType);
}

function buildCapturedAudioBlob(chunks: Blob[], fallbackMimeType: string): Blob {
  const chunkMimeType = chunks.find((chunk) => String(chunk.type || "").trim())?.type || fallbackMimeType;
  return new Blob(chunks, { type: chunkMimeType });
}

function mapMicrophonePreflightError(error: unknown): Error {
  const errorName = String((error as { name?: unknown } | null)?.name || "")
    .trim()
    .toLowerCase();

  if (errorName === "notallowederror" || errorName === "securityerror") {
    return createVoiceError("voice_permission_denied", "Microphone permission denied.");
  }

  if (
    errorName === "notfounderror" ||
    errorName === "devicesnotfounderror" ||
    errorName === "notreadableerror" ||
    errorName === "trackstarterror"
  ) {
    return createVoiceError(
      "voice_no_microphone",
      "No microphone was found for voice location."
    );
  }

  return createVoiceError("voice_not_understood", "Unable to access microphone.");
}

export function createBrowserVoiceRecorder(
  options: CreateBrowserVoiceRecorderOptions
): VoiceRecorder {
  const {
    captureDurationMs = DEFAULT_CAPTURE_DURATION_MS,
    clearTimeoutImpl = clearTimeout,
    fileName,
    MediaRecorderCtor,
    mediaDevices,
    preferredMimeTypes = DEFAULT_PREFERRED_MIME_TYPES,
    setTimeoutImpl = setTimeout,
  } = options;

  return {
    async capture() {
      if (!MediaRecorderCtor || typeof mediaDevices?.getUserMedia !== "function") {
        throw createVoiceError("voice_unsupported", "Voice recording is unavailable.");
      }

      let microphoneStream: MediaStream;
      try {
        microphoneStream = await mediaDevices.getUserMedia(
          PREFERRED_VOICE_MICROPHONE_CONSTRAINTS
        );
      } catch (error) {
        throw mapMicrophonePreflightError(error);
      }

      return new Promise<SpeechTranscribeRequest>((resolve, reject) => {
        const chunks: Blob[] = [];
        let settled = false;
        const mimeType = getSupportedMimeType(MediaRecorderCtor, preferredMimeTypes) || DEFAULT_MIME_TYPE;
        let postStopFinalizeTimeoutId: ReturnType<typeof setTimeout> | null = null;

        const cleanup = () => {
          clearTimeoutImpl(stopTimeoutId);
          if (postStopFinalizeTimeoutId !== null) {
            clearTimeout(postStopFinalizeTimeoutId);
          }
          stopMediaStream(microphoneStream);
        };

        const finish = async (
          callback: (value: SpeechTranscribeRequest | Error) => void,
          value: Blob | Error
        ) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();

          if (value instanceof Error) {
            callback(value);
            return;
          }

          callback({
            content: await blobToBase64(value),
            fileName: buildAudioFileName(fileName, value.type || mimeType),
            mimeType: value.type || mimeType,
          });
        };

        const finishFromChunks = () => {
          if (chunks.length === 0) {
            void finish(
              reject as (value: SpeechTranscribeRequest | Error) => void,
              createVoiceError("voice_no_speech", "No speech detected.")
            );
            return;
          }
          void finish(
            resolve as (value: SpeechTranscribeRequest | Error) => void,
            buildCapturedAudioBlob(chunks, mimeType)
          );
        };

        let recorder: MediaRecorder;
        try {
          recorder = mimeType
            ? new MediaRecorderCtor(microphoneStream, { mimeType })
            : new MediaRecorderCtor(microphoneStream);
        } catch {
          cleanup();
          reject(createVoiceError("voice_unsupported", "Voice recording is unavailable."));
          return;
        }

        const stopTimeoutId = setTimeoutImpl(() => {
          try {
            if (typeof recorder.requestData === "function") {
              recorder.requestData();
            }
          } catch {
            // Ignore requestData failures.
          }
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
        }, captureDurationMs);

        recorder.addEventListener("dataavailable", (event) => {
          const data = (event as Event & { data?: Blob }).data;
          if (data && data.size > 0) {
            chunks.push(data);
          }
          if (recorder.state === "inactive") {
            if (postStopFinalizeTimeoutId !== null) {
              clearTimeout(postStopFinalizeTimeoutId);
              postStopFinalizeTimeoutId = null;
            }
            finishFromChunks();
          }
        });
        recorder.addEventListener("error", () => {
          void finish(
            reject as (value: SpeechTranscribeRequest | Error) => void,
            createVoiceError("voice_not_understood", "Voice recording failed.")
          );
        });
        recorder.addEventListener("stop", () => {
          postStopFinalizeTimeoutId = setTimeout(() => {
            postStopFinalizeTimeoutId = null;
            finishFromChunks();
          }, 0);
        });

        try {
          recorder.start(DEFAULT_CAPTURE_TIMESLICE_MS);
        } catch {
          cleanup();
          reject(createVoiceError("voice_not_understood", "Voice recording failed."));
        }
      });
    },
  };
}
