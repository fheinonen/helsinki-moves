import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppController, type AppController } from "@client/app/app-controller";
import { createAppStore } from "@client/app/app-store";
import { createBrowserLocationService } from "@client/services/location-service";
import type { DeparturesClient } from "@client/services/departures-client";

interface DevicePoint {
  lat: number;
  lon: number;
}

interface World {
  controller?: AppController;
  device?: DevicePoint;
  networkFix?: DevicePoint;
}

function stationNameFor(lat: number, lon: number): string {
  if (Math.abs(lat - 60.222) < 0.001 && Math.abs(lon - 24.899) < 0.001) {
    return "Huopalahti station";
  }
  if (Math.abs(lat - 60.1997) < 0.001 && Math.abs(lon - 24.9354) < 0.001) {
    return "Pasila station";
  }
  if (Math.abs(lat - 60.3) < 0.001 && Math.abs(lon - 24.95) < 0.001) {
    return "Malmi station";
  }
  return "Unknown station";
}

function cachedFix(world: World): DevicePoint {
  if (!world.device) {
    throw new Error("Expected a device location");
  }
  if (!world.networkFix) {
    world.networkFix = { lat: world.device.lat, lon: world.device.lon };
  }
  return world.networkFix;
}

function reportedFix(world: World, options?: PositionOptions): DevicePoint {
  if (!world.device) {
    throw new Error("Expected a device location");
  }
  if (options?.enableHighAccuracy === true) {
    return { lat: world.device.lat, lon: world.device.lon };
  }
  return cachedFix(world);
}

function createCachingGeolocation(world: World): Geolocation {
  return {
    getCurrentPosition(success, _error, options) {
      const point = reportedFix(world, options);
      success({
        coords: {
          accuracy: 20,
          latitude: point.lat,
          longitude: point.lon,
        },
        timestamp: Date.now(),
      } as GeolocationPosition);
    },
  } as Geolocation;
}

function createController(world: World): AppController {
  const departuresClient: DeparturesClient = {
    async getDepartures(input) {
      const lat = input.coords?.lat ?? Number.NaN;
      const lon = input.coords?.lon ?? Number.NaN;
      const stopName = stationNameFor(lat, lon);
      const stopId = stopName;
      return {
        filterOptions: { destinations: [], lines: [] },
        mode: input.mode,
        selectedStopId: stopId,
        station: {
          departures: [],
          distanceMeters: 40,
          stopCode: "X",
          stopCodes: ["X"],
          stopName,
          type: "stop",
        },
        stops: [
          {
            code: "X",
            distanceMeters: 40,
            id: stopId,
            lat,
            lon,
            memberStopIds: [stopId],
            name: stopName,
            stopCodes: ["X"],
          },
        ],
      };
    },
  };
  return createAppController({
    departuresClient,
    locationService: createBrowserLocationService({
      geolocation: createCachingGeolocation(world),
    }),
    store: createAppStore({ activeMode: "BUS" }),
  });
}

defineFeature<World>(
  test,
  `
Feature: Cached location refresh

  Scenario: Refresh follows the device after it moves
    Given a device at 60.222 and 24.899 that repeats its first fix until a fresh location is requested
    When initial departures load
    Then the current station name is Huopalahti station
    When the device moves to 60.1997 and 24.9354
    And the user presses refresh
    Then the current station name is Pasila station
    When the device moves to 60.3 and 24.95
    And the user presses refresh
    Then the current station name is Malmi station
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a device at ([\d.]+) and ([\d.]+) that repeats its first fix until a fresh location is requested$/,
        run: ({ args, world }) => {
          world.device = { lat: Number(args[0]), lon: Number(args[1]) };
          world.controller = createController(world);
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
        pattern: /^When the device moves to ([\d.]+) and ([\d.]+)$/,
        run: ({ args, world }) => {
          world.device = { lat: Number(args[0]), lon: Number(args[1]) };
        },
      },
      {
        pattern: /^When the user presses refresh$/,
        run: async ({ world }) => {
          if (!world.controller) {
            throw new Error("Expected app controller");
          }
          await world.controller.refreshNearbyDepartures();
        },
      },
      {
        pattern: /^Then the current station name is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.controller?.store.getState().station?.stopName, args[0]);
        },
      },
    ],
  }
);
