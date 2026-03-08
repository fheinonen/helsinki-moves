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
Feature: Departures route validation

  Scenario: Departures request rejects invalid coordinates
    Given a departures request with latitude north and longitude 24.94
    When the departures route handles the request
    Then the response status is 400
    And the response error is invalid coordinates
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a departures request with latitude north and longitude 24.94$/,
        run: ({ world }) => {
          world.requestUrl = "http://localhost/api/v1/departures?lat=north&lon=24.94&mode=BUS";
        },
      },
      {
        pattern: /^When the departures route handles the request$/,
        run: async ({ world }) => {
          const app = createApp();
          if (!world.requestUrl) {
            throw new Error("Expected departures request URL");
          }
          world.response = await app.request(world.requestUrl);
        },
      },
      {
        pattern: /^Then the response status is 400$/,
        run: ({ assert, world }) => {
          assert.equal(world.response?.status, 400);
        },
      },
      {
        pattern: /^Then the response error is invalid coordinates$/,
        run: async ({ assert, world }) => {
          const payload = (await world.response?.json()) as { error: string };
          assert.equal(payload.error, "invalid coordinates");
        },
      },
    ],
  }
);
