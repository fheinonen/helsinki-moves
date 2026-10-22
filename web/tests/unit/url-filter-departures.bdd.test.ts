import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore, type AppStore } from "@client/app/app-store";
import { createAppController, type AppController } from "@client/app/app-controller";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";

interface RecordedRequest {
  destinations: string[];
  lines: string[];
}

interface World {
  controller?: AppController;
  requests?: RecordedRequest[];
  store?: AppStore;
}

function offeredResponse(line: string | null): DeparturesSuccessResponse {
  const departures = line
    ? []
    : [
        {
          departureIso: "2026-03-07T10:10:00.000Z",
          destination: "Kamppi",
          line: "550",
        },
      ];
  return {
    filterOptions: {
      destinations: [{ count: 1, value: "Kamppi" }],
      lines: [{ count: 1, value: "550" }],
    },
    mode: "BUS",
    selectedStopId: "HSL:NEAR",
    station: {
      departures,
      distanceMeters: 80,
      stopCode: "N100",
      stopCodes: ["N100"],
      stopName: "Nearest Stop",
      type: "stop",
    },
    stops: [
      {
        code: "N100",
        distanceMeters: 80,
        id: "HSL:NEAR",
        memberStopIds: ["HSL:NEAR"],
        name: "Nearest Stop",
        stopCodes: ["N100"],
      },
    ],
  };
}

defineFeature<World>(
  test,
  `
Feature: URL filter departures

  Scenario: An unavailable line filter reloads departures without that line
    Given line filter 999 is active before refresh
    And departures hide rows only while an unknown line filter is set
    When nearby departures refresh is requested for a URL filter
    Then the first departures request line equals 999
    And the latest departures request has no line filter
    And the visible departure line is 550
    And the line filters are empty after reload
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given line filter 999 is active before refresh$/,
        run: ({ world }) => {
          const store = createAppStore({ activeMode: "BUS" });
          store.setLineAndDestinationFilters(["999"], []);
          world.store = store;
        },
      },
      {
        pattern: /^Given departures hide rows only while an unknown line filter is set$/,
        run: ({ world }) => {
          if (!world.store) {
            throw new Error("Expected app store");
          }
          const requests: RecordedRequest[] = [];
          world.requests = requests;
          const locationService: LocationService = {
            async getCurrentPosition() {
              return {
                ok: true,
                value: { lat: 60.17, lon: 24.94 },
              };
            },
          };
          const departuresClient: DeparturesClient = {
            async getDepartures(input) {
              requests.push({
                destinations: [...input.destinations],
                lines: [...input.lines],
              });
              const requestedLine = input.lines[0] || null;
              return offeredResponse(requestedLine);
            },
          };
          world.controller = createAppController({
            departuresClient,
            locationService,
            store: world.store,
          });
        },
      },
      {
        pattern: /^When nearby departures refresh is requested for a URL filter$/,
        run: async ({ world }) => {
          if (!world.controller) {
            throw new Error("Expected app controller");
          }
          await world.controller.refreshNearbyDepartures();
        },
      },
      {
        pattern: /^Then the first departures request line equals 999$/,
        run: ({ assert, world }) => {
          assert.equal(world.requests?.[0]?.lines.join("|"), "999");
        },
      },
      {
        pattern: /^Then the latest departures request has no line filter$/,
        run: ({ assert, world }) => {
          const latest = world.requests?.[world.requests.length - 1];
          assert.equal(latest?.lines.length, 0);
        },
      },
      {
        pattern: /^Then the visible departure line is 550$/,
        run: ({ assert, world }) => {
          assert.equal(world.store?.getState().station?.departures[0]?.line, "550");
        },
      },
      {
        pattern: /^Then the line filters are empty after reload$/,
        run: ({ assert, world }) => {
          assert.equal(world.store?.getState().filters.lines.length, 0);
        },
      },
    ],
  }
);
