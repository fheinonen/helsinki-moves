import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { detectVoiceCapability } from "@client/features/voice/voice-capability";

interface World {
  input?: Parameters<typeof detectVoiceCapability>[0];
  capability?: ReturnType<typeof detectVoiceCapability>;
}

defineFeature<World>(
  test,
  `
Feature: Voice capability detection

  Scenario: Voice capture is available when recording and microphone APIs exist
    Given the browser exposes media recording and microphone APIs
    When voice capability detection runs
    Then voice capture is available
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the browser exposes media recording and microphone APIs$/,
        run: ({ world }) => {
          world.input = {
            mediaDevices: {
              async getUserMedia() {
                return {} as MediaStream;
              },
            },
            MediaRecorderCtor: class FakeMediaRecorder {},
          };
        },
      },
      {
        pattern: /^When voice capability detection runs$/,
        run: ({ world }) => {
          if (!world.input) {
            throw new Error("Expected voice capability input");
          }
          world.capability = detectVoiceCapability(world.input);
        },
      },
      {
        pattern: /^Then voice capture is available$/,
        run: ({ assert, world }) => {
          assert.equal(world.capability?.available, true);
        },
      },
    ],
  }
);
