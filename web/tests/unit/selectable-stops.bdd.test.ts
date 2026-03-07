import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { buildSelectableStops } from "@server/services/digitransit/departures-normalizer";

interface NearbyStopNode {
  distance: number;
  stop: {
    code?: string;
    gtfsId: string;
    name: string;
  };
}

interface World {
  modeStops?: NearbyStopNode[];
  selectableStops?: ReturnType<typeof buildSelectableStops>;
}

defineFeature<World>(
  test,
  `
Feature: Selectable stop grouping

  Scenario: Nearby stops with the same name are grouped under the nearest stop
    Given nearby bus stops share the same stop name
    When selectable stops are built
    Then the grouped stop uses the nearest stop id
    And the grouped stop contains all member stop ids
    And the grouped stop stop codes are sorted
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given nearby bus stops share the same stop name$/,
        run: ({ world }) => {
          world.modeStops = [
            {
              distance: 120,
              stop: {
                code: "E101",
                gtfsId: "HSL:1001",
                name: "Kamppi",
              },
            },
            {
              distance: 80,
              stop: {
                code: "E099",
                gtfsId: "HSL:0999",
                name: "Kamppi",
              },
            },
          ];
        },
      },
      {
        pattern: /^When selectable stops are built$/,
        run: ({ world }) => {
          if (!world.modeStops) {
            throw new Error("Expected mode stops");
          }
          world.selectableStops = buildSelectableStops(world.modeStops);
        },
      },
      {
        pattern: /^Then the grouped stop uses the nearest stop id$/,
        run: ({ assert, world }) => {
          assert.equal(world.selectableStops?.[0]?.id, "HSL:0999");
        },
      },
      {
        pattern: /^Then the grouped stop contains all member stop ids$/,
        run: ({ assert, world }) => {
          assert.equal(world.selectableStops?.[0]?.memberStopIds.join("|"), "HSL:1001|HSL:0999");
        },
      },
      {
        pattern: /^Then the grouped stop stop codes are sorted$/,
        run: ({ assert, world }) => {
          assert.equal(world.selectableStops?.[0]?.stopCodes.join("|"), "E099|E101");
        },
      },
    ],
  }
);
