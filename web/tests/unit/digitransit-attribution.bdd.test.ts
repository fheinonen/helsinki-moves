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
      destinations: [{ count: 1, value: "Kamppi" }],
      lines: [{ count: 1, value: "550" }],
    },
    mode: "BUS",
    selectedStopId: "HSL:STOP_A",
    station: {
      departures: [
        {
          departureIso: "2026-03-07T12:37:07.000Z",
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

function applyDeparturesAt(store: AppStore, receivedAtIso: string): void {
  const receivedAtMs = Date.parse(receivedAtIso);
  const now = Date.now;
  Date.now = () => receivedAtMs;
  try {
    store.applyDeparturesResponse(createDeparturesResponse());
  } finally {
    Date.now = now;
  }
}

defineFeature<World>(
  test,
  `
Feature: Digitransit data attribution

  Scenario: The departure board footer credits Digitransit and the time the data was received
    Given the board received Digitransit departures at 2026-03-07T12:32:07.000Z
    When the rider opens the departure board
    Then the footer reads "© Digitransit 2026. Data received 2026-03-07 14:32:07."
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the board received Digitransit departures at (\S+)$/,
        run: ({ args, world }) => {
          const receivedAtIso = args[0];
          if (!receivedAtIso || Number.isNaN(Date.parse(receivedAtIso))) {
            throw new Error("Expected the time the data was received");
          }
          const store = createAppStore();
          applyDeparturesAt(store, receivedAtIso);
          world.store = store;
        },
      },
      {
        pattern: /^When the rider opens the departure board$/,
        run: ({ world }) => {
          if (!world.store) {
            throw new Error("Expected the board store");
          }
          const documentRef = document.implementation.createHTMLDocument("digitransit-attribution");
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
          const controller = createAppController({
            departuresClient,
            locationService,
            store: world.store,
          });
          renderAppShell({
            controller,
            documentRef,
            root,
          });
          world.container = root;
        },
      },
      {
        pattern: /^Then the footer reads "(.+)"$/,
        run: ({ args, assert, world }) => {
          const footer = world.container?.querySelector("footer");
          assert.equal(footer?.textContent ?? "", args[0] ?? "");
        },
      },
    ],
  }
);
