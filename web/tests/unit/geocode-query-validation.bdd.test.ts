import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { validateGeocodeRequest } from "@server/validation/geocode-schema";

interface World {
  result?: ReturnType<typeof validateGeocodeRequest>;
  searchParams?: URLSearchParams;
}

defineFeature<World>(
  test,
  `
Feature: Geocode query validation

  Scenario: Geocode request rejects a too-short query
    Given a geocode request with a two-letter query
    When geocode validation runs
    Then geocode validation error is invalid query
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a geocode request with a two-letter query$/,
        run: ({ world }) => {
          world.searchParams = new URLSearchParams({
            q: "Ka",
          });
        },
      },
      {
        pattern: /^When geocode validation runs$/,
        run: ({ world }) => {
          if (!world.searchParams) {
            throw new Error("Expected geocode query params");
          }
          world.result = validateGeocodeRequest(world.searchParams);
        },
      },
      {
        pattern: /^Then geocode validation error is invalid query$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.ok, false);
          if (world.result?.ok !== false) {
            throw new Error("Expected geocode validation to fail");
          }
          assert.equal(world.result.error, "invalid query");
        },
      },
    ],
  }
);
