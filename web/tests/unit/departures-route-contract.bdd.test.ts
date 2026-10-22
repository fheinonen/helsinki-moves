import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createApp } from "@server/app";
import type { Departure } from "@shared/domain/departure";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";

const FIXTURE_NOW_MS = Date.parse("2026-03-07T10:09:00.000Z");

interface NearbyStopNode {
  distance: number;
  stop: {
    code?: string;
    gtfsId: string;
    lat?: number;
    lon?: number;
    name: string;
    vehicleMode: string;
  };
}

interface DigitransitServiceStub {
  getDeparturesForStopIds(stopIds: string[]): Promise<Map<string, Departure[]>>;
  getNearbyStops(input: { lat: number; lon: number; radius: number }): Promise<NearbyStopNode[]>;
  getStopPoint?(stopId: string): Promise<{ lat: number; lon: number } | null>;
}

interface World {
  nearbySearchCount?: number;
  nearbySearchOrigin?: string;
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

  Scenario: A bookmarked stop without coordinates is searched from that stop
    Given Digitransit can locate bookmarked stop HSL:OLD at 60.2, 24.9
    When the departures route handles a bus request for stop HSL:OLD without coordinates
    Then the nearby search origin is 60.2|24.9
    And the response selected stop id is HSL:OLD
    And the selected stop coordinates are 60.2|24.9

  Scenario: An unknown bookmarked stop returns no nearby stops
    Given Digitransit cannot locate bookmarked stop HSL:MISSING
    When the departures route handles a bus request for stop HSL:MISSING without coordinates
    Then the departures response status is 200
    And the departures response message is No nearby bus stops
    And nearby stops were not searched

  Scenario: Line filtering preserves departure order across grouped stop members
    Given Digitransit returns grouped stop members with interleaved line departures
    When the departures route handles a nearby bus request with selected stop HSL:STOP_A and line 550
    Then the filtered station departures stay in chronological order
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
          const app = createApp({ digitransitService: world.service, now: () => FIXTURE_NOW_MS });
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
          const app = createApp({ digitransitService: world.service, now: () => FIXTURE_NOW_MS });
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
      {
        pattern: /^Given Digitransit returns grouped stop members with interleaved line departures$/,
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
                      departureIso: "2026-03-07T10:14:00.000Z",
                      destination: "Kamppi",
                      line: "550",
                      stopId,
                    },
                  ]);
                }
                if (stopId === "HSL:STOP_B") {
                  departuresByStopId.set(stopId, [
                    {
                      departureIso: "2026-03-07T10:11:00.000Z",
                      destination: "Ruoholahti",
                      line: "550",
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
        pattern: /^When the departures route handles a nearby bus request with selected stop HSL:STOP_A and line 550$/,
        run: async ({ world }) => {
          if (!world.service) {
            throw new Error("Expected Digitransit service");
          }
          const app = createApp({ digitransitService: world.service, now: () => FIXTURE_NOW_MS });
          world.response = await app.request(
            "http://localhost/api/v1/departures?lat=60.17&lon=24.94&mode=BUS&stopId=HSL:STOP_A&line=550"
          );
          world.payload = (await world.response.json()) as DeparturesSuccessResponse;
        },
      },
      {
        pattern: /^Given Digitransit can locate bookmarked stop HSL:OLD at 60\.2, 24\.9$/,
        run: ({ world }) => {
          world.nearbySearchCount = 0;
          world.service = {
            async getDeparturesForStopIds() {
              return new Map([
                [
                  "HSL:OLD",
                  [
                    {
                      departureIso: "2026-03-07T10:10:00.000Z",
                      destination: "Old Terminal",
                      line: "550",
                      stopId: "HSL:OLD",
                    },
                  ],
                ],
              ]);
            },
            async getNearbyStops(input) {
              world.nearbySearchCount = (world.nearbySearchCount || 0) + 1;
              world.nearbySearchOrigin = `${input.lat}|${input.lon}`;
              return [
                {
                  distance: 0,
                  stop: {
                    code: "O200",
                    gtfsId: "HSL:OLD",
                    lat: input.lat,
                    lon: input.lon,
                    name: "Old Terminal",
                    vehicleMode: "BUS",
                  },
                },
              ];
            },
            async getStopPoint() {
              return { lat: 60.2, lon: 24.9 };
            },
          };
        },
      },
      {
        pattern: /^Given Digitransit cannot locate bookmarked stop HSL:MISSING$/,
        run: ({ world }) => {
          world.nearbySearchCount = 0;
          world.service = {
            async getDeparturesForStopIds() {
              return new Map();
            },
            async getNearbyStops() {
              world.nearbySearchCount = (world.nearbySearchCount || 0) + 1;
              return [];
            },
            async getStopPoint() {
              return null;
            },
          };
        },
      },
      {
        pattern: /^When the departures route handles a bus request for stop (.+) without coordinates$/,
        run: async ({ args, world }) => {
          if (!world.service) {
            throw new Error("Expected Digitransit service");
          }
          const app = createApp({ digitransitService: world.service, now: () => FIXTURE_NOW_MS });
          world.response = await app.request(
            `http://localhost/api/v1/departures?mode=BUS&stopId=${args[0]}`
          );
        },
      },
      {
        pattern: /^Then the response selected stop id is (.+)$/,
        run: async ({ args, assert, world }) => {
          world.payload = (await world.response?.json()) as DeparturesSuccessResponse;
          assert.equal(world.payload.selectedStopId, args[0]);
        },
      },
      {
        pattern: /^Then the nearby search origin is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.nearbySearchOrigin, args[0]);
        },
      },
      {
        pattern: /^Then the selected stop coordinates are (.+)$/,
        run: ({ args, assert, world }) => {
          const stop = world.payload?.stops.find((item) => item.id === world.payload?.selectedStopId);
          assert.equal(`${stop?.lat}|${stop?.lon}`, args[0]);
        },
      },
      {
        pattern: /^Then nearby stops were not searched$/,
        run: ({ assert, world }) => {
          assert.equal(world.nearbySearchCount, 0);
        },
      },
      {
        pattern: /^Then the filtered station departures stay in chronological order$/,
        run: ({ assert, world }) => {
          const departures =
            world.payload?.station?.departures
              .map((departure) => `${departure.departureIso}:${departure.destination}`)
              .join("|") || "";
          assert.equal(
            departures,
            [
              "2026-03-07T10:10:00.000Z:Kamppi",
              "2026-03-07T10:11:00.000Z:Ruoholahti",
              "2026-03-07T10:12:00.000Z:Kamppi",
              "2026-03-07T10:14:00.000Z:Kamppi",
            ].join("|")
          );
        },
      },
    ],
  }
);
