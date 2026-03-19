import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createApp } from "@server/app";
import type { TravelIntentService } from "@server/services/travel-intent/travel-intent-service";

interface World {
  body?: Record<string, unknown>;
  response?: Response;
  travelIntentService?: TravelIntentService;
}

defineFeature<World>(
  test,
  `
Feature: Travel intent route

  Scenario: Missing prompt returns 400
    Given the travel intent route has a successful service
    And the travel intent request body omits the prompt
    When the travel intent route handles the request
    Then the travel intent response status is 400
    And the travel intent response error is prompt is required

  Scenario: A valid request returns structured travel intent
    Given the travel intent route has a successful service
    And the travel intent request body includes a prompt
    When the travel intent route handles the request
    Then the travel intent response status is 200
    And the travel intent response includes bus destination Tripla
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the travel intent route has a successful service$/,
        run: ({ world }) => {
          world.travelIntentService = {
            async parse() {
              return {
                locationQuery: null,
                requests: [
                  {
                    destinations: ["Tripla"],
                    lines: [],
                    mode: "BUS",
                  },
                ],
              };
            },
          };
        },
      },
      {
        pattern: /^(?:Given|And) the travel intent request body omits the prompt$/,
        run: ({ world }) => {
          world.body = {};
        },
      },
      {
        pattern: /^(?:Given|And) the travel intent request body includes a prompt$/,
        run: ({ world }) => {
          world.body = {
            prompt: "i want to go to tripla by bus",
          };
        },
      },
      {
        pattern: /^When the travel intent route handles the request$/,
        run: async ({ world }) => {
          const app = createApp({
            travelIntentService: world.travelIntentService,
          });
          world.response = await app.request("http://localhost/api/v1/travel-intent", {
            body: JSON.stringify(world.body || {}),
            headers: {
              "content-type": "application/json",
            },
            method: "POST",
          });
        },
      },
      {
        pattern: /^Then the travel intent response status is (\d+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.response?.status, Number(args[0]));
        },
      },
      {
        pattern: /^(?:Then|And) the travel intent response error is (.+)$/,
        run: async ({ args, assert, world }) => {
          const payload = (await world.response?.json()) as { error?: string };
          assert.equal(payload.error, args[0]);
        },
      },
      {
        pattern: /^(?:Then|And) the travel intent response includes bus destination Tripla$/,
        run: async ({ assert, world }) => {
          const payload = (await world.response?.json()) as {
            requests?: Array<{ destinations?: string[]; mode?: string }>;
          };
          assert.equal(payload.requests?.[0]?.mode, "BUS");
          assert.equal(JSON.stringify(payload.requests?.[0]?.destinations), JSON.stringify(["Tripla"]));
        },
      },
    ],
  }
);
