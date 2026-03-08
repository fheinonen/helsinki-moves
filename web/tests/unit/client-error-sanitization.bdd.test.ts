import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createApp } from "@server/app";
import type { ClientErrorPayload } from "@shared/contracts/client-error-contract";

interface World {
  payload?: ClientErrorPayload;
  loggedPayload?: ClientErrorPayload;
  response?: Response;
}

defineFeature<World>(
  test,
  `
Feature: Client error sanitization

  Scenario: Client error payload is sanitized before logging
    Given a client error payload with nested sensitive fields
    When the client error route handles the payload
    Then the logged payload is sanitized
    And the response status is 202
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a client error payload with nested sensitive fields$/,
        run: ({ world }) => {
          world.payload = {
            context: {
              authorization: "secret",
              nested: {
                token: "hidden",
              },
            },
            message: "Boom",
            type: "error",
          };
        },
      },
      {
        pattern: /^When the client error route handles the payload$/,
        run: async ({ world }) => {
          const app = createApp({
            logClientPayload(payload) {
              world.loggedPayload = payload;
            },
          });

          world.response = await app.request("http://localhost/api/v1/client-error", {
            method: "POST",
            body: JSON.stringify(world.payload),
            headers: {
              "content-type": "application/json",
            },
          });
        },
      },
      {
        pattern: /^Then the logged payload is sanitized$/,
        run: ({ assert, world }) => {
          assert.equal(world.loggedPayload?.context?.authorization, "[Redacted]");
          assert.equal(
            (world.loggedPayload?.context?.nested as { token?: string } | undefined)?.token,
            "[Redacted]"
          );
        },
      },
      {
        pattern: /^Then the response status is 202$/,
        run: ({ assert, world }) => {
          assert.equal(world.response?.status, 202);
        },
      },
    ],
  }
);
