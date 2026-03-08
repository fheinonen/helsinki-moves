import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore } from "@client/app/app-store";
import { createAppController, type AppController } from "@client/app/app-controller";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";

interface World {
  callCount?: number;
  controller?: AppController;
}

defineFeature<World>(
  test,
  `
Feature: Departures retry

  Scenario: A transient departures failure is retried once
    Given the app controller has a transient departures failure
    When nearby departures refresh is requested
    Then departures are requested twice
    And the load state is ready
    And the current station name is Kamppi
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app controller has a transient departures failure$/,
        run: ({ world }) => {
          world.callCount = 0;

          const locationService: LocationService = {
            async getCurrentPosition() {
              return {
                ok: true,
                value: { lat: 60.17, lon: 24.94 },
              };
            },
          };

          const departuresResponse: DeparturesSuccessResponse = {
            filterOptions: {
              destinations: [{ count: 1, value: "Kamppi" }],
              lines: [{ count: 1, value: "550" }],
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
              ],
              distanceMeters: 80,
              stopCode: "A1",
              stopCodes: ["A1"],
              stopName: "Kamppi",
              type: "stop",
            },
            stops: [],
          };

          const departuresClient: DeparturesClient = {
            async getDepartures() {
              world.callCount = (world.callCount || 0) + 1;
              if (world.callCount === 1) {
                throw new Error("temporary upstream failure");
              }
              return departuresResponse;
            },
          };

          world.controller = createAppController({
            departuresClient,
            locationService,
            store: createAppStore({ activeMode: "BUS" }),
          });
        },
      },
      {
        pattern: /^When nearby departures refresh is requested$/,
        run: async ({ world }) => {
          if (!world.controller) {
            throw new Error("Expected app controller");
          }
          await world.controller.refreshNearbyDepartures();
        },
      },
      {
        pattern: /^Then departures are requested twice$/,
        run: ({ assert, world }) => {
          assert.equal(world.callCount, 2);
        },
      },
      {
        pattern: /^Then the load state is ready$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().loadState, "ready");
        },
      },
      {
        pattern: /^Then the current station name is Kamppi$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().station?.stopName, "Kamppi");
        },
      },
    ],
  }
);
