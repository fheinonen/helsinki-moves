import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { CreateDepartureBoardState } from "@client/create/departure-board-state";
import { createDepartureBoardState } from "@client/create/departure-board-state";

interface World {
  response?: DeparturesSuccessResponse;
  result?: CreateDepartureBoardState;
}

defineFeature<World>(
  test,
  `
Feature: Create route departure board state

  Scenario: Departure data is transformed into create-route board state
    Given metro departures are returned for Kamppi at a fixed current time
    When the create-route departure board state is built
    Then the board state stop header is Kamppi platform M1
    And the board state contains 2 departures
    And the first departure is line M1 to Vuosaari in 0 minutes with SUBWAY mode
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given metro departures are returned for Kamppi at a fixed current time$/,
        run: ({ world }) => {
          world.response = {
            filterOptions: {
              destinations: [],
              lines: [],
            },
            mode: "METRO",
            selectedStopId: "HSL:STOP_M1",
            station: {
              departures: [
                {
                  departureIso: "2026-03-21T10:00:10.000Z",
                  destination: "Vuosaari",
                  line: "M1",
                  track: "1",
                },
                {
                  departureIso: "2026-03-21T10:07:00.000Z",
                  destination: "Mellunmaki",
                  line: "M2",
                  track: "2",
                },
              ],
              distanceMeters: 45,
              stopCode: "M1",
              stopCodes: ["M1"],
              stopName: "Kamppi",
              type: "stop",
            },
            stops: [],
          };
        },
      },
      {
        pattern: /^When the create-route departure board state is built$/,
        run: ({ world }) => {
          if (!world.response) {
            throw new Error("Expected departures response");
          }
          world.result = createDepartureBoardState({
            nowMs: Date.parse("2026-03-21T10:00:40.000Z"),
            response: world.response,
          });
        },
      },
      {
        pattern: /^Then the board state stop header is Kamppi platform M1$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.stopName, "Kamppi");
          assert.equal(world.result?.stopCode, "M1");
        },
      },
      {
        pattern: /^Then the board state contains 2 departures$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.departures.length, 2);
        },
      },
      {
        pattern: /^Then the first departure is line M1 to Vuosaari in 0 minutes with SUBWAY mode$/,
        run: ({ assert, world }) => {
          const firstDeparture = world.result?.departures[0];
          assert.equal(firstDeparture?.line, "M1");
          assert.equal(firstDeparture?.destination, "Vuosaari");
          assert.equal(firstDeparture?.minutes, 0);
          assert.equal(firstDeparture?.mode, "SUBWAY");
        },
      },
    ],
  }
);
