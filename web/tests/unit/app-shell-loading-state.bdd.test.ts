import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore, type AppStore } from "@client/app/app-store";
import { renderAppShell } from "@client/app/app-shell";
import { createAppController } from "@client/app/app-controller";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";

interface World {
  container?: HTMLElement;
  documentRef?: Document;
  store?: AppStore;
}

defineFeature<World>(
  test,
  `
Feature: App shell loading state

  Scenario: App shell shows loading status and no cards while loading
    Given the app store is loading departures
    When the app shell is rendered
    Then the loading status message is visible
    And no departure cards are visible
    And the refresh button is visible
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app store is loading departures$/,
        run: ({ world }) => {
          const store = createAppStore();
          store.startLoading("Loading nearby departures...");
          world.store = store;
        },
      },
      {
        pattern: /^When the app shell is rendered$/,
        run: ({ world }) => {
          if (!world.store) {
            throw new Error("Expected app store");
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
          const documentRef = document.implementation.createHTMLDocument("loading-shell");
          documentRef.body.innerHTML = "<div id='root'></div>";
          const container = documentRef.querySelector<HTMLElement>("#root");
          if (!container) {
            throw new Error("Expected app shell root");
          }
          renderAppShell({
            controller,
            documentRef,
            root: container,
            store: world.store,
          });
          world.documentRef = documentRef;
          world.container = container;
        },
      },
      {
        pattern: /^Then the loading status message is visible$/,
        run: ({ assert, world }) => {
          const status = world.container?.querySelector<HTMLElement>("[data-status]");
          assert.equal(status?.textContent, "Loading nearby departures...");
        },
      },
      {
        pattern: /^Then no departure cards are visible$/,
        run: ({ assert, world }) => {
          assert.equal(world.container?.querySelectorAll(".departure-card").length || 0, 0);
        },
      },
      {
        pattern: /^Then the refresh button is visible$/,
        run: ({ assert, world }) => {
          const button = world.container?.querySelector<HTMLButtonElement>("[data-refresh]");
          assert.equal(Boolean(button), true);
        },
      },
    ],
  }
);
