import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore } from "@client/app/app-store";
import { createAppController, type AppController } from "@client/app/app-controller";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";

interface World {
  controller?: AppController;
}

defineFeature<World>(
  test,
  `
Feature: Departures refresh

  Scenario: Refresh loads departures for current location
    Given the app controller has a successful location and departures service
    When nearby departures refresh is requested
    Then the load state is ready
    And the current station name is Kamppi
    And the stored coordinates equal 60.17 and 24.94
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app controller has a successful location and departures service$/,
        run: ({ world }) => {
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
      {
        pattern: /^Then the stored coordinates equal 60\.17 and 24\.94$/,
        run: ({ assert, world }) => {
          const coords = world.controller?.store.getState().coords;
          assert.equal(`${coords?.lat}|${coords?.lon}`, "60.17|24.94");
        },
      },
    ],
  }
);
