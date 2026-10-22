import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppController, type AppController } from "@client/app/app-controller";
import { createAppStore, type AppStore } from "@client/app/app-store";
import { bootstrapApp } from "@client/app/bootstrap";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";

function createController(): AppController {
  const departuresClient: DeparturesClient = {
    async getDepartures() {
      throw new Error("Departures client should not be called");
    },
  };
  const locationService: LocationService = {
    async getCurrentPosition() {
      return { code: "unavailable", ok: false };
    },
  };
  return createAppController({
    departuresClient,
    locationService,
    store: createAppStore(),
  });
}

interface HistoryLike {
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

interface LocationLike {
  hash?: string;
  pathname: string;
  search: string;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface World {
  documentRef?: Document;
  historyRef?: HistoryLike;
  locationRef?: LocationLike;
  root?: HTMLElement;
  storage?: StorageLike;
  store?: AppStore;
}

function createStorage(): StorageLike {
  const values = new Map<string, string>();
  return {
    getItem(key) {
      return values.get(key) || null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

function installQueryPage(world: World, search: string): void {
  world.documentRef = document.implementation.createHTMLDocument("bootstrap-query");
  world.documentRef.body.innerHTML = "<div id='root'></div>";
  const root = world.documentRef.querySelector<HTMLElement>("#root");
  if (!root) {
    throw new Error("Expected bootstrap root");
  }

  world.root = root;
  world.storage = createStorage();
  world.locationRef = {
    pathname: "/",
    search,
  };
  world.historyRef = {
    replaceState(_data, _unused, url) {
      const nextUrl = String(url || "");
      const parsed = new URL(nextUrl, "http://localhost");
      if (!world.locationRef) {
        throw new Error("Expected location reference");
      }
      world.locationRef.search = parsed.search;
    },
  };
}

defineFeature<World>(
  test,
  `
Feature: Bootstrap query state

  Scenario: Bootstrap restores mode from the URL but ignores stale stop filters
    Given the page URL contains bus mode and stale stop filters
    When the app is bootstrapped with query state support
    Then the active mode is BUS
    And the selected stop id is empty

  Scenario: Bootstrap syncs the selected stop back into the URL after departures load
    Given the page URL contains bus mode and stale stop filters
    When the app is bootstrapped with query state support
    And departures for the nearest stop are applied
    Then the current URL stop query equals HSL:NEAR
    And the current URL has no line or destination filters

  Scenario: Bootstrap applies a line filter from the URL
    Given the page URL contains bus mode and line filter 550
    When the app is bootstrapped with query state support
    Then the active mode is BUS
    And the selected stop id is empty
    And the line filters equal 550
    And the destination filters are empty

  Scenario: Bootstrap applies a destination filter from the URL
    Given the page URL contains bus mode and destination filter Kamppi
    When the app is bootstrapped with query state support
    Then the active mode is BUS
    And the selected stop id is empty
    And the destination filters equal Kamppi
    And the line filters are empty

  Scenario: Bootstrap keeps a URL line filter when that line is offered
    Given the page URL contains bus mode and line filter 550
    When the app is bootstrapped with query state support
    And departures that offer line 550 and destination Kamppi are applied
    Then the line filters equal 550
    And the destination filters are empty
    And the current URL line query equals 550
    And the current URL has no destination filter

  Scenario: Bootstrap keeps a URL destination filter when that destination is offered
    Given the page URL contains bus mode and destination filter Kamppi
    When the app is bootstrapped with query state support
    And departures that offer line 550 and destination Kamppi are applied
    Then the destination filters equal Kamppi
    And the line filters are empty
    And the current URL destination query equals Kamppi
    And the current URL has no line filter

  Scenario: Bootstrap trims repeated line and destination filters from the URL
    Given the page URL repeats a padded line and destination filter
    When the app is bootstrapped with query state support
    Then the active mode is BUS
    And the line filters equal 550|20
    And the destination filters equal Kamppi

  Scenario: Bootstrap applies mode from the URL without inventing filters
    Given the page URL contains tram mode and no line or destination filters
    When the app is bootstrapped with query state support
    Then the active mode is TRAM
    And the line filters are empty
    And the destination filters are empty
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the page URL contains bus mode and stale stop filters$/,
        run: ({ world }) => {
          installQueryPage(world, "?mode=bus&stop=HSL:OLD&line=550&dest=Old%20Terminal");
        },
      },
      {
        pattern: /^Given the page URL contains bus mode and line filter 550$/,
        run: ({ world }) => {
          installQueryPage(world, "?mode=bus&line=550");
        },
      },
      {
        pattern: /^Given the page URL contains bus mode and destination filter Kamppi$/,
        run: ({ world }) => {
          installQueryPage(world, "?mode=bus&dest=Kamppi");
        },
      },
      {
        pattern: /^Given the page URL repeats a padded line and destination filter$/,
        run: ({ world }) => {
          installQueryPage(
            world,
            "?mode=bus&line=%20550%20&line=550&line=&line=20&dest=%20Kamppi%20&dest=Kamppi"
          );
        },
      },
      {
        pattern: /^Given the page URL contains tram mode and no line or destination filters$/,
        run: ({ world }) => {
          installQueryPage(world, "?mode=tram");
        },
      },
      {
        pattern: /^When the app is bootstrapped with query state support$/,
        run: ({ world }) => {
          if (
            !world.documentRef ||
            !world.root ||
            !world.storage ||
            !world.historyRef ||
            !world.locationRef
          ) {
            throw new Error("Expected bootstrap query-state world");
          }

          world.store = bootstrapApp({
            controller: createController(),
            documentRef: world.documentRef,
            historyRef: world.historyRef,
            locationRef: world.locationRef,
            root: world.root,
            storage: world.storage,
          });
        },
      },
      {
        pattern: /^When departures for the nearest stop are applied$/,
        run: ({ world }) => {
          if (!world.store) {
            throw new Error("Expected app store");
          }

          world.store.applyDeparturesResponse({
            filterOptions: {
              destinations: [{ count: 1, value: "Central Railway Station" }],
              lines: [{ count: 1, value: "20" }],
            },
            mode: "BUS",
            selectedStopId: "HSL:NEAR",
            station: {
              departures: [],
              distanceMeters: 80,
              stopCode: "N100",
              stopCodes: ["N100"],
              stopName: "Nearest Stop",
              type: "stop",
            },
            stops: [
              {
                code: "N100",
                distanceMeters: 80,
                id: "HSL:NEAR",
                memberStopIds: ["HSL:NEAR"],
                name: "Nearest Stop",
                stopCodes: ["N100"],
              },
            ],
          });
        },
      },
      {
        pattern: /^When departures that offer line 550 and destination Kamppi are applied$/,
        run: ({ world }) => {
          if (!world.store) {
            throw new Error("Expected app store");
          }

          world.store.applyDeparturesResponse({
            filterOptions: {
              destinations: [
                { count: 1, value: "Kamppi" },
                { count: 1, value: "Pasila" },
              ],
              lines: [
                { count: 1, value: "550" },
                { count: 1, value: "20" },
              ],
            },
            mode: "BUS",
            selectedStopId: "HSL:NEAR",
            station: {
              departures: [],
              distanceMeters: 80,
              stopCode: "N100",
              stopCodes: ["N100"],
              stopName: "Nearest Stop",
              type: "stop",
            },
            stops: [
              {
                code: "N100",
                distanceMeters: 80,
                id: "HSL:NEAR",
                memberStopIds: ["HSL:NEAR"],
                name: "Nearest Stop",
                stopCodes: ["N100"],
              },
            ],
          });
        },
      },
      {
        pattern: /^Then the active mode is BUS$/,
        run: ({ assert, world }) => {
          assert.equal(world.store?.getState().activeMode, "BUS");
        },
      },
      {
        pattern: /^Then the active mode is TRAM$/,
        run: ({ assert, world }) => {
          assert.equal(world.store?.getState().activeMode, "TRAM");
        },
      },
      {
        pattern: /^Then the line filters equal (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.store?.getState().filters.lines.join("|"), args[0]);
        },
      },
      {
        pattern: /^Then the destination filters equal (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.store?.getState().filters.destinations.join("|"), args[0]);
        },
      },
      {
        pattern: /^Then the line filters are empty$/,
        run: ({ assert, world }) => {
          assert.equal(world.store?.getState().filters.lines.length, 0);
        },
      },
      {
        pattern: /^Then the destination filters are empty$/,
        run: ({ assert, world }) => {
          assert.equal(world.store?.getState().filters.destinations.length, 0);
        },
      },
      {
        pattern: /^Then the selected stop id is empty$/,
        run: ({ assert, world }) => {
          assert.equal(world.store?.getState().selectedStopId, null);
          assert.equal(world.store?.getState().filters.stopId, null);
        },
      },
      {
        pattern: /^Then the current URL stop query equals HSL:NEAR$/,
        run: ({ assert, world }) => {
          const params = new URLSearchParams(world.locationRef?.search || "");
          assert.equal(params.get("stop"), "HSL:NEAR");
        },
      },
      {
        pattern: /^Then the current URL has no line or destination filters$/,
        run: ({ assert, world }) => {
          const params = new URLSearchParams(world.locationRef?.search || "");
          assert.equal(params.getAll("line").length, 0);
          assert.equal(params.getAll("dest").length, 0);
        },
      },
      {
        pattern: /^Then the current URL line query equals (.+)$/,
        run: ({ args, assert, world }) => {
          const params = new URLSearchParams(world.locationRef?.search || "");
          assert.equal(params.get("line"), args[0]);
        },
      },
      {
        pattern: /^Then the current URL destination query equals (.+)$/,
        run: ({ args, assert, world }) => {
          const params = new URLSearchParams(world.locationRef?.search || "");
          assert.equal(params.get("dest"), args[0]);
        },
      },
      {
        pattern: /^Then the current URL has no destination filter$/,
        run: ({ assert, world }) => {
          const params = new URLSearchParams(world.locationRef?.search || "");
          assert.equal(params.getAll("dest").length, 0);
        },
      },
      {
        pattern: /^Then the current URL has no line filter$/,
        run: ({ assert, world }) => {
          const params = new URLSearchParams(world.locationRef?.search || "");
          assert.equal(params.getAll("line").length, 0);
        },
      },
    ],
  }
);
