import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { validateClientErrorPayload } from "@server/validation/client-error-schema";

interface World {
  payload?: unknown;
  result?: ReturnType<typeof validateClientErrorPayload>;
}

defineFeature<World>(
  test,
  `
Feature: Client error payload validation

  Scenario: Client error payload rejects a missing message
    Given a client error payload without a message
    When client error payload validation runs
    Then client error validation error is invalid payload
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a client error payload without a message$/,
        run: ({ world }) => {
          world.payload = {
            type: "error",
          };
        },
      },
      {
        pattern: /^When client error payload validation runs$/,
        run: ({ world }) => {
          world.result = validateClientErrorPayload(world.payload);
        },
      },
      {
        pattern: /^Then client error validation error is invalid payload$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.ok, false);
          if (world.result?.ok !== false) {
            throw new Error("Expected client error validation to fail");
          }
          assert.equal(world.result.error, "invalid payload");
        },
      },
    ],
  }
);
