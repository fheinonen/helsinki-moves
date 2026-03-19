import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createApp } from "@server/app";
import type { DestinationCorrectionService } from "@server/services/digitransit/destination-correction-service";
import type { Departure } from "@shared/domain/departure";
import type { Mode } from "@shared/domain/mode";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { RouteItinerary, RoutePlanRequest } from "@shared/contracts/routes-contract";

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
  getRoutes(input: RoutePlanRequest): Promise<RouteItinerary[]>;
}

interface World {
  correctionService?: DestinationCorrectionService;
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

  Scenario: Line filtering preserves departure order across grouped stop members
    Given Digitransit returns grouped stop members with interleaved line departures
    When the departures route handles a nearby bus request with selected stop HSL:STOP_A and line 550
    Then the filtered station departures stay in chronological order

  Scenario: Filtered nearby departures prefer the nearest stop with matching results
    Given Digitransit returns nearby bus stops where only the second stop matches line 59 to Pasila
    When the departures route handles a nearby bus request with line 59 and destination Pasila
    Then the selected stop id is HSL:STOP_B
    And the station departures include destination Herttoniemi(M) via Pasila as.

  Scenario: Nearby departures prefer the nearest stop with any live departures
    Given Digitransit returns nearby bus stops where only the second stop has live departures
    When the departures route handles a nearby bus request
    Then the selected stop id is HSL:STOP_B
    And the station departures include destination Herttoniemi(M) via Pasila as.

  Scenario: High-confidence destination correction auto-picks a live candidate
    Given Digitransit returns nearby bus stops with a Pasila station destination
    And destination correction suggests Pasila station with high confidence
    When the departures route handles a nearby bus request with destination Tripla
    Then the selected stop id is HSL:STOP_B
    And the station departures include destination Herttoniemi(M) via Pasila as.
    And the destination resolution is auto-corrected from Tripla to Herttoniemi(M) via Pasila as.
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
            async getRoutes() {
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
          const app = createApp({
            destinationCorrectionService: world.correctionService,
            digitransitService: world.service,
          });
          world.response = await app.request(
            "http://localhost/api/v1/departures?lat=60.17&lon=24.94&mode=BUS"
          );
          world.payload = (await world.response.json()) as DeparturesSuccessResponse;
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
          world.payload =
            world.payload || ((await world.response?.json()) as DeparturesSuccessResponse);
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
            async getRoutes() {
              return [];
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
          const app = createApp({
            destinationCorrectionService: world.correctionService,
            digitransitService: world.service,
          });
          world.response = await app.request(
            "http://localhost/api/v1/departures?lat=60.17&lon=24.94&mode=BUS&stopId=HSL:STOP_A"
          );
          world.payload = (await world.response.json()) as DeparturesSuccessResponse;
        },
      },
      {
        pattern: /^Then the selected stop id is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.payload?.selectedStopId, args[0]);
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
            async getRoutes() {
              return [];
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
          const app = createApp({
            destinationCorrectionService: world.correctionService,
            digitransitService: world.service,
          });
          world.response = await app.request(
            "http://localhost/api/v1/departures?lat=60.17&lon=24.94&mode=BUS&stopId=HSL:STOP_A&line=550"
          );
          world.payload = (await world.response.json()) as DeparturesSuccessResponse;
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
      {
        pattern: /^Given Digitransit returns nearby bus stops where only the second stop matches line 59 to Pasila$/,
        run: ({ world }) => {
          world.service = {
            async getDeparturesForStopIds(stopIds) {
              const departuresByStopId = new Map<string, Departure[]>();
              for (const stopId of stopIds) {
                if (stopId === "HSL:STOP_A") {
                  departuresByStopId.set(stopId, []);
                }
                if (stopId === "HSL:STOP_B") {
                  departuresByStopId.set(stopId, [
                    {
                      departureIso: "2026-03-07T10:10:00.000Z",
                      destination: "Herttoniemi(M) via Pasila as.",
                      line: "59",
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
                  distance: 120,
                  stop: {
                    code: "A1",
                    gtfsId: "HSL:STOP_A",
                    name: "Vanha Turun maantie",
                    vehicleMode: "BUS",
                  },
                },
                {
                  distance: 170,
                  stop: {
                    code: "B1",
                    gtfsId: "HSL:STOP_B",
                    name: "Talontie",
                    vehicleMode: "BUS",
                  },
                },
              ];
            },
            async getRoutes() {
              return [];
            },
          };
        },
      },
      {
        pattern: /^Given Digitransit returns nearby bus stops where only the second stop has live departures$/,
        run: ({ world }) => {
          world.service = {
            async getDeparturesForStopIds(stopIds) {
              const departuresByStopId = new Map<string, Departure[]>();
              for (const stopId of stopIds) {
                if (stopId === "HSL:STOP_A") {
                  departuresByStopId.set(stopId, []);
                }
                if (stopId === "HSL:STOP_B") {
                  departuresByStopId.set(stopId, [
                    {
                      departureIso: "2026-03-07T10:10:00.000Z",
                      destination: "Herttoniemi(M) via Pasila as.",
                      line: "59",
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
                  distance: 120,
                  stop: {
                    code: "A1",
                    gtfsId: "HSL:STOP_A",
                    name: "Vanha Turun maantie",
                    vehicleMode: "BUS",
                  },
                },
                {
                  distance: 170,
                  stop: {
                    code: "B1",
                    gtfsId: "HSL:STOP_B",
                    name: "Talontie",
                    vehicleMode: "BUS",
                  },
                },
              ];
            },
            async getRoutes() {
              return [];
            },
          };
        },
      },
      {
        pattern: /^Given Digitransit returns nearby bus stops with a Pasila station destination$/,
        run: ({ world }) => {
          world.service = {
            async getDeparturesForStopIds(stopIds) {
              const departuresByStopId = new Map<string, Departure[]>();
              for (const stopId of stopIds) {
                if (stopId === "HSL:STOP_A") {
                  departuresByStopId.set(stopId, [
                    {
                      departureIso: "2026-03-07T10:09:00.000Z",
                      destination: "Kamppi",
                      line: "37",
                      stopId,
                    },
                  ]);
                }
                if (stopId === "HSL:STOP_B") {
                  departuresByStopId.set(stopId, [
                    {
                      departureIso: "2026-03-07T10:10:00.000Z",
                      destination: "Herttoniemi(M) via Pasila as.",
                      line: "59",
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
                  distance: 120,
                  stop: {
                    code: "A1",
                    gtfsId: "HSL:STOP_A",
                    name: "Vanha Turun maantie",
                    vehicleMode: "BUS",
                  },
                },
                {
                  distance: 170,
                  stop: {
                    code: "B1",
                    gtfsId: "HSL:STOP_B",
                    name: "Talontie",
                    vehicleMode: "BUS",
                  },
                },
              ];
            },
            async getRoutes() {
              return [];
            },
          };
        },
      },
      {
        pattern: /^(Given|And) destination correction suggests Pasila station with high confidence$/,
        run: ({ world }) => {
          world.correctionService = {
            async suggest() {
              return [
                {
                  candidate: "Herttoniemi(M) via Pasila as.",
                  confidence: 0.96,
                },
                {
                  candidate: "Kamppi",
                  confidence: 0.4,
                },
              ];
            },
          };
        },
      },
      {
        pattern: /^When the departures route handles a nearby bus request with line 59 and destination Pasila$/,
        run: async ({ world }) => {
          if (!world.service) {
            throw new Error("Expected Digitransit service");
          }
          const app = createApp({
            destinationCorrectionService: world.correctionService,
            digitransitService: world.service,
          });
          world.response = await app.request(
            "http://localhost/api/v1/departures?lat=60.17&lon=24.94&mode=BUS&line=59&dest=Pasila&lineIntent=1"
          );
          world.payload = (await world.response.json()) as DeparturesSuccessResponse;
        },
      },
      {
        pattern: /^When the departures route handles a nearby bus request with destination Tripla$/,
        run: async ({ world }) => {
          if (!world.service) {
            throw new Error("Expected Digitransit service");
          }
          const app = createApp({
            destinationCorrectionService: world.correctionService,
            digitransitService: world.service,
          });
          world.response = await app.request(
            "http://localhost/api/v1/departures?lat=60.17&lon=24.94&mode=BUS&dest=Tripla"
          );
          world.payload = (await world.response.json()) as DeparturesSuccessResponse;
        },
      },
      {
        pattern: /^(Then|And) the station departures include destination Herttoniemi\(M\) via Pasila as\.$/,
        run: ({ assert, world }) => {
          const destinations =
            world.payload?.station?.departures.map((departure) => departure.destination).join("|") || "";
          assert.equal(destinations, "Herttoniemi(M) via Pasila as.");
        },
      },
      {
        pattern: /^(Then|And) the destination resolution is auto-corrected from Tripla to Herttoniemi\(M\) via Pasila as\.$/,
        run: ({ assert, world }) => {
          assert.equal(world.payload?.destinationResolution?.type, "auto-corrected");
          assert.equal(world.payload?.destinationResolution?.input, "Tripla");
          assert.equal(
            world.payload?.destinationResolution?.resolved,
            "Herttoniemi(M) via Pasila as."
          );
        },
      },
    ],
  }
);
