import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createSpeechTranscriptionService } from "@server/services/voice/transcribe-service";
import type { SpeechTranscriptionService } from "@server/services/voice/transcribe-service";

interface World {
  errorMessage?: string;
  service?: SpeechTranscriptionService | null;
}

defineFeature<World>(
  test,
  `
Feature: Speech transcription timeout

  Scenario: Speech transcription times out with a deterministic error
    Given the speech transcription service has a hanging upstream
    When speech transcription is requested
    Then the speech transcription error is Speech transcription request timed out
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the speech transcription service has a hanging upstream$/,
        run: ({ world }) => {
          world.service = createSpeechTranscriptionService({
            apiKey: "test-key",
            apiUrl: "https://example.test/audio/transcriptions",
            fetchImpl: async (_url, init) =>
              new Promise((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => {
                  const error = new Error("aborted");
                  error.name = "AbortError";
                  reject(error);
                });
              }),
            model: "gpt-4o-mini-transcribe",
            timeoutMs: 1,
          });
        },
      },
      {
        pattern: /^When speech transcription is requested$/,
        run: async ({ world }) => {
          if (!world.service) {
            throw new Error("Expected speech transcription service");
          }

          try {
            await world.service.transcribe({
              content: "ZmFrZQ==",
              fileName: "voice.webm",
              mimeType: "audio/webm",
            });
          } catch (error) {
            world.errorMessage = error instanceof Error ? error.message : String(error);
          }
        },
      },
      {
        pattern: /^Then the speech transcription error is Speech transcription request timed out$/,
        run: ({ assert, world }) => {
          assert.equal(world.errorMessage, "Speech transcription request timed out");
        },
      },
    ],
  }
);
