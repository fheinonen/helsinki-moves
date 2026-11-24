import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore, type AppStore } from "@client/app/app-store";
import { createAppController, type AppController } from "@client/app/app-controller";
import { bootstrapApp } from "@client/app/bootstrap";
import { buildSearchFromState } from "@client/lib/persistence/query-state";
import type { DeparturesClient } from "@client/services/departures-client";

type DeparturesRequestInput = Parameters<DeparturesClient["getDepartures"]>[0];

interface World {
  controller?: AppController;
  departureRequests?: DeparturesRequestInput[];
  search?: string;
  store?: AppStore;
}

function createControllerHarness(store: AppStore, departureRequests: DeparturesRequestInput[]): AppController {
  return createAppController({
    departuresClient: {
      async getDepartures(input) {
        departureRequests.push(input);
        return {
          filterOptions: { destinations: [], lines: [] },
          mode: input.mode,
          selectedStopId: input.stopId,
          station: {
            departures: [],
            distanceMeters: 40,
            stopCode: "H0104",
            stopCodes: ["H0104"],
            stopName: "Lasipalatsi",
            type: "stop",
          },
          stops: [
            {
              code: "H0104",
              distanceMeters: 40,
              id: input.stopId || "HSL:4",
              memberStopIds: [input.stopId || "HSL:4"],
              name: "Lasipalatsi",
              stopCodes: ["H0104"],
            },
          ],
        };
      },
      async getLaterDepartures() {
        return { departures: [] };
      },
    },
    locationService: {
      async getCurrentPosition() {
        return { code: "unavailable", ok: false };
      },
    },
    store,
  });
}

defineFeature<World>(
  test,
  `
Feature: Wait and Ride view state and URL persistence

  Scenario: Starting a ride switches to ride view and preserves it when flipping back to wait
    Given a fresh app store
    When the rider boards trip HSL:TRIP_4 at stop HSL:2 to Kamppi
    And the rider switches back to the wait view
    Then the active view is wait
    And the background ride trip is still HSL:TRIP_4

  Scenario: Wait URL stays clean when no ride is active
    Given a fresh app store
    When the URL query is built from current state
    Then the URL query omits view and trip parameters

  Scenario: Active ride syncs view, trip, boarded stop, and exit stop into the URL
    Given a fresh app store
    When the rider boards trip HSL:TRIP_4 at stop HSL:2 to Kamppi
    And the rider pins exit stop HSL:4
    And the URL query is built from current state
    Then the URL query contains view ride, trip HSL:TRIP_4, boarded HSL:2, and exit HSL:4

  Scenario: Bootstrap restores ride view, trip, boarded stop, and exit stop from the URL
    Given the app boots from URL ?mode=tram&view=ride&trip=HSL:TRIP_4&boarded=HSL:2&exit=HSL:4
    Then the active view is ride
    And the background ride trip is still HSL:TRIP_4
    And the pinned exit stop is HSL:4

  Scenario: Jumping from a ride stop to Wait anchors departures on that stop
    Given an app controller with an active ride on trip HSL:TRIP_4
    When the rider jumps to Wait at stop HSL:4
    Then the active view is wait
    And departures were requested for stop HSL:4
  `,
  {
    createWorld: () => ({ departureRequests: [] }),
    stepDefinitions: [
      {
        pattern: /^Given a fresh app store$/,
        run: ({ world }) => {
          world.store = createAppStore();
        },
      },
      {
        pattern: /^Given the app boots from URL (.+)$/,
        run: ({ args, world }) => {
          const store = createAppStore();
          const controller = createControllerHarness(store, world.departureRequests ?? []);
          const root = document.createElement("div");
          bootstrapApp({
            controller,
            documentRef: document,
            locationRef: { pathname: "/", search: args[0] },
            root,
          });
          world.store = store;
          world.controller = controller;
        },
      },
      {
        pattern: /^Given an app controller with an active ride on trip (.+)$/,
        run: ({ args, world }) => {
          const store = createAppStore();
          const requests: DeparturesRequestInput[] = [];
          const controller = createControllerHarness(store, requests);
          controller.startRide({
            boardedStopId: "HSL:2",
            destination: "Kamppi",
            line: "4",
            tripId: args[0],
          });
          world.store = store;
          world.controller = controller;
          world.departureRequests = requests;
        },
      },
      {
        pattern: /^When the rider boards trip (.+) at stop (.+) to (.+)$/,
        run: ({ args, world }) => {
          world.store?.startRide({
            boardedStopId: args[1],
            destination: args[2],
            line: "4",
            tripId: args[0],
          });
        },
      },
      {
        pattern: /^When the rider switches back to the wait view$/,
        run: ({ world }) => {
          world.store?.setActiveView("wait");
        },
      },
      {
        pattern: /^When the rider pins exit stop (.+)$/,
        run: ({ args, world }) => {
          world.store?.setRideExitStop(args[0]);
        },
      },
      {
        pattern: /^When the URL query is built from current state$/,
        run: ({ world }) => {
          if (!world.store) {
            throw new Error("Store required");
          }
          world.search = buildSearchFromState(world.store.getState());
        },
      },
      {
        pattern: /^When the rider jumps to Wait at stop (.+)$/,
        run: async ({ args, world }) => {
          await world.controller?.openWaitAtStop(args[0]);
        },
      },
      {
        pattern: /^Then the active view is (wait|ride)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.store?.getState().activeView, args[0]);
        },
      },
      {
        pattern: /^Then the background ride trip is still (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.store?.getState().ride.tripId, args[0]);
        },
      },
      {
        pattern: /^Then the pinned exit stop is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.store?.getState().ride.exitStopId, args[0]);
        },
      },
      {
        pattern: /^Then the URL query omits view and trip parameters$/,
        run: ({ assert, world }) => {
          const params = new URLSearchParams(world.search || "");
          assert.equal(params.has("view"), false);
          assert.equal(params.has("trip"), false);
        },
      },
      {
        pattern: /^Then the URL query contains view (.+), trip (.+), boarded (.+), and exit (.+)$/,
        run: ({ args, assert, world }) => {
          const params = new URLSearchParams(world.search || "");
          assert.equal(params.get("view"), args[0]);
          assert.equal(params.get("trip"), args[1]);
          assert.equal(params.get("boarded"), args[2]);
          assert.equal(params.get("exit"), args[3]);
        },
      },
      {
        pattern: /^Then departures were requested for stop (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.departureRequests?.[0]?.stopId, args[0]);
        },
      },
    ],
  },
);
