import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  buildFilterOptions,
  filterDeparturesBySelections,
} from "@server/services/digitransit/departures-normalizer";
import type { Departure } from "@shared/domain/departure";

interface World {
  departures?: Departure[];
  filtered?: Departure[];
  filterOptions?: ReturnType<typeof buildFilterOptions>;
}

defineFeature<World>(
  test,
  `
Feature: Departure destination filter normalization

  Scenario: Destination filtering matches canonically equivalent names
    Given departures include visually identical destination names with different unicode forms
    When destination filter options are built
    And departures are filtered by destination Kamppi via Töölö
    Then the destination filter count for Kamppi via Töölö is 2
    And both matching departures remain visible

  Scenario: Destination filtering matches abbreviation punctuation variants
    Given departures include destination names that differ only by abbreviation punctuation
    When destination filter options are built
    And departures are filtered by destination Pohjois-Haagan as.
    Then the destination filter count for Pohjois-Haagan as. is 2
    And both abbreviation variant departures remain visible

  Scenario: Destination filtering matches parenthetical platform variants
    Given departures include destination names that differ only by parenthetical punctuation
    When destination filter options are built
    And departures are filtered by destination Herttoniemi (M)
    Then the destination filter count for Herttoniemi (M) is 2
    And both parenthetical variant departures remain visible

  Scenario: Destination filtering matches multiword case variants
    Given departures include multiword destination names with different casing
    When destination filter options are built
    And departures are filtered by destination Kamppi via Töölö
    Then the destination filter count for Kamppi via Töölö is 2
    And both case variant departures remain visible
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given departures include visually identical destination names with different unicode forms$/,
        run: ({ world }) => {
          world.departures = [
            {
              departureIso: "2026-03-07T10:10:00.000Z",
              destination: "Kamppi via Töölö",
              line: "18",
            },
            {
              departureIso: "2026-03-07T10:12:00.000Z",
              destination: "Kamppi via To\u0308o\u0308lo\u0308",
              line: "18",
            },
            {
              departureIso: "2026-03-07T10:14:00.000Z",
              destination: "Pasila",
              line: "18",
            },
          ];
        },
      },
      {
        pattern: /^When destination filter options are built$/,
        run: ({ world }) => {
          if (!world.departures) {
            throw new Error("Expected departures");
          }
          world.filterOptions = buildFilterOptions(world.departures);
        },
      },
      {
        pattern: /^When departures are filtered by destination Kamppi via Töölö$/,
        run: ({ world }) => {
          if (!world.departures) {
            throw new Error("Expected departures");
          }
          world.filtered = filterDeparturesBySelections(world.departures, {
            destinations: ["Kamppi via Töölö"],
            lines: [],
          });
        },
      },
      {
        pattern: /^Then the destination filter count for Kamppi via Töölö is 2$/,
        run: ({ assert, world }) => {
          const option = world.filterOptions?.destinations.find(
            (candidate) => candidate.value === "Kamppi via Töölö"
          );
          assert.equal(option?.count, 2);
        },
      },
      {
        pattern: /^Then both matching departures remain visible$/,
        run: ({ assert, world }) => {
          const result = world.filtered?.map((departure) => departure.destination).join("|");
          assert.equal(result, "Kamppi via Töölö|Kamppi via To\u0308o\u0308lo\u0308");
        },
      },
      {
        pattern: /^Given departures include destination names that differ only by abbreviation punctuation$/,
        run: ({ world }) => {
          world.departures = [
            {
              departureIso: "2026-03-07T10:10:00.000Z",
              destination: "Pohjois-Haagan as.",
              line: "A",
            },
            {
              departureIso: "2026-03-07T10:12:00.000Z",
              destination: "Pohjois-Haagan as",
              line: "A",
            },
            {
              departureIso: "2026-03-07T10:14:00.000Z",
              destination: "Helsinki",
              line: "A",
            },
          ];
        },
      },
      {
        pattern: /^When departures are filtered by destination Pohjois-Haagan as\.$/,
        run: ({ world }) => {
          if (!world.departures) {
            throw new Error("Expected departures");
          }
          world.filtered = filterDeparturesBySelections(world.departures, {
            destinations: ["Pohjois-Haagan as."],
            lines: [],
          });
        },
      },
      {
        pattern: /^Then the destination filter count for Pohjois-Haagan as\. is 2$/,
        run: ({ assert, world }) => {
          const option = world.filterOptions?.destinations.find((candidate) =>
            candidate.value.startsWith("Pohjois-Haagan as")
          );
          assert.equal(option?.count, 2);
        },
      },
      {
        pattern: /^Then both abbreviation variant departures remain visible$/,
        run: ({ assert, world }) => {
          const result = world.filtered?.map((departure) => departure.destination).join("|");
          assert.equal(result, "Pohjois-Haagan as.|Pohjois-Haagan as");
        },
      },
      {
        pattern: /^Given departures include destination names that differ only by parenthetical punctuation$/,
        run: ({ world }) => {
          world.departures = [
            {
              departureIso: "2026-03-07T10:10:00.000Z",
              destination: "Herttoniemi (M)",
              line: "500",
            },
            {
              departureIso: "2026-03-07T10:12:00.000Z",
              destination: "Herttoniemi M",
              line: "500",
            },
            {
              departureIso: "2026-03-07T10:14:00.000Z",
              destination: "Elielinaukio",
              line: "500",
            },
          ];
        },
      },
      {
        pattern: /^When departures are filtered by destination Herttoniemi \(M\)$/,
        run: ({ world }) => {
          if (!world.departures) {
            throw new Error("Expected departures");
          }
          world.filtered = filterDeparturesBySelections(world.departures, {
            destinations: ["Herttoniemi (M)"],
            lines: [],
          });
        },
      },
      {
        pattern: /^Then the destination filter count for Herttoniemi \(M\) is 2$/,
        run: ({ assert, world }) => {
          const option = world.filterOptions?.destinations.find((candidate) =>
            candidate.value.startsWith("Herttoniemi")
          );
          assert.equal(option?.count, 2);
        },
      },
      {
        pattern: /^Then both parenthetical variant departures remain visible$/,
        run: ({ assert, world }) => {
          const result = world.filtered?.map((departure) => departure.destination).join("|");
          assert.equal(result, "Herttoniemi (M)|Herttoniemi M");
        },
      },
      {
        pattern: /^Given departures include multiword destination names with different casing$/,
        run: ({ world }) => {
          world.departures = [
            {
              departureIso: "2026-03-07T10:10:00.000Z",
              destination: "Kamppi via Töölö",
              line: "18",
            },
            {
              departureIso: "2026-03-07T10:12:00.000Z",
              destination: "kamppi Via töölö",
              line: "18",
            },
            {
              departureIso: "2026-03-07T10:14:00.000Z",
              destination: "Pasila",
              line: "18",
            },
          ];
        },
      },
      {
        pattern: /^Then both case variant departures remain visible$/,
        run: ({ assert, world }) => {
          const result = world.filtered?.map((departure) => departure.destination).join("|");
          assert.equal(result, "Kamppi via Töölö|kamppi Via töölö");
        },
      },
    ],
  }
);
