import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppController, type AppController } from "@client/app/app-controller";
import { createAppStore } from "@client/app/app-store";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";
import type { Mode } from "@shared/domain/mode";

interface RecordedRequest {
  coords: string;
  destinations: string;
  lines: string;
  mode: Mode;
  stopId: string | null;
}

interface World {
  controller?: AppController;
  locationCalls: number;
  requests: RecordedRequest[];
}

function createBookmarkController(
  world: World,
  locationService: LocationService
): AppController {
  const departuresClient: DeparturesClient = {
    async getDepartures(input) {
      world.requests.push({
        coords: input.coords ? `${input.coords.lat}|${input.coords.lon}` : "",
        destinations: input.destinations.join("|"),
        lines: input.lines.join("|"),
        mode: input.mode,
        stopId: input.stopId,
      });
      const stopId = input.stopId || "HSL:NEAR";
      const anchored = Boolean(input.stopId);
      return {
        filterOptions: {
          destinations: input.destinations.map((value) => ({ count: 1, value })),
          lines: input.lines.map((value) => ({ count: 1, value })),
        },
        mode: input.mode,
        selectedStopId: stopId,
        station: {
          departures: [],
          distanceMeters: anchored ? 0 : 80,
          stopCode: anchored ? "O200" : "N100",
          stopCodes: [anchored ? "O200" : "N100"],
          stopName: anchored ? "Old Terminal" : "Nearest Stop",
          type: "stop",
        },
        stops: [
          {
            code: anchored ? "O200" : "N100",
            distanceMeters: anchored ? 0 : 80,
            id: stopId,
            lat: anchored ? 60.2 : 60.17,
            lon: anchored ? 24.9 : 24.94,
            memberStopIds: [stopId],
            name: anchored ? "Old Terminal" : "Nearest Stop",
            stopCodes: [anchored ? "O200" : "N100"],
          },
        ],
      };
    },
  };
  const store = createAppStore({ activeMode: "BUS" });
  store.setStopAnchor("HSL:OLD");
  store.setLineAndDestinationFilters(["550"], ["Old Terminal"]);
  return createAppController({
    departuresClient,
    locationService,
    store,
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
Feature: Bookmark location

  Scenario: Opening a bookmark loads the stop without device location
    Given a bookmarked bus stop and no device location
    When initial departures load
    Then geolocation call count is 0
    And the departures request stop id is HSL:OLD
    And the departures request coordinates are empty
    And the departures request lines are 550
    And the departures request destinations are Old Terminal

  Scenario: Refresh reads device location and leaves the bookmarked stop
    Given a bookmarked bus stop and a device location
    When nearby departures refresh is requested
    Then geolocation call count is 1
    And the departures request stop id is empty
    And the departures request coordinates are 60.1699|24.9384
    And the departures request lines are 550

  Scenario: Refresh keeps the bookmark when device location is denied
    Given a bookmarked bus stop and denied device location
    When nearby departures refresh is requested
    Then geolocation call count is 1
    And the selected stop id is HSL:OLD
    And the load state is location-denied

  Scenario: Changing mode searches from the bookmarked stop
    Given a loaded bookmark whose stop is the search origin
    When the user changes mode to TRAM
    Then geolocation call count is 0
    And the latest departures request mode is TRAM
    And the latest departures request stop id is empty
    And the latest departures request coordinates are 60.2|24.9
  `,
  {
    createWorld: () => ({
      locationCalls: 0,
      requests: [],
    }),
    stepDefinitions: [
      {
        pattern: /^Given a bookmarked bus stop and no device location$/,
        run: ({ world }) => {
          world.controller = createBookmarkController(world, {
            async getCurrentPosition() {
              world.locationCalls += 1;
              return { code: "unavailable", ok: false };
            },
          });
        },
      },
      {
        pattern: /^Given a bookmarked bus stop and a device location$/,
        run: ({ world }) => {
          world.controller = createBookmarkController(world, {
            async getCurrentPosition() {
              world.locationCalls += 1;
              return { ok: true, value: { lat: 60.1699, lon: 24.9384 } };
            },
          });
        },
      },
      {
        pattern: /^Given a bookmarked bus stop and denied device location$/,
        run: ({ world }) => {
          world.controller = createBookmarkController(world, {
            async getCurrentPosition() {
              world.locationCalls += 1;
              return { code: "permission-denied", ok: false };
            },
          });
        },
      },
      {
        pattern: /^Given a loaded bookmark whose stop is the search origin$/,
        run: async ({ world }) => {
          world.controller = createBookmarkController(world, {
            async getCurrentPosition() {
              world.locationCalls += 1;
              return { code: "unavailable", ok: false };
            },
          });
          await world.controller.loadInitialDepartures();
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
        pattern: /^When nearby departures refresh is requested$/,
        run: async ({ world }) => {
          if (!world.controller) {
            throw new Error("Expected app controller");
          }
          await world.controller.refreshNearbyDepartures();
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
        pattern: /^Then the departures request stop id is (.+)$/,
        run: ({ args, assert, world }) => {
          const expected = args[0] === "empty" ? null : args[0];
          assert.equal(world.requests[0]?.stopId ?? null, expected);
        },
      },
      {
        pattern: /^Then the departures request coordinates are (.+)$/,
        run: ({ args, assert, world }) => {
          const expected = args[0] === "empty" ? "" : args[0];
          assert.equal(world.requests[0]?.coords, expected);
        },
      },
      {
        pattern: /^Then the departures request lines are (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.requests[0]?.lines, args[0]);
        },
      },
      {
        pattern: /^Then the departures request destinations are (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.requests[0]?.destinations, args[0]);
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
      {
        pattern: /^Then the selected stop id is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.controller?.store.getState().selectedStopId, args[0]);
        },
      },
      {
        pattern: /^Then the load state is location-denied$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().loadState, "location-denied");
        },
      },
    ],
  }
);
