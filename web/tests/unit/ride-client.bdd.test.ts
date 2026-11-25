import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { fetchRideSnapshot, rideSnapshotUrl } from "@client/services/ride-client";
import type { RideSnapshot } from "@shared/domain/ride";

interface World {
  result?: RideSnapshot | null;
  url?: string;
}

defineFeature<World>(
  test,
  `
Feature: Browser ride snapshot client

  Scenario: Building the ride snapshot URL encodes tripId
    When the ride URL is built for trip HSL:4 1
    Then the built ride URL is /api/v1/ride?tripId=HSL%3A4+1

  Scenario: Fetching a valid trip returns the parsed RideSnapshot
    When the ride client fetches trip HSL:TRIP_4 from a 200 response
    Then the fetched ride destination is Kamppi

  Scenario: Fetching a missing trip returns null
    When the ride client fetches trip HSL:MISSING from a 404 response
    Then the fetched ride is null

  Scenario: Fetching with a blank tripId short-circuits to null
    When the ride client fetches a blank trip id
    Then the fetched ride is null
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^When the ride URL is built for trip (.+)$/,
        run: ({ args, world }) => {
          world.url = rideSnapshotUrl(args[0]);
        },
      },
      {
        pattern: /^When the ride client fetches trip (.+) from a 200 response$/,
        run: async ({ args, world }) => {
          world.result = await fetchRideSnapshot({
            fetchImpl: async () =>
              new Response(
                JSON.stringify({
                  destination: "Kamppi",
                  line: "4",
                  mode: "TRAM",
                  route: [],
                  stops: [],
                  tripId: args[0],
                  vehicle: null,
                }),
                { headers: { "content-type": "application/json" }, status: 200 },
              ),
            tripId: args[0],
          });
        },
      },
      {
        pattern: /^When the ride client fetches trip (.+) from a 404 response$/,
        run: async ({ args, world }) => {
          world.result = await fetchRideSnapshot({
            fetchImpl: async () => new Response(JSON.stringify({ error: "not found" }), { status: 404 }),
            tripId: args[0],
          });
        },
      },
      {
        pattern: /^When the ride client fetches a blank trip id$/,
        run: async ({ world }) => {
          world.result = await fetchRideSnapshot({
            fetchImpl: async () => {
              throw new Error("Should not fetch blank tripId");
            },
            tripId: "   ",
          });
        },
      },
      {
        pattern: /^Then the built ride URL is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.url, args[0]);
        },
      },
      {
        pattern: /^Then the fetched ride destination is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.result?.destination, args[0]);
        },
      },
      {
        pattern: /^Then the fetched ride is null$/,
        run: ({ assert, world }) => {
          assert.equal(world.result, null);
        },
      },
    ],
  },
);
