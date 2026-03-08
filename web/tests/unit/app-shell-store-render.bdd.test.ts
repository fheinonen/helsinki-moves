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
  controller?: ReturnType<typeof createAppController>;
  documentRef?: Document;
  store?: AppStore;
}

defineFeature<World>(
  test,
  `
Feature: App shell rendering

  Scenario: App shell renders the active mode and departure cards from store state
    Given the app store contains bus departures
    When the app shell is rendered from the app store
    Then the active mode button is BUS
    And two departure cards are visible
    And the station title is Kamppi
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app store contains bus departures$/,
        run: ({ world }) => {
          const store = createAppStore();
          const response: DeparturesSuccessResponse = {
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
                {
                  departureIso: "2026-03-07T10:12:00.000Z",
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
          store.applyDeparturesResponse(response);
          world.store = store;
        },
      },
      {
        pattern: /^When the app shell is rendered from the app store$/,
        run: ({ world }) => {
          if (!world.store) {
            throw new Error("Expected app store");
          }
          const documentRef = document.implementation.createHTMLDocument("app-shell");
          documentRef.body.innerHTML = "<div id='root'></div>";
          const container = documentRef.querySelector<HTMLElement>("#root");
          if (!container) {
            throw new Error("Expected app shell root");
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
            root: container,
            store: world.store,
          });

          world.container = container;
          world.controller = controller;
          world.documentRef = documentRef;
        },
      },
      {
        pattern: /^Then the active mode button is BUS$/,
        run: ({ assert, world }) => {
          const activeButton = world.container?.querySelector<HTMLButtonElement>(
            '[data-mode="BUS"]'
          );
          assert.equal(activeButton?.getAttribute("aria-checked"), "true");
        },
      },
      {
        pattern: /^Then two departure cards are visible$/,
        run: ({ assert, world }) => {
          const count = world.container?.querySelectorAll(".departure-card").length || 0;
          assert.equal(count, 2);
        },
      },
      {
        pattern: /^Then the station title is Kamppi$/,
        run: ({ assert, world }) => {
          assert.equal(world.container?.querySelector("[data-station-title]")?.textContent, "Kamppi");
        },
      },
    ],
  }
);
