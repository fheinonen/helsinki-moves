import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  buildGeocodeTextVariants,
  buildNoMatchPayload,
  normalizeGeocodeQuery,
} from "@server/services/geocode/query";

interface World {
  noMatchPayload?: ReturnType<typeof buildNoMatchPayload>;
  normalizedQuery?: string;
  query?: string;
  variants?: string[];
}

defineFeature<World>(
  test,
  `
Feature: Geocode query variants

  Scenario: A hyphenated place query expands into deduplicated upstream variants
    Given a place query of Kamppi-Center
    When geocode text variants are built
    Then the variants are Kamppi-Center | Kamppi Center | KamppiCenter | Kamppi Centerhelsinki | Kamppi Center helsinki
    And there are no duplicate variants

  Scenario: Geocode query normalization removes unsupported punctuation
    Given a raw place query of Kamppi!!!   Helsinki??
    When the geocode query is normalized
    Then the normalized geocode query is Kamppi Helsinki

  Scenario: No-match payload returns the HSL-area message
    Given a no-match geocode query of Kamppi
    When the no-match geocode payload is built
    Then the no-match payload query is Kamppi
    And the no-match payload message is No matching location found in HSL area.
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a place query of (.+)$/,
        run: ({ args, world }) => {
          world.query = args[0];
        },
      },
      {
        pattern: /^Given a raw place query of (.+)$/,
        run: ({ args, world }) => {
          world.query = args[0];
        },
      },
      {
        pattern: /^Given a no-match geocode query of (.+)$/,
        run: ({ args, world }) => {
          world.query = args[0];
        },
      },
      {
        pattern: /^When geocode text variants are built$/,
        run: ({ world }) => {
          world.variants = buildGeocodeTextVariants(world.query || "");
        },
      },
      {
        pattern: /^When the geocode query is normalized$/,
        run: ({ world }) => {
          world.normalizedQuery = normalizeGeocodeQuery(world.query || "");
        },
      },
      {
        pattern: /^When the no-match geocode payload is built$/,
        run: ({ world }) => {
          world.noMatchPayload = buildNoMatchPayload(world.query || "");
        },
      },
      {
        pattern: /^Then the variants are (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.variants?.join(" | "), args[0]);
        },
      },
      {
        pattern: /^Then there are no duplicate variants$/,
        run: ({ assert, world }) => {
          assert.equal(new Set(world.variants || []).size, (world.variants || []).length);
        },
      },
      {
        pattern: /^Then the normalized geocode query is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.normalizedQuery, args[0]);
        },
      },
      {
        pattern: /^Then the no-match payload query is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.noMatchPayload?.query, args[0]);
        },
      },
      {
        pattern: /^Then the no-match payload message is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.noMatchPayload?.message, args[0]);
        },
      },
    ],
  }
);
