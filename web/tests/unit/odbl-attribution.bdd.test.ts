import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore, type AppStore } from "@client/app/app-store";
import { renderAppShell } from "@client/app/app-shell";
import { createAppController } from "@client/app/app-controller";
import { createVehicleSpanMap } from "@client/features/departures/vehicle-span-view";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";

interface World {
  container?: HTMLElement;
  map?: HTMLElement;
  store?: AppStore;
}

defineFeature<World>(
  test,
  `
Feature: Open Database License attribution

  Scenario: The street map names OpenStreetMap contributors and ODbL
    Given a street map for line 550 to Kamppi
    When the street map is shown
    Then the map credit reads "© OpenStreetMap contributors, HSL, ODbL"
    And the map credit links to "https://www.openstreetmap.org/copyright"

  Scenario: Voice choices name the address data and ODbL
    Given the board has a voice choice for Kamppi
    When the rider opens the departure board
    Then the voice choices show "Address data © OpenStreetMap contributors, ODbL."
    And the voice credit links to "https://www.openstreetmap.org/copyright"
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a street map for line (\S+) to (.+)$/,
        run: ({ args, world }) => {
          world.map = createVehicleSpanMap({
            destination: args[1] || "",
            documentRef: document,
            line: args[0] || "",
            onClose() {},
          }).element;
        },
      },
      {
        pattern: /^When the street map is shown$/,
        run: ({ world }) => {
          if (!world.map) {
            throw new Error("Expected the street map");
          }
          document.body.append(world.map);
        },
      },
      {
        pattern: /^Then the map credit reads "(.+)"$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.map?.querySelector(".vehicle-span__credit")?.textContent ?? "", args[0] ?? "");
        },
      },
      {
        pattern: /^Then the map credit links to "(.+)"$/,
        run: ({ args, assert, world }) => {
          const link = world.map?.querySelector<HTMLAnchorElement>(".vehicle-span__credit a");
          assert.equal(link?.href ?? "", args[0] ?? "");
        },
      },
      {
        pattern: /^Given the board has a voice choice for (.+)$/,
        run: ({ args, world }) => {
          const store = createAppStore();
          store.setVoiceChoices([
            {
              confidence: 0.8,
              label: args[0] || "",
              latitude: 60.1699,
              longitude: 24.9384,
            },
          ]);
          world.store = store;
        },
      },
      {
        pattern: /^When the rider opens the departure board$/,
        run: ({ world }) => {
          if (!world.store) {
            throw new Error("Expected the board store");
          }
          const documentRef = document.implementation.createHTMLDocument("odbl-attribution");
          documentRef.body.innerHTML = "<div id='root'></div>";
          const root = documentRef.querySelector<HTMLElement>("#root");
          if (!root) {
            throw new Error("Expected the board root");
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
          renderAppShell({
            controller: createAppController({
              departuresClient,
              locationService,
              store: world.store,
            }),
            documentRef,
            root,
          });
          world.container = root;
        },
      },
      {
        pattern: /^Then the voice choices show "(.+)"$/,
        run: ({ args, assert, world }) => {
          const credit = world.container?.querySelector("[data-voice-choices] .voice-choices__odbl");
          assert.equal(credit?.textContent ?? "", args[0] ?? "");
        },
      },
      {
        pattern: /^Then the voice credit links to "(.+)"$/,
        run: ({ args, assert, world }) => {
          const link = world.container?.querySelector<HTMLAnchorElement>(".voice-choices__odbl a");
          assert.equal(link?.href ?? "", args[0] ?? "");
        },
      },
    ],
  }
);
