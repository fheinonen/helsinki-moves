import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { geocode } from "@server/services/geocode/client";

interface World {
  errorMessage?: string;
}

defineFeature<World>(
  test,
  `
Feature: Geocode timeout

  Scenario: Digitransit geocoding times out with a deterministic error
    Given the geocode client has a hanging upstream
    When geocoding is requested
    Then the geocode error is Digitransit geocoding request timed out
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the geocode client has a hanging upstream$/,
        run: () => {},
      },
      {
        pattern: /^When geocoding is requested$/,
        run: async ({ world }) => {
          try {
            await geocode({
              biasLat: 60.17,
              biasLon: 24.94,
              fetchImpl: async (_url, init) =>
                new Promise((_resolve, reject) => {
                  init?.signal?.addEventListener("abort", () => {
                    const error = new Error("aborted");
                    error.name = "AbortError";
                    reject(error);
                  });
                }),
              getApiKey: () => "test-key",
              lang: "fi",
              query: "Kamppi",
              timeoutMs: 1,
            });
          } catch (error) {
            world.errorMessage = error instanceof Error ? error.message : String(error);
          }
        },
      },
      {
        pattern: /^Then the geocode error is Digitransit geocoding request timed out$/,
        run: ({ assert, world }) => {
          assert.equal(world.errorMessage, "Digitransit geocoding request timed out");
        },
      },
    ],
  }
);
