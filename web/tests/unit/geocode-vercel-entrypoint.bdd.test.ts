import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";

interface World {
  payload?: { error?: string };
  response?: Response;
}

defineFeature<World>(
  test,
  `
Feature: Vercel geocode entrypoint

  Scenario: The Vercel geocode entrypoint uses the Hono validation response
    When the Vercel geocode entrypoint handles an invalid short query
    Then the Vercel geocode entrypoint returns status 400
    And the Vercel geocode entrypoint returns error invalid query
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^When the Vercel geocode entrypoint handles an invalid short query$/,
        run: async ({ world }) => {
          const app = (await import("../../api/v1/geocode")).default;
          world.response = await app.fetch(new Request("http://localhost/api/v1/geocode?q=ab"));
          world.payload = (await world.response.json()) as { error?: string };
        },
      },
      {
        pattern: /^Then the Vercel geocode entrypoint returns status (\d+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.response?.status, Number(args[0]));
        },
      },
      {
        pattern: /^Then the Vercel geocode entrypoint returns error (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.payload?.error, args[0]);
        },
      },
    ],
  }
);
