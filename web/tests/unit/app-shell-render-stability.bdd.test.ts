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
  firstDepartureRow?: Element | null;
  firstFilterChip?: Element | null;
  firstStopOption?: HTMLElement | null;
  firstVoiceChoice?: Element | null;
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
        {
          departureIso: "2026-03-07T10:12:00.000Z",
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
Feature: App shell render stability

  Scenario: Unchanged shell collections stay attached across unrelated state changes
    Given the app store contains departures filters stops and voice choices
    When the app shell is rendered with departures filters stops and voice choices
    And I remember the first departure row filter chip stop option and voice choice
    And the app store status message changes
    Then the remembered departure row stays attached
    And the remembered filter chip stays attached
    And the remembered stop option stays attached
    And the remembered voice choice stays attached
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app store contains departures filters stops and voice choices$/,
        run: ({ world }) => {
          const store = createAppStore();
          store.applyDeparturesResponse(createDeparturesResponse());
          store.toggleLineFilter("550");
          store.setVoiceChoices([
            {
              confidence: 0.8,
              label: "Kamppi",
              latitude: 60.1699,
              longitude: 24.9384,
            },
          ]);
          world.store = store;
        },
      },
      {
        pattern: /^When the app shell is rendered with departures filters stops and voice choices$/,
        run: ({ world }) => {
          if (!world.store) {
            throw new Error("Expected app store");
          }
          const documentRef = document.implementation.createHTMLDocument("app-shell-stability");
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
        pattern: /^When I remember the first departure row filter chip stop option and voice choice$/,
        run: ({ world }) => {
          world.firstDepartureRow = world.container?.querySelector(".departure-card") || null;
          world.firstFilterChip = world.container?.querySelector("[data-line-filter]") || null;
          world.firstStopOption =
            (world.container?.querySelector<HTMLElement>("[data-stop-option]") as HTMLOptionElement | null) ||
            null;
          world.firstVoiceChoice = world.container?.querySelector("[data-voice-choice]") || null;
        },
      },
      {
        pattern: /^When the app store status message changes$/,
        run: ({ world }) => {
          if (!world.store) {
            throw new Error("Expected app store");
          }
          world.store.setStatus("Refreshed nearby departures");
        },
      },
      {
        pattern: /^Then the remembered departure row stays attached$/,
        run: ({ assert, world }) => {
          assert.equal(world.container?.querySelector(".departure-card"), world.firstDepartureRow || null);
        },
      },
      {
        pattern: /^Then the remembered filter chip stays attached$/,
        run: ({ assert, world }) => {
          assert.equal(world.container?.querySelector("[data-line-filter]"), world.firstFilterChip || null);
        },
      },
      {
        pattern: /^Then the remembered stop option stays attached$/,
        run: ({ assert, world }) => {
          assert.equal(world.container?.querySelector("[data-stop-option]") || null, world.firstStopOption || null);
        },
      },
      {
        pattern: /^Then the remembered voice choice stays attached$/,
        run: ({ assert, world }) => {
          assert.equal(world.container?.querySelector("[data-voice-choice]"), world.firstVoiceChoice || null);
        },
      },
    ],
  }
);
