import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createApp } from "@server/app";
import type { RoutePlanSuccessResponse } from "@shared/contracts/routes-contract";
import type { DigitransitService } from "@server/services/digitransit/types";

interface World {
  payload?: RoutePlanSuccessResponse;
  response?: Response;
  service?: DigitransitService;
}

defineFeature<World>(
  test,
  `
Feature: Routes route contract

  Scenario: Routes route returns primary and backup itineraries from Digitransit routes
    Given Digitransit returns two route itineraries
    When the routes route handles a Tripla planning request
    Then the routes response status is 200
    And the routes response contains 2 itineraries
    And the first itinerary line is 600
    And the second itinerary line is 59
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given Digitransit returns two route itineraries$/,
        run: ({ world }) => {
          world.service = {
            async getDeparturesForStopIds() {
              return new Map();
            },
            async getNearbyStops() {
              return [];
            },
            async getRoutes() {
              return [
                {
                  durationSeconds: 720,
                  endTimeIso: "2026-03-21T10:12:00.000Z",
                  id: "itinerary-fast",
                  legs: [
                    {
                      arrivalPlatform: null,
                      arrivalStopName: "Mall of Tripla",
                      departurePlatform: null,
                      departureStopName: "Pasila asema",
                      endTimeIso: "2026-03-21T10:12:00.000Z",
                      headsign: "Mall of Tripla",
                      line: "600",
                      mode: "BUS",
                      startTimeIso: "2026-03-21T10:01:00.000Z",
                    },
                  ],
                  startTimeIso: "2026-03-21T10:00:00.000Z",
                  transfers: 0,
                  walkDistanceMeters: 240,
                },
                {
                  durationSeconds: 840,
                  endTimeIso: "2026-03-21T10:14:00.000Z",
                  id: "itinerary-walk",
                  legs: [
                    {
                      arrivalPlatform: null,
                      arrivalStopName: "Mall of Tripla",
                      departurePlatform: null,
                      departureStopName: "Tripla",
                      endTimeIso: "2026-03-21T10:14:00.000Z",
                      headsign: "Mall of Tripla",
                      line: "59",
                      mode: "BUS",
                      startTimeIso: "2026-03-21T10:04:00.000Z",
                    },
                  ],
                  startTimeIso: "2026-03-21T10:00:00.000Z",
                  transfers: 0,
                  walkDistanceMeters: 40,
                },
              ];
            },
          };
        },
      },
      {
        pattern: /^When the routes route handles a Tripla planning request$/,
        run: async ({ world }) => {
          if (!world.service) {
            throw new Error("Expected Digitransit service");
          }
          const app = createApp({
            digitransitService: world.service,
          });
          world.response = await app.request(
            "http://localhost/api/v1/routes?fromLat=60.17&fromLon=24.94&toLat=60.1989&toLon=24.9354"
          );
          world.payload = (await world.response.json()) as RoutePlanSuccessResponse;
        },
      },
      {
        pattern: /^(?:Then|And) the routes response status is 200$/,
        run: ({ assert, world }) => {
          assert.equal(world.response?.status, 200);
        },
      },
      {
        pattern: /^(?:Then|And) the routes response contains 2 itineraries$/,
        run: ({ assert, world }) => {
          assert.equal(world.payload?.itineraries.length, 2);
        },
      },
      {
        pattern: /^(?:Then|And) the first itinerary line is 600$/,
        run: ({ assert, world }) => {
          assert.equal(world.payload?.itineraries[0]?.legs[0]?.line, "600");
        },
      },
      {
        pattern: /^(?:Then|And) the second itinerary line is 59$/,
        run: ({ assert, world }) => {
          assert.equal(world.payload?.itineraries[1]?.legs[0]?.line, "59");
        },
      },
    ],
  }
);
