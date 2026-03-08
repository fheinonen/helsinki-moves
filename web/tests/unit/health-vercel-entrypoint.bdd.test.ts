import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";

interface World {
  payload?: { ok?: boolean };
  response?: Response;
}

defineFeature<World>(
  test,
  `
Feature: Vercel health entrypoint

  Scenario: The Vercel health entrypoint uses the Hono health response
    When the Vercel health entrypoint is requested
    Then the Vercel health entrypoint returns status 200
    And the Vercel health entrypoint returns ok true
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^When the Vercel health entrypoint is requested$/,
        run: async ({ world }) => {
          const app = (await import("../../api/health")).default;
          world.response = await app.fetch(new Request("http://localhost/api/health"));
          world.payload = (await world.response.json()) as { ok?: boolean };
        },
      },
      {
        pattern: /^Then the Vercel health entrypoint returns status (\d+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.response?.status, Number(args[0]));
        },
      },
      {
        pattern: /^Then the Vercel health entrypoint returns ok true$/,
        run: ({ assert, world }) => {
          assert.equal(world.payload?.ok, true);
        },
      },
    ],
  }
);
