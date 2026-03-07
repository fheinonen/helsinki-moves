import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createDigitransitService } from "@server/services/digitransit/client";
import type { NearbyStopNode } from "@server/services/digitransit/types";

interface World {
  currentTime: number;
  departuresLookupCount: number;
  nearbyLookupCount: number;
  nearbyStopsResults?: NearbyStopNode[][];
}

defineFeature<World>(
  test,
  `
Feature: Digitransit nearby stop caching

  Scenario: Identical nearby stop lookups reuse a recent upstream result
    Given Digitransit nearby stops upstream returns one nearby stop
    When the same nearby stop lookup is requested twice within the cache window
    Then the nearby stop upstream is called once
    And both nearby stop results include stop HSL:STOP_A

  Scenario: Nearby stop lookups refresh after the cache window expires
    Given Digitransit nearby stops upstream returns one nearby stop
    When the same nearby stop lookup is requested after the cache window
    Then the nearby stop upstream is called twice

  Scenario: Departures requests are not cached between identical calls
    Given Digitransit departures upstream returns one departure
    When the same departures lookup is requested twice
    Then the departures upstream is called twice
  `,
  {
    createWorld: () => ({
      currentTime: 1_000,
      departuresLookupCount: 0,
      nearbyLookupCount: 0,
    }),
    stepDefinitions: [
      {
        pattern: /^Given Digitransit nearby stops upstream returns one nearby stop$/,
        run: ({ world }) => {
          world.currentTime = 1_000;
          world.departuresLookupCount = 0;
          world.nearbyLookupCount = 0;
          world.nearbyStopsResults = [];
        },
      },
      {
        pattern: /^When the same nearby stop lookup is requested twice within the cache window$/,
        run: async ({ world }) => {
          const service = createDigitransitService({
            fetchImpl: async (_url, init) => {
              const body = JSON.parse(String(init?.body || "{}")) as { query?: string };
              if (body.query?.includes("stopsByRadius")) {
                world.nearbyLookupCount += 1;
                return new Response(
                  JSON.stringify({
                    data: {
                      stopsByRadius: {
                        edges: [
                          {
                            node: {
                              distance: 80,
                              stop: {
                                code: "A1",
                                gtfsId: "HSL:STOP_A",
                                name: "Kamppi",
                                vehicleMode: "BUS",
                              },
                            },
                          },
                        ],
                      },
                    },
                  }),
                  { status: 200 }
                );
              }
              throw new Error("Unexpected query");
            },
            getApiKey: () => "test-key",
            nearbyStopsCacheTtlMs: 15_000,
            now: () => world.currentTime,
          });

          world.nearbyStopsResults = [
            await service.getNearbyStops({ lat: 60.17, lon: 24.94, radius: 1200 }),
            await service.getNearbyStops({ lat: 60.17, lon: 24.94, radius: 1200 }),
          ];
        },
      },
      {
        pattern: /^Then the nearby stop upstream is called once$/,
        run: ({ assert, world }) => {
          assert.equal(world.nearbyLookupCount, 1);
        },
      },
      {
        pattern: /^Then the nearby stop upstream is called twice$/,
        run: ({ assert, world }) => {
          assert.equal(world.nearbyLookupCount, 2);
        },
      },
      {
        pattern: /^Then both nearby stop results include stop HSL:STOP_A$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.nearbyStopsResults?.every(
              (result) => result[0]?.stop.gtfsId === "HSL:STOP_A" && result.length === 1
            ),
            true
          );
        },
      },
      {
        pattern: /^When the same nearby stop lookup is requested after the cache window$/,
        run: async ({ world }) => {
          const service = createDigitransitService({
            fetchImpl: async (_url, init) => {
              const body = JSON.parse(String(init?.body || "{}")) as { query?: string };
              if (!body.query?.includes("stopsByRadius")) {
                throw new Error("Unexpected query");
              }

              world.nearbyLookupCount += 1;
              return new Response(
                JSON.stringify({
                  data: {
                    stopsByRadius: {
                      edges: [
                        {
                          node: {
                            distance: 80,
                            stop: {
                              code: "A1",
                              gtfsId: "HSL:STOP_A",
                              name: "Kamppi",
                              vehicleMode: "BUS",
                            },
                          },
                        },
                      ],
                    },
                  },
                }),
                { status: 200 }
              );
            },
            getApiKey: () => "test-key",
            nearbyStopsCacheTtlMs: 15_000,
            now: () => world.currentTime,
          });

          await service.getNearbyStops({ lat: 60.17, lon: 24.94, radius: 1200 });
          world.currentTime += 15_001;
          await service.getNearbyStops({ lat: 60.17, lon: 24.94, radius: 1200 });
        },
      },
      {
        pattern: /^Given Digitransit departures upstream returns one departure$/,
        run: ({ world }) => {
          world.currentTime = 1_000;
          world.departuresLookupCount = 0;
          world.nearbyLookupCount = 0;
        },
      },
      {
        pattern: /^When the same departures lookup is requested twice$/,
        run: async ({ world }) => {
          const service = createDigitransitService({
            fetchImpl: async (_url, init) => {
              const body = JSON.parse(String(init?.body || "{}")) as { query?: string };
              if (!body.query?.includes("MultiStopDepartures")) {
                throw new Error("Unexpected query");
              }

              world.departuresLookupCount += 1;
              return new Response(
                JSON.stringify({
                  data: {
                    s0: {
                      platformCode: "1",
                      stoptimesWithoutPatterns: [
                        {
                          headsign: "Kamppi",
                          realtimeDeparture: 120,
                          serviceDay: 1_900_000_000,
                          stop: {
                            code: "A1",
                            gtfsId: "HSL:STOP_A",
                            name: "Kamppi",
                            platformCode: "1",
                          },
                          trip: {
                            route: {
                              mode: "BUS",
                              shortName: "550",
                            },
                          },
                        },
                      ],
                    },
                  },
                }),
                { status: 200 }
              );
            },
            getApiKey: () => "test-key",
            nearbyStopsCacheTtlMs: 15_000,
            now: () => world.currentTime,
          });

          await service.getDeparturesForStopIds(["HSL:STOP_A"], {
            mode: "BUS",
            resultLimit: 5,
          });
          await service.getDeparturesForStopIds(["HSL:STOP_A"], {
            mode: "BUS",
            resultLimit: 5,
          });
        },
      },
      {
        pattern: /^Then the departures upstream is called twice$/,
        run: ({ assert, world }) => {
          assert.equal(world.departuresLookupCount, 2);
        },
      },
    ],
  }
);
