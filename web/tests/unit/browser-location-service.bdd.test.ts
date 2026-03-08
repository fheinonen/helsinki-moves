import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  createBrowserLocationService,
  type GetCurrentPositionOptions,
  type LocationResult,
  type LocationService,
} from "@client/services/location-service";

interface FakeGeolocation {
  getCurrentPosition(
    success: PositionCallback,
    error?: PositionErrorCallback | null,
    options?: PositionOptions
  ): void;
}

interface World {
  geolocation?: FakeGeolocation;
  lastOptions?: PositionOptions;
  result?: LocationResult;
  service?: LocationService;
}

defineFeature<World>(
  test,
  `
Feature: Browser location service

  Scenario: Missing browser geolocation returns unavailable
    Given the browser has no geolocation support
    When the current location is requested
    Then the location result is unavailable

  Scenario: Successful geolocation returns coordinates and requested accuracy
    Given the browser geolocation succeeds with coordinates 60.17 and 24.94
    When the current location is requested with high accuracy
    Then the location coordinates equal 60.17 and 24.94
    And high accuracy is requested from the browser

  Scenario: Permission denied maps to a permission denied result
    Given the browser geolocation denies permission
    When the current location is requested
    Then the location result is permission-denied

  Scenario: Other browser geolocation failures map to unavailable
    Given the browser geolocation fails without permission denial
    When the current location is requested
    Then the location result is unavailable
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the browser has no geolocation support$/,
        run: ({ world }) => {
          world.service = createBrowserLocationService();
        },
      },
      {
        pattern: /^Given the browser geolocation succeeds with coordinates ([\d.]+) and ([\d.]+)$/,
        run: ({ args, world }) => {
          world.geolocation = {
            getCurrentPosition(success, _error, options) {
              world.lastOptions = options;
              success({
                coords: {
                  latitude: Number(args[0]),
                  longitude: Number(args[1]),
                },
              } as GeolocationPosition);
            },
          };
          world.service = createBrowserLocationService({
            geolocation: world.geolocation as unknown as Geolocation,
          });
        },
      },
      {
        pattern: /^Given the browser geolocation denies permission$/,
        run: ({ world }) => {
          world.geolocation = {
            getCurrentPosition(_success, error, options) {
              world.lastOptions = options;
              error?.({
                PERMISSION_DENIED: 1,
                code: 1,
              } as GeolocationPositionError);
            },
          };
          world.service = createBrowserLocationService({
            geolocation: world.geolocation as unknown as Geolocation,
          });
        },
      },
      {
        pattern: /^Given the browser geolocation fails without permission denial$/,
        run: ({ world }) => {
          world.geolocation = {
            getCurrentPosition(_success, error, options) {
              world.lastOptions = options;
              error?.({
                PERMISSION_DENIED: 1,
                code: 2,
              } as GeolocationPositionError);
            },
          };
          world.service = createBrowserLocationService({
            geolocation: world.geolocation as unknown as Geolocation,
          });
        },
      },
      {
        pattern: /^When the current location is requested$/,
        run: async ({ world }) => {
          if (!world.service) {
            throw new Error("Expected location service");
          }
          world.result = await world.service.getCurrentPosition();
        },
      },
      {
        pattern: /^When the current location is requested with high accuracy$/,
        run: async ({ world }) => {
          if (!world.service) {
            throw new Error("Expected location service");
          }
          const options: GetCurrentPositionOptions = { enableHighAccuracy: true };
          world.result = await world.service.getCurrentPosition(options);
        },
      },
      {
        pattern: /^Then the location result is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.result?.ok ? "ok" : world.result?.code, args[0]);
        },
      },
      {
        pattern: /^Then the location coordinates equal ([\d.]+) and ([\d.]+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.result?.ok ? world.result.value.lat : null, Number(args[0]));
          assert.equal(world.result?.ok ? world.result.value.lon : null, Number(args[1]));
        },
      },
      {
        pattern: /^Then high accuracy is requested from the browser$/,
        run: ({ assert, world }) => {
          assert.equal(world.lastOptions?.enableHighAccuracy, true);
        },
      },
    ],
  }
);
