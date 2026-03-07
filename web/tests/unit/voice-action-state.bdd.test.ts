import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore, type AppStore } from "@client/app/app-store";
import { renderAppShell } from "@client/app/app-shell";
import { createAppController } from "@client/app/app-controller";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";

interface World {
  container?: HTMLElement;
  store?: AppStore;
}

defineFeature<World>(
  test,
  `
Feature: Voice action state

  Scenario: Voice action shows available state in the app shell
    Given the app store has voice available
    When the app shell is rendered with voice controls
    Then the voice action label is Voice Search
    And the voice action is enabled
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app store has voice available$/,
        run: ({ world }) => {
          const store = createAppStore();
          store.setVoiceAvailability("available");
          world.store = store;
        },
      },
      {
        pattern: /^When the app shell is rendered with voice controls$/,
        run: ({ world }) => {
          if (!world.store) {
            throw new Error("Expected app store");
          }

          const documentRef = document.implementation.createHTMLDocument("voice-shell");
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
        pattern: /^Then the voice action label is Voice Search$/,
        run: ({ assert, world }) => {
          const label = world.container?.querySelector<HTMLElement>("[data-voice-label]");
          assert.equal(label?.textContent, "Voice Search");
        },
      },
      {
        pattern: /^Then the voice action is enabled$/,
        run: ({ assert, world }) => {
          const button = world.container?.querySelector<HTMLButtonElement>("[data-voice-action]");
          assert.equal(button?.disabled, false);
        },
      },
    ],
  }
);
