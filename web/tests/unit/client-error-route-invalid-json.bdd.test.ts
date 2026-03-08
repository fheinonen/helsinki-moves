import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createApp } from "@server/app";

interface World {
  rawBody?: string;
  response?: Response;
}

defineFeature<World>(
  test,
  `
Feature: Client error route invalid JSON handling

  Scenario: Client error route rejects malformed JSON
    Given a malformed client error JSON request
    When the client error route handles the malformed request
    Then the response status is 400
    And the response error is invalid payload
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a malformed client error JSON request$/,
        run: ({ world }) => {
          world.rawBody = '{"type":"error"';
        },
      },
      {
        pattern: /^When the client error route handles the malformed request$/,
        run: async ({ world }) => {
          const app = createApp();
          if (!world.rawBody) {
            throw new Error("Expected malformed client error request body");
          }
          world.response = await app.request("http://localhost/api/v1/client-error", {
            method: "POST",
            body: world.rawBody,
            headers: {
              "content-type": "application/json",
            },
          });
        },
      },
      {
        pattern: /^Then the response status is 400$/,
        run: ({ assert, world }) => {
          assert.equal(world.response?.status, 400);
        },
      },
      {
        pattern: /^Then the response error is invalid payload$/,
        run: async ({ assert, world }) => {
          const payload = (await world.response?.json()) as { error: string };
          assert.equal(payload.error, "invalid payload");
        },
      },
    ],
  }
);
