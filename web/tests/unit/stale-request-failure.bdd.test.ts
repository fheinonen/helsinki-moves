import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore } from "@client/app/app-store";
import { createAppController, type AppController } from "@client/app/app-controller";
import type { DeparturesClient } from "@client/services/departures-client";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { LocationService } from "@client/services/location-service";

interface Deferred<T> {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let reject!: (reason?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

interface World {
  controller?: AppController;
  firstDeferred?: Deferred<DeparturesSuccessResponse>;
  secondDeferred?: Deferred<DeparturesSuccessResponse>;
}

defineFeature<World>(
  test,
  `
Feature: Stale request failure

  Scenario: An older departures failure does not overwrite a newer success
    Given the app controller has an older failing departures request and a newer success
    When two nearby departures refreshes run in sequence
    Then the load state stays ready
    And the current station name is Newer
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app controller has an older failing departures request and a newer success$/,
        run: ({ world }) => {
          world.firstDeferred = createDeferred<DeparturesSuccessResponse>();
          world.secondDeferred = createDeferred<DeparturesSuccessResponse>();
          let callCount = 0;

          const locationService: LocationService = {
            async getCurrentPosition() {
              return {
                ok: true,
                value: { lat: 60.17, lon: 24.94 },
              };
            },
          };

          const departuresClient: DeparturesClient = {
            async getDepartures() {
              callCount += 1;
              return (callCount === 1 ? world.firstDeferred : world.secondDeferred)
                ?.promise as Promise<DeparturesSuccessResponse>;
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
        pattern: /^When two nearby departures refreshes run in sequence$/,
        run: async ({ world }) => {
          if (!world.controller || !world.firstDeferred || !world.secondDeferred) {
            throw new Error("Expected stale request failure world");
          }

          const firstRequest = world.controller.refreshNearbyDepartures();
          await Promise.resolve();
          const secondRequest = world.controller.refreshNearbyDepartures();

          world.secondDeferred.resolve({
            filterOptions: { destinations: [], lines: [] },
            mode: "BUS",
            selectedStopId: "NEWER_STOP",
            station: {
              departures: [],
              distanceMeters: 50,
              stopCode: "N1",
              stopCodes: ["N1"],
              stopName: "Newer",
              type: "stop",
            },
            stops: [],
          });

          world.firstDeferred.reject(new Error("older request failed"));

          await Promise.allSettled([firstRequest, secondRequest]);
        },
      },
      {
        pattern: /^Then the load state stays ready$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().loadState, "ready");
        },
      },
      {
        pattern: /^Then the current station name is Newer$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().station?.stopName, "Newer");
        },
      },
    ],
  }
);
