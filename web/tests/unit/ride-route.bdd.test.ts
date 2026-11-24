import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createApp } from "@server/app";
import { createDigitransitService } from "@server/services/digitransit/client";
import type { DigitransitService } from "@server/services/digitransit/types";
import type { RideSnapshot } from "@shared/domain/ride";

interface World {
  digitransit?: DigitransitService;
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

  Scenario: Digitransit client maps subway trip stoptimes into a RideSnapshot base
    When the Digitransit client loads a subway trip ride from GraphQL
    Then the parsed trip ride uses mode METRO with 2 ordered stops

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
          const serviceDay = Math.floor(Date.parse("2026-03-07T00:00:00.000Z") / 1000);
          const service = createDigitransitService({
            fetchImpl: async () =>
              new Response(
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
                          realtime: true,
                          realtimeArrival: 36_000,
                          scheduledArrival: 35_940,
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
                          realtimeArrival: 36_120,
                          scheduledArrival: 36_120,
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
                    },
                  },
                }),
                { headers: { "content-type": "application/json" }, status: 200 },
              ),
            getApiKey: () => "test-key",
          });
          const data = await service.getTripRide?.("HSL:M1_TRIP");
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
        pattern: /^Then the parsed trip ride uses mode (.+) with (\d+) ordered stops$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.parsedRide?.mode, args[0]);
          assert.equal(world.parsedRide?.stops.length, Number(args[1]));
          assert.equal(world.parsedRide?.stops[0]?.name, "Kamppi");
        },
      },
    ],
  },
);
