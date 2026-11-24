import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createApp } from "@server/app";
import { createDigitransitService } from "@server/services/digitransit/client";
import type { DigitransitService } from "@server/services/digitransit/types";
import type { RideSnapshot } from "@shared/domain/ride";

interface World {
  digitransit?: DigitransitService;
  graphqlQuery?: string;
  graphqlVariables?: Record<string, unknown>;
  payload?: Partial<RideSnapshot> & { error?: string };
  parsedRide?: RideSnapshot | null;
  response?: Response;
}

function createTripRideData(): Omit<RideSnapshot, "vehicle"> {
  return {
    destination: "Kamppi",
    line: "4",
    mode: "TRAM",
    route: [
      { lat: 60.185, lon: 24.92 },
      { lat: 60.17, lon: 24.94 },
    ],
    stops: [
      {
        arrivalIso: "2026-03-07T12:31:00.000Z",
        code: "H0102",
        lat: 60.185,
        lon: 24.92,
        name: "Meilahti",
        platform: null,
        realtime: true,
        stopId: "HSL:2",
      },
      {
        arrivalIso: "2026-03-07T12:40:00.000Z",
        code: "H0105",
        lat: 60.17,
        lon: 24.94,
        name: "Kamppi",
        platform: "2",
        realtime: true,
        stopId: "HSL:5",
      },
    ],
    tripId: "HSL:TRIP_4",
  };
}

function createStubDigitransit(input: {
  ride: Omit<RideSnapshot, "vehicle"> | null;
  vehicle: { lat: number; lon: number } | null;
}): DigitransitService {
  return {
    async getDeparturesForStopIds() {
      return new Map();
    },
    async getNearbyStops() {
      return [];
    },
    async getTripRide(tripId: string) {
      return tripId === input.ride?.tripId ? input.ride : null;
    },
    async getVehicleFix() {
      return input.vehicle;
    },
  };
}

defineFeature<World>(
  test,
  `
Feature: Ride API route

  Scenario: Missing tripId is rejected with status 400
    Given the ride API is backed by a live tram trip
    When the ride API is requested without a trip id
    Then the ride API status is 400

  Scenario: Unknown trip returns status 404
    Given the ride API is backed by a live tram trip
    When the ride API is requested for trip HSL:UNKNOWN
    Then the ride API status is 404

  Scenario: Live trip returns ordered stops, route geometry, and vehicle coordinates
    Given the ride API is backed by a live tram trip
    When the ride API is requested for trip HSL:TRIP_4
    Then the ride API status is 200
    And the ride payload includes 2 stops and a live vehicle position

  Scenario: Underground trip without vehicle GPS returns timetable stops with null vehicle
    Given the ride API is backed by a trip without vehicle coordinates
    When the ride API is requested for trip HSL:TRIP_4
    Then the ride API status is 200
    And the ride payload has no live vehicle position

  Scenario: Digitransit client maps subway trip stoptimesForDate into a RideSnapshot base
    When the Digitransit client loads a subway trip ride from GraphQL
    Then the GraphQL request queries stoptimesForDate for Helsinki service date 20260307
    And the parsed trip ride uses mode METRO with 2 ordered stops
    And the first parsed stop arrives in year 2026

  Scenario: After-midnight trip selects yesterday stoptimesForDate when active across midnight
    When the Digitransit client loads a late-night trip at 00:20 Helsinki time
    Then the first parsed stop arrives at 2026-03-07T22:25:00.000Z

  Scenario: Static stoptimes with serviceDay zero are anchored to Helsinki midnight instead of 1970
    When the Digitransit client receives static stoptimes with serviceDay zero
    Then the first parsed stop arrives in year 2026

  Scenario: The Vercel ride entrypoint validates missing trip id
    When the Vercel ride entrypoint is called without a trip id
    Then the ride API status is 400
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the ride API is backed by a live tram trip$/,
        run: ({ world }) => {
          world.digitransit = createStubDigitransit({
            ride: createTripRideData(),
            vehicle: { lat: 60.181, lon: 24.925 },
          });
        },
      },
      {
        pattern: /^Given the ride API is backed by a trip without vehicle coordinates$/,
        run: ({ world }) => {
          world.digitransit = createStubDigitransit({
            ride: createTripRideData(),
            vehicle: null,
          });
        },
      },
      {
        pattern: /^When the ride API is requested without a trip id$/,
        run: async ({ world }) => {
          const app = createApp({
            digitransitService: world.digitransit,
            liveVehicleFetch: async () => new Response(new Uint8Array(), { status: 200 }),
          });
          world.response = await app.fetch(new Request("http://localhost/api/v1/ride"));
          world.payload = (await world.response.json()) as World["payload"];
        },
      },
      {
        pattern: /^When the ride API is requested for trip (.+)$/,
        run: async ({ args, world }) => {
          const app = createApp({
            digitransitService: world.digitransit,
            liveVehicleFetch: async () => new Response(new Uint8Array(), { status: 200 }),
          });
          world.response = await app.fetch(
            new Request(`http://localhost/api/v1/ride?tripId=${encodeURIComponent(args[0])}`),
          );
          world.payload = (await world.response.json()) as World["payload"];
        },
      },
      {
        pattern: /^When the Digitransit client loads a subway trip ride from GraphQL$/,
        run: async ({ world }) => {
          const nowMs = Date.parse("2026-03-07T08:00:00.000Z"); // 10:00 EET (20260307)
          const serviceDay = Math.floor(Date.parse("2026-03-06T22:00:00.000Z") / 1000); // 2026-03-07 00:00 EET
          const service = createDigitransitService({
            fetchImpl: async (_url, init) => {
              const body = JSON.parse(String(init?.body || "{}")) as {
                query?: string;
                variables?: Record<string, unknown>;
              };
              world.graphqlQuery = body.query;
              world.graphqlVariables = body.variables;
              return new Response(
                JSON.stringify({
                  data: {
                    trip: {
                      gtfsId: "HSL:M1_TRIP",
                      pattern: {
                        geometry: [
                          { lat: 60.169, lon: 24.933 },
                          { lat: 60.171, lon: 24.941 },
                        ],
                      },
                      route: { mode: "SUBWAY", shortName: "M1" },
                      stoptimes: [
                        {
                          realtime: false,
                          realtimeArrival: 36_600,
                          scheduledArrival: 36_600,
                          serviceDay: 0,
                          stop: {
                            code: "H0001",
                            gtfsId: "HSL:KAMPPI",
                            lat: 60.169,
                            lon: 24.933,
                            name: "Kamppi",
                            platformCode: "1",
                          },
                        },
                      ],
                      todayStoptimes: [
                        {
                          realtime: true,
                          realtimeArrival: 36_600,
                          scheduledArrival: 36_540,
                          serviceDay,
                          stop: {
                            code: "H0001",
                            gtfsId: "HSL:KAMPPI",
                            lat: 60.169,
                            lon: 24.933,
                            name: "Kamppi",
                            platformCode: "1",
                          },
                        },
                        {
                          realtime: false,
                          realtimeArrival: 36_780,
                          scheduledArrival: 36_780,
                          serviceDay,
                          stop: {
                            code: "H0002",
                            gtfsId: "HSL:RAUTATIENTORI",
                            lat: 60.171,
                            lon: 24.941,
                            name: "Rautatientori",
                            platformCode: "1",
                          },
                        },
                      ],
                      tripHeadsign: "Vuosaari",
                      yesterdayStoptimes: [],
                    },
                  },
                }),
                { headers: { "content-type": "application/json" }, status: 200 },
              );
            },
            getApiKey: () => "test-key",
            now: () => nowMs,
          });
          const data = await service.getTripRide?.("HSL:M1_TRIP");
          world.parsedRide = data ? { ...data, vehicle: null } : null;
        },
      },
      {
        pattern: /^When the Digitransit client loads a late-night trip at 00:20 Helsinki time$/,
        run: async ({ world }) => {
          const nowMs = Date.parse("2026-03-07T22:20:00.000Z"); // 2026-03-08 00:20 EET
          const yesterdayDay = Math.floor(Date.parse("2026-03-06T22:00:00.000Z") / 1000); // 2026-03-07 00:00 EET
          const todayDay = Math.floor(Date.parse("2026-03-07T22:00:00.000Z") / 1000); // 2026-03-08 00:00 EET
          const service = createDigitransitService({
            fetchImpl: async () =>
              new Response(
                JSON.stringify({
                  data: {
                    trip: {
                      gtfsId: "HSL:N1_TRIP",
                      pattern: { geometry: [] },
                      route: { mode: "BUS", shortName: "415N" },
                      todayStoptimes: [
                        {
                          realtime: false,
                          realtimeArrival: 87_900, // 24:25 on 2026-03-08 (= 2026-03-09 00:25 EET)
                          scheduledArrival: 87_900,
                          serviceDay: todayDay,
                          stop: {
                            code: "H0001",
                            gtfsId: "HSL:KAMPPI",
                            lat: 60.169,
                            lon: 24.933,
                            name: "Kamppi",
                            platformCode: null,
                          },
                        },
                      ],
                      tripHeadsign: "Lentoasema",
                      yesterdayStoptimes: [
                        {
                          realtime: true,
                          realtimeArrival: 87_900, // 24:25 on 2026-03-07 (= 2026-03-08 00:25 EET = 2026-03-07T22:25:00Z)
                          scheduledArrival: 87_900,
                          serviceDay: yesterdayDay,
                          stop: {
                            code: "H0001",
                            gtfsId: "HSL:KAMPPI",
                            lat: 60.169,
                            lon: 24.933,
                            name: "Kamppi",
                            platformCode: null,
                          },
                        },
                      ],
                    },
                  },
                }),
                { headers: { "content-type": "application/json" }, status: 200 },
              ),
            getApiKey: () => "test-key",
            now: () => nowMs,
          });
          const data = await service.getTripRide?.("HSL:N1_TRIP");
          world.parsedRide = data ? { ...data, vehicle: null } : null;
        },
      },
      {
        pattern: /^When the Digitransit client receives static stoptimes with serviceDay zero$/,
        run: async ({ world }) => {
          const nowMs = Date.parse("2026-03-07T08:00:00.000Z"); // 10:00 EET
          const service = createDigitransitService({
            fetchImpl: async () =>
              new Response(
                JSON.stringify({
                  data: {
                    trip: {
                      gtfsId: "HSL:STATIC_TRIP",
                      pattern: { geometry: [] },
                      route: { mode: "TRAM", shortName: "4" },
                      stoptimes: [
                        {
                          realtime: false,
                          realtimeArrival: 36_600,
                          scheduledArrival: 36_600,
                          serviceDay: 0,
                          stop: {
                            code: "H0001",
                            gtfsId: "HSL:KAMPPI",
                            lat: 60.169,
                            lon: 24.933,
                            name: "Kamppi",
                            platformCode: null,
                          },
                        },
                      ],
                      tripHeadsign: "Kamppi",
                    },
                  },
                }),
                { headers: { "content-type": "application/json" }, status: 200 },
              ),
            getApiKey: () => "test-key",
            now: () => nowMs,
          });
          const data = await service.getTripRide?.("HSL:STATIC_TRIP");
          world.parsedRide = data ? { ...data, vehicle: null } : null;
        },
      },
      {
        pattern: /^When the Vercel ride entrypoint is called without a trip id$/,
        run: async ({ world }) => {
          const app = (await import("../../api/v1/ride")).default;
          world.response = await app.fetch(new Request("http://localhost/api/v1/ride"));
          world.payload = (await world.response.json()) as World["payload"];
        },
      },
      {
        pattern: /^Then the ride API status is (\d+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.response?.status, Number(args[0]));
        },
      },
      {
        pattern: /^Then the ride payload includes (\d+) stops and a live vehicle position$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.payload?.stops?.length, Number(args[0]));
          assert.equal(world.payload?.vehicle?.lat, 60.181);
        },
      },
      {
        pattern: /^Then the ride payload has no live vehicle position$/,
        run: ({ assert, world }) => {
          assert.equal(world.payload?.vehicle, null);
        },
      },
      {
        pattern: /^Then the GraphQL request queries stoptimesForDate for Helsinki service date (\d+)$/,
        run: ({ args, assert, world }) => {
          assert.match(world.graphqlQuery || "", /stoptimesForDate\s*\(\s*serviceDate:/);
          assert.equal(world.graphqlVariables?.serviceDate, args[0]);
        },
      },
      {
        pattern: /^Then the parsed trip ride uses mode (.+) with (\d+) ordered stops$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.parsedRide?.mode, args[0]);
          assert.equal(world.parsedRide?.stops.length, Number(args[1]));
          assert.equal(world.parsedRide?.stops[0]?.name, "Kamppi");
        },
      },
      {
        pattern: /^Then the first parsed stop arrives in year (\d+)$/,
        run: ({ args, assert, world }) => {
          const iso = world.parsedRide?.stops[0]?.arrivalIso || "";
          assert.match(iso, new RegExp(`^${args[0]}-`));
        },
      },
      {
        pattern: /^Then the first parsed stop arrives at (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.parsedRide?.stops[0]?.arrivalIso, args[0]);
        },
      },
    ],
  },
);
