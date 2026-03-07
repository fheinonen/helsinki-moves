import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";

interface World {
  payload?: { error?: string };
  response?: Response;
}

defineFeature<World>(
  test,
  `
Feature: Vercel client-error entrypoint

  Scenario: The Vercel client-error entrypoint uses the Hono validation response
    When the Vercel client-error entrypoint handles an invalid payload type
    Then the Vercel client-error entrypoint returns status 400
    And the Vercel client-error entrypoint returns error invalid type
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^When the Vercel client-error entrypoint handles an invalid payload type$/,
        run: async ({ world }) => {
          const app = (await import("../../api/v1/client-error")).default;
          world.response = await app.fetch(
            new Request("http://localhost/api/v1/client-error", {
              body: JSON.stringify({
                message: "boom",
                type: "wrong",
              }),
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
        pattern: /^Then the Vercel client-error entrypoint returns status (\d+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.response?.status, Number(args[0]));
        },
      },
      {
        pattern: /^Then the Vercel client-error entrypoint returns error (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.payload?.error, args[0]);
        },
      },
    ],
  }
);
