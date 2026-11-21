import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createApp } from "@server/app";
import type { ClientErrorPayload } from "@shared/contracts/client-error-contract";

interface World {
  loggedPayload?: ClientErrorPayload;
  rawBody?: string;
  response?: Response;
}

defineFeature<World>(
  test,
  `
Feature: Client error route

  Scenario: Client error payload redacts secrets and truncates deep context before logging
    Given a client error payload with nested sensitive fields and deep context
    When the client error route handles the request
    Then the response status is 202
    And the logged payload redacts sensitive fields
    And the logged payload truncates deep nested values

  Scenario: Client error route rejects a missing message
    Given a client error payload without a message
    When the client error route handles the request
    Then the response status is 400
    And the response error is invalid payload

  Scenario: Client error route rejects malformed JSON
    Given a malformed client error JSON request
    When the client error route handles the request
    Then the response status is 400
    And the response error is invalid payload
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a client error payload with nested sensitive fields and deep context$/,
        run: ({ world }) => {
          world.rawBody = JSON.stringify({
            context: {
              authorization: "secret",
              nested: { token: "hidden" },
              level1: { level2: { level3: { level4: "too-deep" } } },
            },
            message: "Boom",
            type: "error",
          });
        },
      },
      {
        pattern: /^Given a client error payload without a message$/,
        run: ({ world }) => {
          world.rawBody = JSON.stringify({ type: "error" });
        },
      },
      {
        pattern: /^Given a malformed client error JSON request$/,
        run: ({ world }) => {
          world.rawBody = '{"type":"error"';
        },
      },
      {
        pattern: /^When the client error route handles the request$/,
        run: async ({ world }) => {
          const app = createApp({
            logClientPayload(payload) {
              world.loggedPayload = payload;
            },
          });
          if (!world.rawBody) {
            throw new Error("Expected client error request body");
          }
          world.response = await app.request("http://localhost/api/v1/client-error", {
            method: "POST",
            body: world.rawBody,
            headers: { "content-type": "application/json" },
          });
        },
      },
      {
        pattern: /^Then the response status is (\d+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.response?.status, Number(args[0]));
        },
      },
      {
        pattern: /^Then the response error is (.+)$/,
        run: async ({ args, assert, world }) => {
          const payload = (await world.response?.json()) as { error: string };
          assert.equal(payload.error, args[0]);
        },
      },
      {
        pattern: /^Then the logged payload redacts sensitive fields$/,
        run: ({ assert, world }) => {
          assert.equal(world.loggedPayload?.context?.authorization, "[Redacted]");
          assert.equal(
            (world.loggedPayload?.context?.nested as { token?: string } | undefined)?.token,
            "[Redacted]"
          );
        },
      },
      {
        pattern: /^Then the logged payload truncates deep nested values$/,
        run: ({ assert, world }) => {
          const nested = world.loggedPayload?.context?.level1 as
            | { level2?: { level3?: unknown } }
            | undefined;
          const level3 = nested?.level2?.level3 as { level4?: string } | undefined;
          assert.equal(level3?.level4, "[Truncated]");
        },
      },
    ],
  }
);
