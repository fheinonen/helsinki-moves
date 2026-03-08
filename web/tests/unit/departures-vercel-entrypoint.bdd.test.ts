import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";

interface World {
  payload?: { error?: string };
  response?: Response;
}

defineFeature<World>(
  test,
  `
Feature: Vercel departures entrypoint

  Scenario: The Vercel departures entrypoint uses the Hono validation response
    When the Vercel departures entrypoint handles invalid coordinates
    Then the Vercel departures entrypoint returns status 400
    And the Vercel departures entrypoint returns error invalid coordinates
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
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
        pattern: /^Then the Vercel departures entrypoint returns status (\d+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.response?.status, Number(args[0]));
        },
      },
      {
        pattern: /^Then the Vercel departures entrypoint returns error (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.payload?.error, args[0]);
        },
      },
    ],
  }
);
