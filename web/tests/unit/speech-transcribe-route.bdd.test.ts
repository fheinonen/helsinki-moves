import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createApp } from "@server/app";
import type { SpeechTranscriptionService } from "@server/services/voice/transcribe-service";

interface World {
  payload?: { error?: string; transcript?: string };
  speechTranscriptionService?: SpeechTranscriptionService | null;
  response?: Response;
}

defineFeature<World>(
  test,
  `
Feature: Speech transcribe route

  Scenario: Speech transcribe route returns a transcript from the transcription service
    Given the speech transcribe route has a configured transcription service
    When the speech transcribe route handles a valid payload
    Then the speech transcribe response status is 200
    And the speech transcribe response transcript is Kamppi

  Scenario: Speech transcribe route returns 503 when transcription is not configured
    Given the speech transcribe route has no transcription service
    When the speech transcribe route handles a valid payload
    Then the speech transcribe response status is 503
    And the speech transcribe response error is Speech transcription is not configured

  Scenario: Speech transcribe route returns 400 for invalid payloads
    Given the speech transcribe route has a configured transcription service
    When the speech transcribe route handles an invalid payload
    Then the speech transcribe response status is 400
    And the speech transcribe response error is invalid payload

  Scenario: Speech transcribe route returns 422 when the transcript is empty
    Given the speech transcribe route has an empty-transcript service
    When the speech transcribe route handles a valid payload
    Then the speech transcribe response status is 422
    And the speech transcribe response error is No speech detected

  Scenario: Speech transcribe route returns 502 when transcription fails
    Given the speech transcribe route has a failing transcription service
    When the speech transcribe route handles a valid payload
    Then the speech transcribe response status is 502
    And the speech transcribe response error is Could not transcribe speech
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the speech transcribe route has a configured transcription service$/,
        run: ({ world }) => {
          world.speechTranscriptionService = {
            async transcribe() {
              return "Kamppi";
            },
          };
        },
      },
      {
        pattern: /^Given the speech transcribe route has no transcription service$/,
        run: ({ world }) => {
          world.speechTranscriptionService = null;
        },
      },
      {
        pattern: /^Given the speech transcribe route has an empty-transcript service$/,
        run: ({ world }) => {
          world.speechTranscriptionService = {
            async transcribe() {
              return "";
            },
          };
        },
      },
      {
        pattern: /^Given the speech transcribe route has a failing transcription service$/,
        run: ({ world }) => {
          world.speechTranscriptionService = {
            async transcribe() {
              throw new Error("boom");
            },
          };
        },
      },
      {
        pattern: /^When the speech transcribe route handles a valid payload$/,
        run: async ({ world }) => {
          const app = createApp({
            speechTranscriptionService: world.speechTranscriptionService,
          });
          world.response = await app.request("http://localhost/api/v1/speech-transcribe", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              content: "ZmFrZQ==",
              fileName: "voice.webm",
              mimeType: "audio/webm",
            }),
          });
        },
      },
      {
        pattern: /^When the speech transcribe route handles an invalid payload$/,
        run: async ({ world }) => {
          const app = createApp({
            speechTranscriptionService: world.speechTranscriptionService,
          });
          world.response = await app.request("http://localhost/api/v1/speech-transcribe", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              fileName: "voice.webm",
            }),
          });
        },
      },
      {
        pattern: /^Then the speech transcribe response status is (\d+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.response?.status, Number(args[0]));
        },
      },
      {
        pattern: /^Then the speech transcribe response transcript is Kamppi$/,
        run: async ({ assert, world }) => {
          const payload = (await world.response?.json()) as { transcript: string };
          assert.equal(payload.transcript, "Kamppi");
        },
      },
      {
        pattern: /^Then the speech transcribe response error is (.+)$/,
        run: async ({ args, assert, world }) => {
          const payload = (await world.response?.json()) as { error?: string };
          assert.equal(payload.error, args[0]);
        },
      },
    ],
  }
);
