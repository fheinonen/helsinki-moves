import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createApp } from "@server/app";
import type { DigitransitService, NearbyStopNode } from "@server/services/digitransit/types";
import type { TransfersResponse } from "@shared/domain/transfer";

const ARRIVAL_ISO = "2026-03-07T12:20:00.000Z";

interface World {
  capturedStartSeconds?: number;
  digitransit?: DigitransitService;
  payload?: Partial<TransfersResponse> & { error?: string };
  response?: Response;
}

function createHubDigitransit(world: World, nearbyStops: NearbyStopNode[]): DigitransitService {
  return {
    async getDeparturesForStopIds(stopIds, options) {
      world.capturedStartSeconds = options.fetchWindow.startTimeUnixSeconds;
      const result = new Map();
      for (const stopId of stopIds) {
        if (stopId === "HSL:PASILA_RAIL") {
          result.set(stopId, [
            {
              departureIso: "2026-03-07T12:24:00.000Z",
              destination: "Lentoasema",
              line: "I",
              stopCode: "PSL",
              stopId,
              stopName: "Pasila",
              track: "4",
              tripId: "HSL:I_1424",
            },
          ]);
        }
        if (stopId === "HSL:PASILA_TRAM") {
          result.set(stopId, [
            {
              departureIso: "2026-03-07T12:23:00.000Z",
              destination: "Lansiterminaali",
              line: "9",
              stopCode: "H0612",
              stopId,
              stopName: "Pasilan asema",
              tripId: "HSL:TRAM_9",
            },
          ]);
        }
      }
      return result;
    },
    async getNearbyStops() {
      return nearbyStops;
    },
  };
}

const PASILA_STOPS: NearbyStopNode[] = [
  {
    distance: 40,
    stop: {
      code: "H2101",
      gtfsId: "HSL:PASILA_BUS",
      lat: 60.198,
      lon: 24.933,
      name: "Pasilan asema",
      vehicleMode: "BUS",
    },
  },
  {
    distance: 95,
    stop: {
      code: "H0612",
      gtfsId: "HSL:PASILA_TRAM",
      lat: 60.1985,
      lon: 24.9335,
      name: "Pasilan asema",
      vehicleMode: "TRAM",
    },
  },
  {
    distance: 140,
    stop: {
      code: "PSL",
      gtfsId: "HSL:PASILA_RAIL",
      lat: 60.1988,
      lon: 24.9338,
      name: "Pasila",
      vehicleMode: "RAIL",
    },
  },
];

defineFeature<World>(
  test,
  `
Feature: Transfers API route

  Scenario: Missing arrivalIso is rejected with status 400
    Given the transfers API is backed by Pasila hub stops
    When the transfers API is requested without arrivalIso
    Then the transfers API status is 400

  Scenario: Smart default selects RAIL at Pasila when arriving by BUS and fetches from 5 minutes before arrival
    Given the transfers API is backed by Pasila hub stops
    When the transfers API is requested at Pasila for a BUS rider arriving at 2026-03-07T12:20:00.000Z
    Then the transfers API status is 200
    And the transfers response selects mode RAIL with available modes RAIL, TRAM, BUS
    And the first transfer option is line I to Lentoasema
    And departures were queried starting 5 minutes before arrival

  Scenario: Explicit mode parameter switches onward transfers to TRAM
    Given the transfers API is backed by Pasila hub stops
    When the transfers API is requested at Pasila with explicit mode TRAM
    Then the transfers API status is 200
    And the transfers response selects mode TRAM with available modes RAIL, TRAM, BUS
    And the first transfer option is line 9 to Lansiterminaali

  Scenario: Empty area with no stops within 350m returns empty modes and options
    Given the transfers API has no stops nearby
    When the transfers API is requested at Pasila for a BUS rider arriving at 2026-03-07T12:20:00.000Z
    Then the transfers API status is 200
    And the transfers response has 0 available modes and 0 options

  Scenario: The Vercel transfers entrypoint validates missing coordinates
    When the Vercel transfers entrypoint is called without coordinates
    Then the transfers API status is 400

  Scenario: Subway stops normalize to METRO, unknown modes are skipped, and options deduplicate and sort chronologically
    Given the transfers API is backed by a Metro hub with ferry noise and duplicate departures
    When the transfers API is requested at Pasila for a BUS rider arriving at 2026-03-07T12:20:00.000Z
    Then the transfers API status is 200
    And the transfers response selects mode METRO with available modes METRO
    And the ordered transfer trips are HSL:M1_EARLY, HSL:M2_LATE
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the transfers API is backed by Pasila hub stops$/,
        run: ({ world }) => {
          world.digitransit = createHubDigitransit(world, PASILA_STOPS);
        },
      },
      {
        pattern: /^Given the transfers API is backed by a Metro hub with ferry noise and duplicate departures$/,
        run: ({ world }) => {
          const nodes: NearbyStopNode[] = [
            {
              distance: 80,
              stop: {
                code: "F1",
                gtfsId: "HSL:FERRY",
                lat: 60.16,
                lon: 24.95,
                name: "Kauppatori",
                vehicleMode: "FERRY",
              },
            },
            {
              distance: 150,
              stop: {
                code: "M2",
                gtfsId: "HSL:METRO_2",
                lat: 60.17,
                lon: 24.94,
                name: "Kamppi",
                vehicleMode: "SUBWAY",
              },
            },
            {
              distance: 90,
              stop: {
                code: "M1",
                gtfsId: "HSL:METRO_1",
                lat: 60.17,
                lon: 24.94,
                name: "Kamppi",
                vehicleMode: "SUBWAY",
              },
            },
          ];
          world.digitransit = {
            async getDeparturesForStopIds(stopIds) {
              const map = new Map();
              for (const stopId of stopIds) {
                map.set(stopId, [
                  {
                    departureIso: "2026-03-07T12:29:00.000Z",
                    destination: "Tapiola",
                    line: "M2",
                    stopId,
                    tripId: "HSL:M2_LATE",
                  },
                  {
                    departureIso: "2026-03-07T12:25:00.000Z",
                    destination: "Matinkyla",
                    line: "M1",
                    stopId,
                    tripId: "",
                  },
                  {
                    departureIso: "2026-03-07T12:24:00.000Z",
                    destination: "Kivenlahti",
                    line: "M1",
                    stopId,
                    tripId: "HSL:M1_EARLY",
                  },
                ]);
              }
              return map;
            },
            async getNearbyStops() {
              return nodes;
            },
          };
        },
      },
      {
        pattern: /^Given the transfers API has no stops nearby$/,
        run: ({ world }) => {
          world.digitransit = createHubDigitransit(world, []);
        },
      },
      {
        pattern: /^When the transfers API is requested without arrivalIso$/,
        run: async ({ world }) => {
          const app = createApp({ digitransitService: world.digitransit });
          world.response = await app.fetch(
            new Request("http://localhost/api/v1/transfers?lat=60.198&lon=24.933"),
          );
          world.payload = (await world.response.json()) as World["payload"];
        },
      },
      {
        pattern: /^When the transfers API is requested at Pasila for a (RAIL|TRAM|METRO|BUS) rider arriving at (.+)$/,
        run: async ({ args, world }) => {
          const app = createApp({ digitransitService: world.digitransit });
          world.response = await app.fetch(
            new Request(
              `http://localhost/api/v1/transfers?lat=60.198&lon=24.933&rideMode=${args[0]}&arrivalIso=${encodeURIComponent(args[1])}`,
            ),
          );
          world.payload = (await world.response.json()) as World["payload"];
        },
      },
      {
        pattern: /^When the transfers API is requested at Pasila with explicit mode (RAIL|TRAM|METRO|BUS)$/,
        run: async ({ args, world }) => {
          const app = createApp({ digitransitService: world.digitransit });
          world.response = await app.fetch(
            new Request(
              `http://localhost/api/v1/transfers?lat=60.198&lon=24.933&rideMode=BUS&mode=${args[0]}&arrivalIso=${encodeURIComponent(ARRIVAL_ISO)}`,
            ),
          );
          world.payload = (await world.response.json()) as World["payload"];
        },
      },
      {
        pattern: /^When the Vercel transfers entrypoint is called without coordinates$/,
        run: async ({ world }) => {
          const app = (await import("../../api/v1/transfers")).default;
          world.response = await app.fetch(
            new Request(`http://localhost/api/v1/transfers?arrivalIso=${encodeURIComponent(ARRIVAL_ISO)}`),
          );
          world.payload = (await world.response.json()) as World["payload"];
        },
      },
      {
        pattern: /^Then the transfers API status is (\d+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.response?.status, Number(args[0]));
        },
      },
      {
        pattern: /^Then the transfers response selects mode (RAIL|TRAM|METRO|BUS) with available modes (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.payload?.mode, args[0]);
          assert.equal(world.payload?.availableModes?.join(", "), args[1]);
        },
      },
      {
        pattern: /^Then the first transfer option is line (.+) to (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.payload?.options?.[0]?.line, args[0]);
          assert.equal(world.payload?.options?.[0]?.destination, args[1]);
        },
      },
      {
        pattern: /^Then departures were queried starting 5 minutes before arrival$/,
        run: ({ assert, world }) => {
          const expected = Math.floor((Date.parse(ARRIVAL_ISO) - 5 * 60_000) / 1000);
          assert.equal(world.capturedStartSeconds, expected);
        },
      },
      {
        pattern: /^Then the transfers response has (\d+) available modes and (\d+) options$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.payload?.availableModes?.length, Number(args[0]));
          assert.equal(world.payload?.options?.length, Number(args[1]));
        },
      },
      {
        pattern: /^Then the ordered transfer trips are (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(
            world.payload?.options?.map((option) => option.tripId).join(", "),
            args[0],
          );
        },
      },
    ],
  },
);
