import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createApp } from "@server/app";

interface World {
  requestUrl?: string;
  response?: Response;
}

defineFeature<World>(
  test,
  `
Feature: Alerts route validation

  Scenario: Alerts request rejects missing route and stop filters
    Given an alerts request without route or stop filters
    When the alerts route handles the request
    Then the alerts response status is 400
    And the alerts response error is missing filters
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given an alerts request without route or stop filters$/,
        run: ({ world }) => {
          world.requestUrl = "http://localhost/api/v1/alerts";
        },
      },
      {
        pattern: /^When the alerts route handles the request$/,
        run: async ({ world }) => {
          const app = createApp();
          if (!world.requestUrl) {
            throw new Error("Expected alerts request URL");
          }
          world.response = await app.request(world.requestUrl);
        },
      },
      {
        pattern: /^(?:Then|And) the alerts response status is 400$/,
        run: ({ assert, world }) => {
          assert.equal(world.response?.status, 400);
        },
      },
      {
        pattern: /^(?:Then|And) the alerts response error is missing filters$/,
        run: async ({ assert, world }) => {
          const payload = (await world.response?.json()) as { error: string };
          assert.equal(payload.error, "missing filters");
        },
      },
    ],
  }
);
