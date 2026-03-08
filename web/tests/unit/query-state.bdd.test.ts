import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  buildSearchFromState,
  readModeFromSearch,
  syncUrlFromState,
  type HistoryLike,
  type LocationLike,
} from "@client/lib/persistence/query-state";
import type { AppState } from "@client/app/app-store";

interface World {
  historyCalls?: string[];
  locationRef?: LocationLike;
  search?: string;
  state?: AppState;
}

function createBaseState(): AppState {
  return {
    activeMode: "BUS",
    coords: null,
    filters: {
      destinations: [" Kamppi ", "", "Pasila"],
      lines: [" 550 ", ""],
      stopId: "HSL:FILTER",
    },
    filterOptions: {
      destinations: [],
      lines: [],
    },
    loadState: "idle",
    message: null,
    selectedStopId: "HSL:SELECTED",
    station: null,
    statusMessage: null,
    stops: [],
    theme: "dark",
    voice: {
      availability: "available",
      choices: [],
      pendingQuery: null,
      phase: "idle",
    },
  };
}

defineFeature<World>(
  test,
  `
Feature: Query state persistence

  Scenario: Invalid mode query falls back to rail
    Given the page search contains an invalid mode
    When the mode is read from the page search
    Then the persisted mode is RAIL

  Scenario: Search state prefers the selected stop and trims empty filter values
    Given the app state has a selected stop and mixed empty filters
    When the search query is built from app state
    Then the built search query keeps selected stop HSL:SELECTED line 550 and destinations Kamppi and Pasila

  Scenario: URL sync skips replaceState when the search is unchanged
    Given the current page search already matches the app state
    When the app state is synced into the URL
    Then no history replacement occurs
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the page search contains an invalid mode$/,
        run: ({ world }) => {
          world.search = "?mode=hovercraft";
        },
      },
      {
        pattern: /^When the mode is read from the page search$/,
        run: ({ world }) => {
          world.search = readModeFromSearch(world.search || "");
        },
      },
      {
        pattern: /^Then the persisted mode is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.search, args[0]);
        },
      },
      {
        pattern: /^Given the app state has a selected stop and mixed empty filters$/,
        run: ({ world }) => {
          world.state = createBaseState();
        },
      },
      {
        pattern: /^When the search query is built from app state$/,
        run: ({ world }) => {
          world.search = buildSearchFromState(world.state || createBaseState());
        },
      },
      {
        pattern: /^Then the built search query keeps selected stop (.+) line (.+) and destinations (.+) and (.+)$/,
        run: ({ args, assert, world }) => {
          const params = new URLSearchParams(world.search || "");
          assert.equal(params.get("mode"), "bus");
          assert.equal(params.get("stop"), args[0]);
          assert.equal(params.get("line"), args[1]);
          assert.equal(params.getAll("dest").join(" | "), `${args[2]} | ${args[3]}`);
        },
      },
      {
        pattern: /^Given the current page search already matches the app state$/,
        run: ({ world }) => {
          const state = createBaseState();
          const search = buildSearchFromState(state);
          const historyCalls: string[] = [];
          const historyRef: HistoryLike = {
            replaceState(_data, _unused, url) {
              historyCalls.push(String(url || ""));
            },
          };
          world.historyCalls = historyCalls;
          world.locationRef = {
            hash: "#top",
            pathname: "/",
            search,
          };
          world.state = state;
          void historyRef;
        },
      },
      {
        pattern: /^When the app state is synced into the URL$/,
        run: ({ world }) => {
          const historyRef: HistoryLike = {
            replaceState(_data, _unused, url) {
              world.historyCalls?.push(String(url || ""));
            },
          };
          if (!world.locationRef || !world.state) {
            throw new Error("Expected query-state world");
          }
          syncUrlFromState({
            historyRef,
            locationRef: world.locationRef,
            state: world.state,
          });
        },
      },
      {
        pattern: /^Then no history replacement occurs$/,
        run: ({ assert, world }) => {
          assert.equal(world.historyCalls?.length, 0);
        },
      },
    ],
  }
);
