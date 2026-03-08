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
      destinations: [{ count: 2, value: "Kamppi" }],
      lines: [{ count: 2, value: "550" }],
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
    stops: [],
  };
}

defineFeature<World>(
  test,
  `
Feature: App shell departure table semantics

  Scenario: Departure rows are exposed with table headers
    Given the app store contains departures
    When the app shell is rendered with departures
    Then the departures are rendered in a data table
    And the departures table has Line Destination and Departure headers
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app store contains departures$/,
        run: ({ world }) => {
          const store = createAppStore();
          store.applyDeparturesResponse(createDeparturesResponse());
          world.store = store;
        },
      },
      {
        pattern: /^When the app shell is rendered with departures$/,
        run: ({ world }) => {
          if (!world.store) {
            throw new Error("Expected app store");
          }
          const documentRef = document.implementation.createHTMLDocument("app-shell-table");
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
        pattern: /^Then the departures are rendered in a data table$/,
        run: ({ assert, world }) => {
          assert.equal(Boolean(world.container?.querySelector("table")), true);
          assert.equal(Boolean(world.container?.querySelector("tbody")), true);
        },
      },
      {
        pattern: /^Then the departures table has Line Destination and Departure headers$/,
        run: ({ assert, world }) => {
          const labels = [...(world.container?.querySelectorAll("thead th") || [])]
            .map((header) => header.textContent)
            .join("|");
          assert.equal(labels, "Line|Destination|Departure");
        },
      },
    ],
  }
);
