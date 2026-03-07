import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { sanitizeClientErrorPayload } from "@server/services/telemetry/sanitize-client-error";
import type { ClientErrorPayload } from "@shared/contracts/client-error-contract";

interface World {
  payload?: ClientErrorPayload;
  sanitized?: ClientErrorPayload;
}

defineFeature<World>(
  test,
  `
Feature: Client error payload sanitization

  Scenario: Client error sanitization redacts secrets and truncates deep context
    Given a client error payload with secret and deep nested context
    When payload sanitization runs
    Then secret values are redacted
    And deep nested values are truncated
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a client error payload with secret and deep nested context$/,
        run: ({ world }) => {
          world.payload = {
            context: {
              token: "secret",
              level1: {
                level2: {
                  level3: {
                    level4: "too-deep",
                  },
                },
              },
            },
            message: "Boom",
            type: "error",
          };
        },
      },
      {
        pattern: /^When payload sanitization runs$/,
        run: ({ world }) => {
          if (!world.payload) {
            throw new Error("Expected input payload");
          }
          world.sanitized = sanitizeClientErrorPayload(world.payload);
        },
      },
      {
        pattern: /^Then secret values are redacted$/,
        run: ({ assert, world }) => {
          assert.equal(world.sanitized?.context?.token, "[Redacted]");
        },
      },
      {
        pattern: /^Then deep nested values are truncated$/,
        run: ({ assert, world }) => {
          const nested = world.sanitized?.context?.level1 as
            | { level2?: { level3?: unknown } }
            | undefined;
          const level3 = nested?.level2?.level3 as { level4?: string } | undefined;
          assert.equal(level3?.level4, "[Truncated]");
        },
      },
    ],
  }
);
