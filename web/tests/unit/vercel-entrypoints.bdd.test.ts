import { afterEach, test, vi } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";

interface World {
  payload?: { error?: string; ok?: boolean };
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
Feature: Vercel API entrypoints

  Scenario: The health entrypoint responds with ok true
    When the Vercel health entrypoint is requested
    Then the entrypoint response status is 200
    And the entrypoint response ok flag is true

  Scenario: The departures entrypoint validates coordinates
    When the Vercel departures entrypoint handles invalid coordinates
    Then the entrypoint response status is 400
    And the entrypoint response error is invalid coordinates

  Scenario: The geocode entrypoint validates query length
    When the Vercel geocode entrypoint handles an invalid short query
    Then the entrypoint response status is 400
    And the entrypoint response error is invalid query

  Scenario: The client-error entrypoint validates payload type
    When the Vercel client-error entrypoint handles an invalid payload type
    Then the entrypoint response status is 400
    And the entrypoint response error is invalid type

  Scenario: The speech-transcribe entrypoint validates audio payload
    Given speech transcription env is configured for entrypoint loading
    When the Vercel speech-transcribe entrypoint handles an invalid payload
    Then the entrypoint response status is 400
    And the entrypoint response error is invalid payload
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
          vi.resetModules();
        },
      },
      {
        pattern: /^When the Vercel health entrypoint is requested$/,
        run: async ({ world }) => {
          const app = (await import("../../api/health")).default;
          world.response = await app.fetch(new Request("http://localhost/api/health"));
          world.payload = (await world.response.json()) as { ok?: boolean };
        },
      },
      {
        pattern: /^When the Vercel departures entrypoint handles invalid coordinates$/,
        run: async ({ world }) => {
          const app = (await import("../../api/v1/departures")).default;
          world.response = await app.fetch(
            new Request("http://localhost/api/v1/departures?lat=bad&lon=24.9&mode=BUS")
          );
          world.payload = (await world.response.json()) as { error?: string };
        },
      },
      {
        pattern: /^When the Vercel geocode entrypoint handles an invalid short query$/,
        run: async ({ world }) => {
          const app = (await import("../../api/v1/geocode")).default;
          world.response = await app.fetch(new Request("http://localhost/api/v1/geocode?q=ab"));
          world.payload = (await world.response.json()) as { error?: string };
        },
      },
      {
        pattern: /^When the Vercel client-error entrypoint handles an invalid payload type$/,
        run: async ({ world }) => {
          const app = (await import("../../api/v1/client-error")).default;
          world.response = await app.fetch(
            new Request("http://localhost/api/v1/client-error", {
              body: JSON.stringify({ message: "boom", type: "wrong" }),
              headers: { "content-type": "application/json" },
              method: "POST",
            })
          );
          world.payload = (await world.response.json()) as { error?: string };
        },
      },
      {
        pattern: /^When the Vercel speech-transcribe entrypoint handles an invalid payload$/,
        run: async ({ world }) => {
          const app = (await import("../../api/v1/speech-transcribe")).default;
          world.response = await app.fetch(
            new Request("http://localhost/api/v1/speech-transcribe", {
              body: JSON.stringify({ content: "" }),
              headers: { "content-type": "application/json" },
              method: "POST",
            })
          );
          world.payload = (await world.response.json()) as { error?: string };
        },
      },
      {
        pattern: /^Then the entrypoint response status is (\d+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.response?.status, Number(args[0]));
        },
      },
      {
        pattern: /^Then the entrypoint response ok flag is true$/,
        run: ({ assert, world }) => {
          assert.equal(world.payload?.ok, true);
        },
      },
      {
        pattern: /^Then the entrypoint response error is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.payload?.error, args[0]);
        },
      },
    ],
  }
);
