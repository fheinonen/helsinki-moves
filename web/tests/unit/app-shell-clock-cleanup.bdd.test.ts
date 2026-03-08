import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore, type AppStore } from "@client/app/app-store";
import { renderAppShell } from "@client/app/app-shell";
import { createAppController } from "@client/app/app-controller";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";

interface World {
  cleanup?: (() => void) | void;
  clearedIntervals?: number[];
  currentIntervalId?: number;
  originalClearInterval?: typeof globalThis.clearInterval;
  originalSetInterval?: typeof globalThis.setInterval;
  store?: AppStore;
}

defineFeature<World>(
  test,
  `
Feature: App shell clock cleanup

  Scenario: Clock interval is cleared when the shell is disposed
    Given clock timer cleanup is observed
    And the app store is loading departures
    When the app shell is rendered for clock cleanup
    And the rendered app shell is disposed
    Then the active clock interval is cleared
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given clock timer cleanup is observed$/,
        run: ({ world }) => {
          const originalSetInterval = globalThis.setInterval;
          const originalClearInterval = globalThis.clearInterval;
          const clearedIntervals: number[] = [];
          let nextIntervalId = 1;

          globalThis.setInterval = (((handler: TimerHandler, timeout?: number) => {
            void handler;
            void timeout;
            const intervalId = nextIntervalId;
            nextIntervalId += 1;
            world.currentIntervalId = intervalId;
            return intervalId as unknown as ReturnType<typeof setInterval>;
          }) as unknown) as typeof globalThis.setInterval;

          globalThis.clearInterval = ((intervalId: number | undefined) => {
            if (typeof intervalId === "number") {
              clearedIntervals.push(intervalId);
            }
          }) as typeof globalThis.clearInterval;

          world.clearedIntervals = clearedIntervals;
          world.originalClearInterval = originalClearInterval;
          world.originalSetInterval = originalSetInterval;
        },
      },
      {
        pattern: /^Given the app store is loading departures$/,
        run: ({ world }) => {
          const store = createAppStore();
          store.startLoading("Loading nearby departures...");
          world.store = store;
        },
      },
      {
        pattern: /^When the app shell is rendered for clock cleanup$/,
        run: ({ world }) => {
          if (!world.store) {
            throw new Error("Expected app store");
          }
          const documentRef = document.implementation.createHTMLDocument("app-shell-clock");
          documentRef.body.innerHTML = "<div id='root'></div>";
          const root = documentRef.querySelector<HTMLElement>("#root");
          if (!root) {
            throw new Error("Expected root");
          }

          const locationService: LocationService = {
            async getCurrentPosition() {
              return { code: "unavailable", ok: false };
            },
          };
          const departuresClient: DeparturesClient = {
            async getDepartures() {
              throw new Error("Departures client should not be called");
            },
          };
          const controller = createAppController({
            departuresClient,
            locationService,
            store: world.store,
          });

          world.cleanup = renderAppShell({
            controller,
            documentRef,
            root,
            store: world.store,
          });
        },
      },
      {
        pattern: /^When the rendered app shell is disposed$/,
        run: ({ world }) => {
          if (typeof world.cleanup !== "function") {
            throw new Error("Expected app shell cleanup");
          }
          world.cleanup();
          world.originalSetInterval && (globalThis.setInterval = world.originalSetInterval);
          world.originalClearInterval && (globalThis.clearInterval = world.originalClearInterval);
        },
      },
      {
        pattern: /^Then the active clock interval is cleared$/,
        run: ({ assert, world }) => {
          assert.equal(world.clearedIntervals?.join("|") || "", String(world.currentIntervalId || ""));
        },
      },
    ],
  }
);
