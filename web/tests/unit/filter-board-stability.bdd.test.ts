import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore } from "@client/app/app-store";
import { renderAppShell } from "@client/app/app-shell";
import { createAppController, type AppController } from "@client/app/app-controller";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

interface World {
  boardCard?: Element | null;
  container?: HTMLElement;
  controller?: AppController;
  reload?: Deferred<DeparturesSuccessResponse>;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createDeparturesResponse(): DeparturesSuccessResponse {
  return {
    filterOptions: {
      destinations: [
        { count: 2, value: "Kamppi" },
        { count: 1, value: "Pasila" },
      ],
      lines: [
        { count: 2, value: "550" },
        { count: 1, value: "510" },
      ],
    },
    mode: "BUS",
    selectedStopId: "HSL:STOP_A",
    station: {
      departures: [
        {
          departureIso: "2026-03-07T10:05:00.000Z",
          destination: "Kamppi",
          line: "550",
        },
        {
          departureIso: "2026-03-07T10:08:00.000Z",
          destination: "Pasila",
          line: "510",
        },
      ],
      distanceMeters: 80,
      stopCode: "A1",
      stopCodes: ["A1"],
      stopName: "Kamppi",
      type: "stop",
    },
    stops: [
      {
        code: "A1",
        distanceMeters: 80,
        id: "HSL:STOP_A",
        memberStopIds: ["HSL:STOP_A"],
        name: "Kamppi",
        stopCodes: ["A1"],
      },
    ],
  };
}

function clickFilter(world: World, selector: string): void {
  const button = world.container?.querySelector<HTMLButtonElement>(selector);
  if (!button) {
    throw new Error(`Expected filter control ${selector}`);
  }
  world.boardCard = world.container?.querySelector(".departure-card") || null;
  button.click();
}

async function releaseReload(world: World): Promise<void> {
  world.reload?.resolve(createDeparturesResponse());
  await world.reload?.promise;
  await Promise.resolve();
}

defineFeature<World>(
  test,
  `
Feature: Departure board during filters

  Scenario: Filtering by line keeps the departure board on screen
    Given departures are on screen
    When the user filters by line 550 and the new departures have not arrived
    Then the departure board stays on screen
    And the loading status stays hidden

  Scenario: Filtering by destination keeps the departure board on screen
    Given departures are on screen
    When the user filters by destination Kamppi and the new departures have not arrived
    Then the departure board stays on screen
    And the loading status stays hidden
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given departures are on screen$/,
        run: ({ world }) => {
          const store = createAppStore({
            coords: { lat: 60.17, lon: 24.94 },
          });
          store.applyDeparturesResponse(createDeparturesResponse());
          const reload = createDeferred<DeparturesSuccessResponse>();
          world.reload = reload;
          const locationService: LocationService = {
            async getCurrentPosition() {
              return { code: "unavailable", ok: false };
            },
          };
          const departuresClient: DeparturesClient = {
            async getDepartures() {
              return reload.promise;
            },
          };
          const controller = createAppController({
            departuresClient,
            locationService,
            store,
          });
          const documentRef = document.implementation.createHTMLDocument("filter-board");
          documentRef.body.innerHTML = "<div id='root'></div>";
          const root = documentRef.querySelector<HTMLElement>("#root");
          if (!root) {
            throw new Error("Expected app shell root");
          }
          renderAppShell({
            controller,
            documentRef,
            root,
          });
          world.container = root;
          world.controller = controller;
          root.querySelector<HTMLButtonElement>("[data-filter-toggle]")?.click();
        },
      },
      {
        pattern: /^When the user filters by line (.+) and the new departures have not arrived$/,
        run: ({ args, world }) => {
          clickFilter(world, `[data-line-filter="${args[0]}"]`);
        },
      },
      {
        pattern: /^When the user filters by destination (.+) and the new departures have not arrived$/,
        run: ({ args, world }) => {
          clickFilter(world, `[data-destination-filter="${args[0]}"]`);
        },
      },
      {
        pattern: /^Then the departure board stays on screen$/,
        run: ({ assert, world }) => {
          const table = world.container?.querySelector<HTMLTableElement>(
            ".app-shell__departures-table"
          );
          assert.equal(
            table?.hidden,
            false,
            "departure board was hidden while filtered departures were still loading"
          );
          assert.equal(
            world.container?.querySelector(".departure-card"),
            world.boardCard || null,
            "departure row was replaced while filtered departures were still loading"
          );
        },
      },
      {
        pattern: /^Then the loading status stays hidden$/,
        run: async ({ assert, world }) => {
          try {
            const status = world.container?.querySelector<HTMLElement>("[data-status]");
            assert.equal(
            status?.textContent,
            "",
            "loading status replaced the board while filtered departures were still loading"
          );
          } finally {
            await releaseReload(world);
          }
        },
      },
    ],
  }
);
