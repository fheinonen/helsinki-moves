import { afterEach, test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";

interface World {
  payload?: { error?: string };
  response?: Response;
}

afterEach(() => {
  delete process.env.SPEECH_TRANSCRIBE_API_KEY;
  delete process.env.SPEECH_TRANSCRIBE_MODEL;
  delete process.env.SPEECH_TRANSCRIBE_API_URL;
});

defineFeature<World>(
  test,
  `
Feature: Vercel speech-transcribe entrypoint

  Scenario: The Vercel speech-transcribe entrypoint uses the Hono validation response
    Given speech transcription env is configured for entrypoint loading
    When the Vercel speech-transcribe entrypoint handles an invalid payload
    Then the Vercel speech-transcribe entrypoint returns status 400
    And the Vercel speech-transcribe entrypoint returns error invalid payload
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given speech transcription env is configured for entrypoint loading$/,
        run: () => {
          process.env.SPEECH_TRANSCRIBE_API_KEY = "speech-key";
          process.env.SPEECH_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";
          process.env.SPEECH_TRANSCRIBE_API_URL = "https://example.test/v1/audio/transcriptions";
        },
      },
      {
        pattern: /^When the Vercel speech-transcribe entrypoint handles an invalid payload$/,
        run: async ({ world }) => {
          const app = (await import("../../api/v1/speech-transcribe")).default;
          world.response = await app.fetch(
            new Request("http://localhost/api/v1/speech-transcribe", {
              body: JSON.stringify({ content: "" }),
              headers: {
                "content-type": "application/json",
              },
              method: "POST",
            })
          );
          world.payload = (await world.response.json()) as { error?: string };
        },
      },
      {
        pattern: /^Then the Vercel speech-transcribe entrypoint returns status (\d+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.response?.status, Number(args[0]));
        },
      },
      {
        pattern: /^Then the Vercel speech-transcribe entrypoint returns error (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.payload?.error, args[0]);
        },
      },
    ],
  }
);
