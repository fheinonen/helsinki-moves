import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createApp } from "@server/app";
import type { GeocodeService } from "@server/services/geocode/geocode-service";

interface World {
  payload?: { ambiguous?: boolean; location?: { label?: string } };
  requestUrl?: string;
  response?: Response;
}

defineFeature<World>(
  test,
  `
Feature: Geocode route contract

  Scenario: Geocode route resolves a valid place query
    Given a geocode request for Kamppi with location bias
    When the geocode route handles the request
    Then the geocode response status is 200
    And the geocode response location label is Kamppi
    And the geocode response is not ambiguous
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a geocode request for Kamppi with location bias$/,
        run: ({ world }) => {
          world.requestUrl = "http://localhost/api/v1/geocode?q=Kamppi&lat=60.17&lon=24.94";
        },
      },
      {
        pattern: /^When the geocode route handles the request$/,
        run: async ({ world }) => {
          const geocodeService: GeocodeService = {
            async resolve(input) {
              return {
                ambiguous: false,
                choices: [],
                location: {
                  confidence: 0.9,
                  label: input.query,
                  latitude: 60.17,
                  longitude: 24.94,
                },
                query: input.query,
              };
            },
          };
          const app = createApp({ geocodeService });
          if (!world.requestUrl) {
            throw new Error("Expected geocode request URL");
          }
          world.response = await app.request(world.requestUrl);
        },
      },
      {
        pattern: /^Then the geocode response status is 200$/,
        run: ({ assert, world }) => {
          assert.equal(world.response?.status, 200);
        },
      },
      {
        pattern: /^Then the geocode response location label is Kamppi$/,
        run: async ({ assert, world }) => {
          world.payload ||= (await world.response?.json()) as {
            ambiguous?: boolean;
            location?: { label?: string };
          };
          const payload = world.payload;
          assert.equal(payload.location?.label, "Kamppi");
        },
      },
      {
        pattern: /^Then the geocode response is not ambiguous$/,
        run: async ({ assert, world }) => {
          world.payload ||= (await world.response?.json()) as {
            ambiguous?: boolean;
            location?: { label?: string };
          };
          const payload = world.payload;
          assert.equal(payload.ambiguous, false);
        },
      },
    ],
  }
);
