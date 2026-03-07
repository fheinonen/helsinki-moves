import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore, type AppStore } from "@client/app/app-store";
import { renderAppShell } from "@client/app/app-shell";
import { createAppController } from "@client/app/app-controller";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";

interface World {
  container?: HTMLElement;
  store?: AppStore;
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
          departureIso: "2026-03-07T10:10:00.000Z",
          destination: "Kamppi",
          line: "550",
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
      {
        code: "B1",
        distanceMeters: 120,
        id: "HSL:STOP_B",
        memberStopIds: ["HSL:STOP_B"],
        name: "Ruoholahti",
        stopCodes: ["B1"],
      },
    ],
  };
}

defineFeature<World>(
  test,
  `
Feature: App shell filter controls

  Scenario: App shell renders stop selection and filter summary
    Given the app store has selected stop and filter state
    When the app shell is rendered with filter controls
    Then the stop selector shows the selected stop
    And the filter summary shows 3 active filters
    And two line filter toggles are visible
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app store has selected stop and filter state$/,
        run: ({ world }) => {
          const store = createAppStore();
          store.applyDeparturesResponse(createDeparturesResponse());
          store.toggleLineFilter("550");
          store.toggleDestinationFilter("Kamppi");
          world.store = store;
        },
      },
      {
        pattern: /^When the app shell is rendered with filter controls$/,
        run: ({ world }) => {
          if (!world.store) {
            throw new Error("Expected app store");
          }

          const documentRef = document.implementation.createHTMLDocument("app-shell-filters");
          documentRef.body.innerHTML = "<div id='root'></div>";
          const root = documentRef.querySelector<HTMLElement>("#root");
          if (!root) {
            throw new Error("Expected app shell root");
          }

          const locationService: LocationService = {
            async getCurrentPosition() {
              return { code: "unavailable", ok: false };
            },
          };
          const departuresClient: DeparturesClient = {
            async getDepartures() {
              return createDeparturesResponse();
            },
          };
          const controller = createAppController({
            departuresClient,
            locationService,
            store: world.store,
          });

          renderAppShell({
            controller,
            documentRef,
            root,
            store: world.store,
          });

          world.container = root;
        },
      },
      {
        pattern: /^Then the stop selector shows the selected stop$/,
        run: ({ assert, world }) => {
          const select = world.container?.querySelector<HTMLSelectElement>("[data-stop-select]");
          assert.equal(select?.value, "HSL:STOP_A");
        },
      },
      {
        pattern: /^Then the filter summary shows 3 active filters$/,
        run: ({ assert, world }) => {
          const summary = world.container?.querySelector<HTMLElement>("[data-filter-summary]");
          assert.equal(summary?.textContent, "Kamppi stop · 3 active filters");
        },
      },
      {
        pattern: /^Then two line filter toggles are visible$/,
        run: ({ assert, world }) => {
          const buttons = world.container?.querySelectorAll<HTMLElement>("[data-line-filter]");
          assert.equal(buttons?.length || 0, 2);
        },
      },
    ],
  }
);
