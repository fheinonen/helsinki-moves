import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { validateSpeechTranscribePayload } from "@server/validation/speech-schema";

interface World {
  payload?: unknown;
  result?: ReturnType<typeof validateSpeechTranscribePayload>;
}

defineFeature<World>(
  test,
  `
Feature: Speech transcribe payload validation

  Scenario: Speech transcribe payload rejects missing audio content
    Given a speech transcribe payload without content
    When speech transcribe payload validation runs
    Then speech transcribe validation error is invalid payload
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a speech transcribe payload without content$/,
        run: ({ world }) => {
          world.payload = {
            fileName: "voice.webm",
            mimeType: "audio/webm",
          };
        },
      },
      {
        pattern: /^When speech transcribe payload validation runs$/,
        run: ({ world }) => {
          world.result = validateSpeechTranscribePayload(world.payload);
        },
      },
      {
        pattern: /^Then speech transcribe validation error is invalid payload$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.ok, false);
          if (world.result?.ok !== false) {
            throw new Error("Expected speech validation to fail");
          }
          assert.equal(world.result.error, "invalid payload");
        },
      },
    ],
  }
);
