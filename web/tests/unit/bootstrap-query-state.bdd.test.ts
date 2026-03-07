import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { bootstrapApp } from "@client/app/bootstrap";
import type { AppStore } from "@client/app/app-store";

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
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the page URL contains bus mode and stale stop filters$/,
        run: ({ world }) => {
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
            search: "?mode=bus&stop=HSL:OLD&line=550&dest=Old%20Terminal",
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
        pattern: /^Then the active mode is BUS$/,
        run: ({ assert, world }) => {
          assert.equal(world.store?.getState().activeMode, "BUS");
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
    ],
  }
);
