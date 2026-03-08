import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore } from "@client/app/app-store";
import { createAppController, type AppController } from "@client/app/app-controller";
import type { LocationService } from "@client/services/location-service";
import type { DeparturesClient } from "@client/services/departures-client";

interface World {
  locationCalls?: Array<{ enableHighAccuracy: boolean }>;
  departuresCallCount?: number;
  controller?: AppController;
}

defineFeature<World>(
  test,
  `
Feature: Location refresh

  Scenario: Refresh handles denied location permission
    Given the app controller has a denied location service
    When nearby departures refresh is requested
    Then the load state is location-denied
    And the status message is Location access denied.

  Scenario: Refresh falls back to the last known location when geolocation is unavailable
    Given the app controller has a last known location and temporary geolocation failure
    When nearby departures refresh is requested twice
    Then departures are requested for the last known location
    And the load state is ready
    And the current station name is Kamppi

  Scenario: Refresh retries once with high accuracy before using the last known location
    Given the app controller retries unavailable geolocation with high accuracy
    When nearby departures refresh is requested twice
    Then location refresh first requests standard accuracy
    And location refresh then requests high accuracy
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app controller has a denied location service$/,
        run: ({ world }) => {
          const locationService: LocationService = {
            async getCurrentPosition() {
              return { code: "permission-denied", ok: false };
            },
          };
          const departuresClient: DeparturesClient = {
            async getDepartures() {
              throw new Error("Departures client should not be called");
            },
          };
          world.controller = createAppController({
            departuresClient,
            locationService,
            store: createAppStore(),
          });
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
        pattern: /^When nearby departures refresh is requested twice$/,
        run: async ({ world }) => {
          if (!world.controller) {
            throw new Error("Expected app controller");
          }
          await world.controller.refreshNearbyDepartures();
          await world.controller.refreshNearbyDepartures();
        },
      },
      {
        pattern: /^Then the load state is location-denied$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().loadState, "location-denied");
        },
      },
      {
        pattern: /^Then the status message is Location access denied\.$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().statusMessage, "Location access denied.");
        },
      },
      {
        pattern: /^Given the app controller has a last known location and temporary geolocation failure$/,
        run: ({ world }) => {
          let callCount = 0;
          world.departuresCallCount = 0;
          const locationService: LocationService = {
            async getCurrentPosition() {
              callCount += 1;
              if (callCount === 1) {
                return {
                  ok: true,
                  value: { lat: 60.17, lon: 24.94 },
                };
              }
              return { code: "unavailable", ok: false };
            },
          };
          const departuresClient: DeparturesClient = {
            async getDepartures(input) {
              world.departuresCallCount = (world.departuresCallCount || 0) + 1;
              return {
                filterOptions: {
                  destinations: [{ count: 1, value: "Kamppi" }],
                  lines: [{ count: 1, value: "550" }],
                },
                mode: input.mode,
                selectedStopId: "HSL:STOP_A",
                station: {
                  departures: [],
                  distanceMeters: 80,
                  stopCode: "A1",
                  stopCodes: ["A1"],
                  stopName: "Kamppi",
                  type: "stop",
                },
                stops: [],
              };
            },
          };
          world.controller = createAppController({
            departuresClient,
            locationService,
            store: createAppStore({ activeMode: "BUS" }),
          });
        },
      },
      {
        pattern: /^Given the app controller retries unavailable geolocation with high accuracy$/,
        run: ({ world }) => {
          world.locationCalls = [];
          let callCount = 0;
          const locationService: LocationService = {
            async getCurrentPosition(options) {
              world.locationCalls?.push({
                enableHighAccuracy: options?.enableHighAccuracy === true,
              });
              callCount += 1;
              if (callCount === 1) {
                return {
                  ok: true,
                  value: { lat: 60.17, lon: 24.94 },
                };
              }
              return { code: "unavailable", ok: false };
            },
          };
          const departuresClient: DeparturesClient = {
            async getDepartures(input) {
              return {
                filterOptions: {
                  destinations: [{ count: 1, value: "Kamppi" }],
                  lines: [{ count: 1, value: "550" }],
                },
                mode: input.mode,
                selectedStopId: "HSL:STOP_A",
                station: {
                  departures: [],
                  distanceMeters: 80,
                  stopCode: "A1",
                  stopCodes: ["A1"],
                  stopName: "Kamppi",
                  type: "stop",
                },
                stops: [],
              };
            },
          };
          world.controller = createAppController({
            departuresClient,
            locationService,
            store: createAppStore({ activeMode: "BUS" }),
          });
        },
      },
      {
        pattern: /^Then departures are requested for the last known location$/,
        run: ({ assert, world }) => {
          if (!world.controller) {
            throw new Error("Expected app controller");
          }
          const coords = world.controller.store.getState().coords;
          assert.equal(world.departuresCallCount, 2);
          assert.equal(`${coords?.lat}|${coords?.lon}`, "60.17|24.94");
        },
      },
      {
        pattern: /^Then the load state is ready$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().loadState, "ready");
        },
      },
      {
        pattern: /^Then the current station name is Kamppi$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().station?.stopName, "Kamppi");
        },
      },
      {
        pattern: /^Then location refresh first requests standard accuracy$/,
        run: ({ assert, world }) => {
          assert.equal(world.locationCalls?.[0]?.enableHighAccuracy, false);
        },
      },
      {
        pattern: /^(?:Then|And) location refresh then requests high accuracy$/,
        run: ({ assert, world }) => {
          assert.equal(world.locationCalls?.[1]?.enableHighAccuracy, false);
          assert.equal(world.locationCalls?.[2]?.enableHighAccuracy, true);
        },
      },
    ],
  }
);
