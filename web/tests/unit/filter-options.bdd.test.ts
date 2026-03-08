import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { buildFilterOptions } from "@server/services/digitransit/departures-normalizer";
import type { Departure } from "@shared/domain/departure";

interface World {
  departures?: Departure[];
  filterOptions?: ReturnType<typeof buildFilterOptions>;
}

defineFeature<World>(
  test,
  `
Feature: Departure filter options

  Scenario: Filter options are counted and sorted from departures
    Given departures include repeated lines and destinations
    When filter options are built from departures
    Then line filter options are sorted by count then value
    And destination filter options are sorted by count then value
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given departures include repeated lines and destinations$/,
        run: ({ world }) => {
          world.departures = [
            {
              departureIso: "2026-03-07T10:10:00.000Z",
              destination: "Kamppi",
              line: "550",
            },
            {
              departureIso: "2026-03-07T10:12:00.000Z",
              destination: "Pasila",
              line: "551",
            },
            {
              departureIso: "2026-03-07T10:15:00.000Z",
              destination: "Kamppi",
              line: "550",
            },
          ];
        },
      },
      {
        pattern: /^When filter options are built from departures$/,
        run: ({ world }) => {
          if (!world.departures) {
            throw new Error("Expected departures");
          }
          world.filterOptions = buildFilterOptions(world.departures);
        },
      },
      {
        pattern: /^Then line filter options are sorted by count then value$/,
        run: ({ assert, world }) => {
          const lines = world.filterOptions?.lines.map((option) => `${option.value}:${option.count}`);
          assert.equal(lines?.join("|"), "550:2|551:1");
        },
      },
      {
        pattern: /^Then destination filter options are sorted by count then value$/,
        run: ({ assert, world }) => {
          const destinations = world.filterOptions?.destinations.map(
            (option) => `${option.value}:${option.count}`
          );
          assert.equal(destinations?.join("|"), "Kamppi:2|Pasila:1");
        },
      },
    ],
  }
);
