import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createApp } from "@server/app";
import type { SpeechTranscriptionService } from "@server/services/voice/transcribe-service";

interface World {
  speechTranscriptionService?: SpeechTranscriptionService;
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
        pattern: /^Then the speech transcribe response status is 200$/,
        run: ({ assert, world }) => {
          assert.equal(world.response?.status, 200);
        },
      },
      {
        pattern: /^Then the speech transcribe response transcript is Kamppi$/,
        run: async ({ assert, world }) => {
          const payload = (await world.response?.json()) as { transcript: string };
          assert.equal(payload.transcript, "Kamppi");
        },
      },
    ],
  }
);
