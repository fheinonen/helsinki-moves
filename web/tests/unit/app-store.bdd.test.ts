import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore, type AppStore } from "@client/app/app-store";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";

interface World {
  response?: DeparturesSuccessResponse;
  store?: AppStore;
}

defineFeature<World>(
  test,
  `
Feature: App store

  Scenario: Applying departures response updates the app state
    Given the app store starts in rail mode
    And a departures response for bus mode with two departures
    When the departures response is applied to the app store
    Then the active mode is BUS
    And the selected stop id is HSL:STOP_A
    And the visible departure count is 2
    And the current station name is Kamppi

  Scenario: Selecting a new mode updates the active mode
    Given the app store starts in rail mode
    When bus mode is selected in the app store
    Then the active mode is BUS
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app store starts in rail mode$/,
        run: ({ world }) => {
          world.store = createAppStore();
        },
      },
      {
        pattern: /^Given a departures response for bus mode with two departures$/,
        run: ({ world }) => {
          world.response = {
            filterOptions: {
              destinations: [
                { count: 1, value: "Kamppi" },
                { count: 1, value: "Pasila" },
              ],
              lines: [
                { count: 1, value: "550" },
                { count: 1, value: "551" },
              ],
            },
            mode: "BUS",
            selectedStopId: "HSL:STOP_A",
            station: {
              departures: [
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
              ],
              distanceMeters: 80,
              stopCode: "A1",
              stopCodes: ["A1"],
              stopName: "Kamppi",
              type: "stop",
            },
            stops: [],
          };
        },
      },
      {
        pattern: /^When the departures response is applied to the app store$/,
        run: ({ world }) => {
          if (!world.store || !world.response) {
            throw new Error("Expected store and departures response");
          }
          world.store.applyDeparturesResponse(world.response);
        },
      },
      {
        pattern: /^When bus mode is selected in the app store$/,
        run: ({ world }) => {
          if (!world.store) {
            throw new Error("Expected app store");
          }
          world.store.setMode("BUS");
        },
      },
      {
        pattern: /^Then the active mode is BUS$/,
        run: ({ assert, world }) => {
          assert.equal(world.store?.getState().activeMode, "BUS");
        },
      },
      {
        pattern: /^Then the selected stop id is HSL:STOP_A$/,
        run: ({ assert, world }) => {
          assert.equal(world.store?.getState().selectedStopId, "HSL:STOP_A");
        },
      },
      {
        pattern: /^Then the visible departure count is 2$/,
        run: ({ assert, world }) => {
          assert.equal(world.store?.getState().station?.departures.length, 2);
        },
      },
      {
        pattern: /^Then the current station name is Kamppi$/,
        run: ({ assert, world }) => {
          assert.equal(world.store?.getState().station?.stopName, "Kamppi");
        },
      },
    ],
  }
);
