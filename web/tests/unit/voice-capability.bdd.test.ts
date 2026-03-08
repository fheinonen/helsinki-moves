import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  detectVoiceCapability,
  getVoiceActionLabel,
} from "@client/features/voice/voice-capability";

interface World {
  actionLabel?: string;
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

  Scenario: Voice capture is unavailable without a recorder constructor
    Given the browser exposes microphone APIs without media recording
    When voice capability detection runs
    Then voice capture is unavailable

  Scenario: Voice action labels reflect the current voice phase
    Given voice availability is checking and voice phase is idle
    When the voice action label is resolved
    Then the voice action label is Checking Voice...

  Scenario: Listening voice phase overrides availability labels
    Given voice availability is unavailable and voice phase is listening
    When the voice action label is resolved
    Then the voice action label is Listening...
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
        pattern: /^Given the browser exposes microphone APIs without media recording$/,
        run: ({ world }) => {
          world.input = {
            mediaDevices: {
              async getUserMedia() {
                return {} as MediaStream;
              },
            },
            MediaRecorderCtor: null,
          };
        },
      },
      {
        pattern: /^Given voice availability is (available|checking|unavailable) and voice phase is (idle|listening|processing)$/,
        run: ({ args, world }) => {
          world.actionLabel = getVoiceActionLabel({
            availability: args[0] as "available" | "checking" | "unavailable",
            phase: args[1] as "idle" | "listening" | "processing",
          });
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
      {
        pattern: /^Then voice capture is unavailable$/,
        run: ({ assert, world }) => {
          assert.equal(world.capability?.available, false);
        },
      },
      {
        pattern: /^When the voice action label is resolved$/,
        run: () => {},
      },
      {
        pattern: /^Then the voice action label is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.actionLabel, args[0]);
        },
      },
    ],
  }
);
