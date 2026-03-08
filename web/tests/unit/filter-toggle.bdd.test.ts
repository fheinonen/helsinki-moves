import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore } from "@client/app/app-store";
import { createAppController, type AppController } from "@client/app/app-controller";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";

interface World {
  controller?: AppController;
  requests: Parameters<DeparturesClient["getDepartures"]>[0][];
}

function createDeparturesResponse(): DeparturesSuccessResponse {
  return {
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
    stops: [
      {
        code: "A1",
        distanceMeters: 80,
        id: "HSL:STOP_A",
        memberStopIds: ["HSL:STOP_A"],
        name: "Kamppi",
        stopCodes: ["A1"],
      },
    ],
  };
}

defineFeature<World>(
  test,
  `
Feature: Filter toggles

  Scenario: Toggling line and destination filters reloads departures with both selections
    Given the app controller has a selected stop with filter options
    When the line filter 550 is toggled
    And the destination filter Kamppi is toggled
    Then the latest departures request includes line 550
    And the latest departures request includes destination Kamppi
  `,
  {
    createWorld: () => ({ requests: [] }),
    stepDefinitions: [
      {
        pattern: /^Given the app controller has a selected stop with filter options$/,
        run: ({ world }) => {
          const store = createAppStore({
            activeMode: "BUS",
            coords: { lat: 60.17, lon: 24.94 },
          });
          store.applyDeparturesResponse(createDeparturesResponse());

          const locationService: LocationService = {
            async getCurrentPosition() {
              return { code: "unavailable", ok: false };
            },
          };
          const departuresClient: DeparturesClient = {
            async getDepartures(input) {
              world.requests.push(input);
              return createDeparturesResponse();
            },
          };

          world.controller = createAppController({
            departuresClient,
            locationService,
            store,
          });
        },
      },
      {
        pattern: /^When the line filter (.+) is toggled$/,
        run: async ({ args, world }) => {
          if (!world.controller) {
            throw new Error("Expected app controller");
          }

          await world.controller.toggleLineFilter(args[0]);
        },
      },
      {
        pattern: /^When the destination filter (.+) is toggled$/,
        run: async ({ args, world }) => {
          if (!world.controller) {
            throw new Error("Expected app controller");
          }

          await world.controller.toggleDestinationFilter(args[0]);
        },
      },
      {
        pattern: /^Then the latest departures request includes line (.+)$/,
        run: ({ args, assert, world }) => {
          const request = world.requests.at(-1);
          assert.equal(request?.lines.includes(args[0]), true);
        },
      },
      {
        pattern: /^Then the latest departures request includes destination (.+)$/,
        run: ({ args, assert, world }) => {
          const request = world.requests.at(-1);
          assert.equal(request?.destinations.includes(args[0]), true);
        },
      },
    ],
  }
);
