import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppController, type AppController } from "@client/app/app-controller";
import { createAppStore } from "@client/app/app-store";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";
import type { Mode } from "@shared/domain/mode";

interface RecordedRequest {
  coords: string;
  mode: Mode;
  stopId: string | null;
}

interface World {
  controller?: AppController;
  locationCalls: number;
  nearestStop: { lat: number; lon: number };
  requests: RecordedRequest[];
}

function createCoreController(world: World, locationService: LocationService): AppController {
  const departuresClient: DeparturesClient = {
    async getDepartures(input) {
      world.requests.push({
        coords: input.coords ? `${input.coords.lat}|${input.coords.lon}` : "",
        mode: input.mode,
        stopId: input.stopId,
      });
      return {
        filterOptions: {
          destinations: [],
          lines: [],
        },
        mode: input.mode,
        selectedStopId: "HSL:NEAR",
        station: {
          departures: [],
          distanceMeters: 40,
          stopCode: "N100",
          stopCodes: ["N100"],
          stopName: "Nearest Stop",
          type: "stop",
        },
        stops: [
          {
            code: "N100",
            distanceMeters: 40,
            id: "HSL:NEAR",
            lat: world.nearestStop.lat,
            lon: world.nearestStop.lon,
            memberStopIds: ["HSL:NEAR"],
            name: "Nearest Stop",
            stopCodes: ["N100"],
          },
        ],
      };
    },
  };
  return createAppController({
    departuresClient,
    locationService,
    store: createAppStore({ activeMode: "RAIL" }),
  });
}

async function waitForRequestCount(world: World, count: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (world.requests.length >= count) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

defineFeature<World>(
  test,
  `
Feature: Core location

  Scenario: Changing mode after a base URL visit searches from the device location
    Given a base URL visit with device location 60.1699, 24.9384
    And the nearest stop for the current mode is at 60.1712, 24.9411
    When initial departures load
    And the user changes mode to BUS
    Then geolocation call count is 1
    And the first departures request coordinates are 60.1699|24.9384
    And the latest departures request mode is BUS
    And the latest departures request stop id is empty
    And the latest departures request coordinates are 60.1699|24.9384
  `,
  {
    createWorld: () => ({
      locationCalls: 0,
      nearestStop: { lat: 0, lon: 0 },
      requests: [],
    }),
    stepDefinitions: [
      {
        pattern: /^Given a base URL visit with device location (.+), (.+)$/,
        run: ({ args, world }) => {
          const lat = Number(args[0]);
          const lon = Number(args[1]);
          world.controller = createCoreController(world, {
            async getCurrentPosition() {
              world.locationCalls += 1;
              return { ok: true, value: { lat, lon } };
            },
          });
        },
      },
      {
        pattern: /^Given the nearest stop for the current mode is at (.+), (.+)$/,
        run: ({ args, world }) => {
          world.nearestStop = { lat: Number(args[0]), lon: Number(args[1]) };
        },
      },
      {
        pattern: /^When initial departures load$/,
        run: async ({ world }) => {
          if (!world.controller) {
            throw new Error("Expected app controller");
          }
          await world.controller.loadInitialDepartures();
        },
      },
      {
        pattern: /^When the user changes mode to (.+)$/,
        run: async ({ args, world }) => {
          if (!world.controller) {
            throw new Error("Expected app controller");
          }
          const before = world.requests.length;
          world.controller.setMode(args[0] as Mode);
          await waitForRequestCount(world, before + 1);
        },
      },
      {
        pattern: /^Then geolocation call count is (\d+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.locationCalls, Number(args[0]));
        },
      },
      {
        pattern: /^Then the first departures request coordinates are (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.requests[0]?.coords, args[0]);
        },
      },
      {
        pattern: /^Then the latest departures request mode is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.requests[world.requests.length - 1]?.mode, args[0]);
        },
      },
      {
        pattern: /^Then the latest departures request stop id is (.+)$/,
        run: ({ args, assert, world }) => {
          const expected = args[0] === "empty" ? null : args[0];
          assert.equal(world.requests[world.requests.length - 1]?.stopId ?? null, expected);
        },
      },
      {
        pattern: /^Then the latest departures request coordinates are (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.requests[world.requests.length - 1]?.coords, args[0]);
        },
      },
    ],
  }
);
