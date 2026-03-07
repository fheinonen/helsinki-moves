import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore } from "@client/app/app-store";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";

interface World {
  store?: ReturnType<typeof createAppStore>;
}

function createDeparturesResponse(): DeparturesSuccessResponse {
  return {
    filterOptions: {
      destinations: [{ count: 1, value: "Pasila" }],
      lines: [{ count: 1, value: "I" }],
    },
    mode: "RAIL",
    selectedStopId: "HSL:STATION_A",
    station: {
      departures: [
        {
          departureIso: "2026-03-07T10:10:00.000Z",
          destination: "Pasila",
          line: "I",
        },
      ],
      distanceMeters: 50,
      stopCode: "1",
      stopCodes: ["1"],
      stopName: "Central",
      type: "stop",
    },
    stops: [
      {
        code: "1",
        distanceMeters: 50,
        id: "HSL:STATION_A",
        memberStopIds: ["HSL:STATION_A"],
        name: "Central",
        stopCodes: ["1"],
      },
    ],
  };
}

defineFeature<World>(
  test,
  `
Feature: Filter sanitization

  Scenario: Invalid filters are removed when a new departures response arrives
    Given the app store has stale selected filters
    When a departures response with different filter options is applied
    Then only valid filters remain selected
    And the selected stop is aligned to the response
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app store has stale selected filters$/,
        run: ({ world }) => {
          const store = createAppStore();
          store.setSelectedStop("HSL:OLD_STOP");
          store.toggleLineFilter("550");
          store.toggleDestinationFilter("Kamppi");
          world.store = store;
        },
      },
      {
        pattern: /^When a departures response with different filter options is applied$/,
        run: ({ world }) => {
          if (!world.store) {
            throw new Error("Expected app store");
          }

          world.store.applyDeparturesResponse(createDeparturesResponse());
        },
      },
      {
        pattern: /^Then only valid filters remain selected$/,
        run: ({ assert, world }) => {
          const filters = world.store?.getState().filters;
          assert.equal(filters?.lines.length || 0, 0);
          assert.equal(filters?.destinations.length || 0, 0);
        },
      },
      {
        pattern: /^Then the selected stop is aligned to the response$/,
        run: ({ assert, world }) => {
          assert.equal(world.store?.getState().filters.stopId, "HSL:STATION_A");
        },
      },
    ],
  }
);
