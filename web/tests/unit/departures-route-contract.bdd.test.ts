import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createApp } from "@server/app";
import type { Departure } from "@shared/domain/departure";
import type { Mode } from "@shared/domain/mode";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";

interface NearbyStopNode {
  distance: number;
  stop: {
    code?: string;
    gtfsId: string;
    name: string;
    vehicleMode: string;
  };
}

interface DigitransitServiceStub {
  getDeparturesForStopIds(stopIds: string[], options: { mode: Mode; resultLimit: number }): Promise<Map<string, Departure[]>>;
  getNearbyStops(input: { lat: number; lon: number; radius: number }): Promise<NearbyStopNode[]>;
}

interface World {
  payload?: DeparturesSuccessResponse;
  response?: Response;
  service?: DigitransitServiceStub;
}

defineFeature<World>(
  test,
  `
Feature: Departures route contract

  Scenario: Departures route returns no nearby stops message for the selected mode
    Given Digitransit returns no nearby bus stops
    When the departures route handles a nearby bus request
    Then the departures response status is 200
    And the departures response message is No nearby bus stops

  Scenario: Departures route returns grouped stop departures and filter options
    Given Digitransit returns nearby bus stops and departures
    When the departures route handles a nearby bus request with selected stop HSL:STOP_A
    Then the departures response status is 200
    And the selected stop id is HSL:STOP_A
    And the station departures include line 550 and 551
    And the departures filter options include line 550 count 2
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given Digitransit returns no nearby bus stops$/,
        run: ({ world }) => {
          world.service = {
            async getDeparturesForStopIds() {
              return new Map();
            },
            async getNearbyStops() {
              return [];
            },
          };
        },
      },
      {
        pattern: /^When the departures route handles a nearby bus request$/,
        run: async ({ world }) => {
          if (!world.service) {
            throw new Error("Expected Digitransit service");
          }
          const app = createApp({ digitransitService: world.service });
          world.response = await app.request(
            "http://localhost/api/v1/departures?lat=60.17&lon=24.94&mode=BUS"
          );
        },
      },
      {
        pattern: /^Then the departures response status is 200$/,
        run: ({ assert, world }) => {
          assert.equal(world.response?.status, 200);
        },
      },
      {
        pattern: /^Then the departures response message is No nearby bus stops$/,
        run: async ({ assert, world }) => {
          world.payload = (await world.response?.json()) as DeparturesSuccessResponse;
          assert.equal(world.payload.message, "No nearby bus stops");
        },
      },
      {
        pattern: /^Given Digitransit returns nearby bus stops and departures$/,
        run: ({ world }) => {
          world.service = {
            async getDeparturesForStopIds(stopIds) {
              const departuresByStopId = new Map<string, Departure[]>();
              for (const stopId of stopIds) {
                if (stopId === "HSL:STOP_A") {
                  departuresByStopId.set(stopId, [
                    {
                      departureIso: "2026-03-07T10:10:00.000Z",
                      destination: "Kamppi",
                      line: "550",
                      stopId,
                    },
                    {
                      departureIso: "2026-03-07T10:11:00.000Z",
                      destination: "Pasila",
                      line: "551",
                      stopId,
                    },
                    {
                      departureIso: "2026-03-07T10:12:00.000Z",
                      destination: "Kamppi",
                      line: "550",
                      stopId,
                    },
                  ]);
                }
              }
              return departuresByStopId;
            },
            async getNearbyStops() {
              return [
                {
                  distance: 80,
                  stop: {
                    code: "A1",
                    gtfsId: "HSL:STOP_A",
                    name: "Kamppi",
                    vehicleMode: "BUS",
                  },
                },
                {
                  distance: 120,
                  stop: {
                    code: "A2",
                    gtfsId: "HSL:STOP_B",
                    name: "Kamppi",
                    vehicleMode: "BUS",
                  },
                },
              ];
            },
          };
        },
      },
      {
        pattern: /^When the departures route handles a nearby bus request with selected stop HSL:STOP_A$/,
        run: async ({ world }) => {
          if (!world.service) {
            throw new Error("Expected Digitransit service");
          }
          const app = createApp({ digitransitService: world.service });
          world.response = await app.request(
            "http://localhost/api/v1/departures?lat=60.17&lon=24.94&mode=BUS&stopId=HSL:STOP_A"
          );
          world.payload = (await world.response.json()) as DeparturesSuccessResponse;
        },
      },
      {
        pattern: /^Then the selected stop id is HSL:STOP_A$/,
        run: ({ assert, world }) => {
          assert.equal(world.payload?.selectedStopId, "HSL:STOP_A");
        },
      },
      {
        pattern: /^Then the station departures include line 550 and 551$/,
        run: ({ assert, world }) => {
          const lines =
            world.payload?.station?.departures.map((departure) => departure.line).join("|") || "";
          assert.equal(lines, "550|551|550");
        },
      },
      {
        pattern: /^Then the departures filter options include line 550 count 2$/,
        run: ({ assert, world }) => {
          const line550 = world.payload?.filterOptions.lines.find((option) => option.value === "550");
          assert.equal(line550?.count, 2);
        },
      },
    ],
  }
);
