import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore } from "@client/app/app-store";
import { createAppController, type AppController } from "@client/app/app-controller";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";

interface World {
  controller?: AppController;
  lastRequest?: Parameters<DeparturesClient["getDepartures"]>[0];
}

function createDeparturesResponse(selectedStopId: string): DeparturesSuccessResponse {
  return {
    filterOptions: {
      destinations: [{ count: 1, value: "Kamppi" }],
      lines: [{ count: 1, value: "550" }],
    },
    mode: "BUS",
    selectedStopId,
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
      stopName: selectedStopId === "HSL:STOP_A" ? "Kamppi" : "Ruoholahti",
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
      {
        code: "B1",
        distanceMeters: 120,
        id: "HSL:STOP_B",
        memberStopIds: ["HSL:STOP_B"],
        name: "Ruoholahti",
        stopCodes: ["B1"],
      },
    ],
  };
}

defineFeature<World>(
  test,
  `
Feature: Stop selection

  Scenario: Selecting a stop reloads departures for that stop
    Given the app controller has nearby departures and active line filters
    When the user selects stop HSL:STOP_B
    Then the next departures request includes stop HSL:STOP_B
    And the line and destination filters are cleared
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app controller has nearby departures and active line filters$/,
        run: ({ world }) => {
          const store = createAppStore({
            activeMode: "BUS",
            coords: { lat: 60.17, lon: 24.94 },
          });
          store.applyDeparturesResponse(createDeparturesResponse("HSL:STOP_A"));
          store.toggleLineFilter("550");
          store.toggleDestinationFilter("Kamppi");

          const locationService: LocationService = {
            async getCurrentPosition() {
              return { code: "unavailable", ok: false };
            },
          };
          const departuresClient: DeparturesClient = {
            async getDepartures(input) {
              world.lastRequest = input;
              return createDeparturesResponse(input.stopId || "HSL:STOP_A");
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
        pattern: /^When the user selects stop (.+)$/,
        run: async ({ args, world }) => {
          if (!world.controller) {
            throw new Error("Expected app controller");
          }

          await world.controller.setSelectedStop(args[0]);
        },
      },
      {
        pattern: /^Then the next departures request includes stop (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.lastRequest?.stopId, args[0]);
        },
      },
      {
        pattern: /^Then the line and destination filters are cleared$/,
        run: ({ assert, world }) => {
          const filters = world.controller?.store.getState().filters;
          assert.equal(filters?.stopId, "HSL:STOP_B");
          assert.equal(filters?.lines.length || 0, 0);
          assert.equal(filters?.destinations.length || 0, 0);
        },
      },
    ],
  }
);
