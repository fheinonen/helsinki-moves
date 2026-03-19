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
Feature: Routes route validation

  Scenario: Routes request rejects invalid destination coordinates
    Given a routes request with origin 60.17,24.94 and destination east,24.95
    When the routes route handles the request
    Then the routes response status is 400
    And the routes response error is invalid coordinates
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a routes request with origin 60.17,24.94 and destination east,24.95$/,
        run: ({ world }) => {
          world.requestUrl =
            "http://localhost/api/v1/routes?fromLat=60.17&fromLon=24.94&toLat=east&toLon=24.95";
        },
      },
      {
        pattern: /^When the routes route handles the request$/,
        run: async ({ world }) => {
          const app = createApp();
          if (!world.requestUrl) {
            throw new Error("Expected routes request URL");
          }
          world.response = await app.request(world.requestUrl);
        },
      },
      {
        pattern: /^(?:Then|And) the routes response status is 400$/,
        run: ({ assert, world }) => {
          assert.equal(world.response?.status, 400);
        },
      },
      {
        pattern: /^(?:Then|And) the routes response error is invalid coordinates$/,
        run: async ({ assert, world }) => {
          const payload = (await world.response?.json()) as { error: string };
          assert.equal(payload.error, "invalid coordinates");
        },
      },
    ],
  }
);
