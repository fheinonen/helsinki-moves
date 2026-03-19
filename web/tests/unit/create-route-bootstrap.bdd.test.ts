import { act } from "react";
import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { bootstrapCreatePage } from "@client/create/bootstrap-create-page";
import { COMPONENT_TYPES } from "@client/create/create-route-catalog";
import { defaultSpec } from "@client/create/default-spec";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";

interface World {
  documentRef?: Document;
  pageHandle?: { destroy: () => void };
  response?: DeparturesSuccessResponse;
  root?: HTMLElement;
}

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function destroyPageHandle(world: World): Promise<void> {
  await act(async () => {
    world.pageHandle?.destroy();
  });
}

function createSuccessResponse(): DeparturesSuccessResponse {
  return {
    filterOptions: {
      destinations: [],
      lines: [],
    },
    mode: "TRAM",
    selectedStopId: "HSL:STOP_TRAM",
    station: {
      departures: [
        {
          departureIso: "2026-03-21T10:05:00.000Z",
          destination: "Lasipalatsi",
          line: "7",
        },
        {
          departureIso: "2026-03-21T10:09:00.000Z",
          destination: "Lansi-Pasila",
          line: "9",
        },
      ],
      distanceMeters: 25,
      stopCode: "H0401",
      stopCodes: ["H0401"],
      stopName: "Rautatientori",
      type: "stop",
    },
    stops: [],
  };
}

defineFeature<World>(
  test,
  `
Feature: Create route bootstrap

  Scenario: The create route renders departure rows with stop metadata after loading
    Given the create route document and a successful departures response
    When the create route is bootstrapped
    Then the create route shows an enabled prompt input
    And the create route default spec uses only shared catalog component types
    And the create route shows 1 mode group header
    And the create route shows the mode group title Tram
    And the create route shows the departure meta Rautatientori
    And the create route shows the departure meta Stop H0401
    And the create route renders 2 departure rows

  Scenario: The create route renders an error card when departures fail
    Given the create route document and a failing departures request
    When the create route is bootstrapped
    Then the create route shows the error text Could not load departures.
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the create route document and a successful departures response$/,
        run: ({ world }) => {
          document.body.innerHTML = "<div id='create-root'></div>";
          world.documentRef = document;
          world.root = document.querySelector<HTMLElement>("#create-root") || undefined;
          world.response = createSuccessResponse();
        },
      },
      {
        pattern: /^Given the create route document and a failing departures request$/,
        run: ({ world }) => {
          document.body.innerHTML = "<div id='create-root'></div>";
          world.documentRef = document;
          world.root = document.querySelector<HTMLElement>("#create-root") || undefined;
        },
      },
      {
        pattern: /^When the create route is bootstrapped$/,
        run: async ({ world }) => {
          if (!world.documentRef || !world.root) {
            throw new Error("Expected create route document");
          }
          const documentRef = world.documentRef;
          const root = world.root;

          await act(async () => {
            world.pageHandle = await bootstrapCreatePage({
              documentRef,
              fetchDepartures: async () => {
                if (!world.response) {
                  throw new Error("Could not load departures.");
                }
                return world.response;
              },
              nowMs: () => Date.parse("2026-03-21T10:00:00.000Z"),
              root,
            });
          });
        },
      },
      {
        pattern: /^Then the create route shows an enabled prompt input$/,
        run: ({ assert, world }) => {
          const prompt = world.root?.querySelector<HTMLInputElement>('[data-testid="create-prompt"]');
          assert.equal(prompt?.disabled, false);
        },
      },
      {
        pattern: /^Then the create route default spec uses only shared catalog component types$/,
        run: ({ assert }) => {
          const types = Object.values(defaultSpec.elements).map((element) => element.type);
          assert.equal(
            types.every((type) => COMPONENT_TYPES.includes(type as (typeof COMPONENT_TYPES)[number])),
            true
          );
        },
      },
      {
        pattern: /^Then the create route shows the departure meta (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.root?.textContent?.includes(args[0]), true);
        },
      },
      {
        pattern: /^Then the create route shows (\d+) mode group header$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.root?.querySelectorAll('[data-testid="mode-group-header"]').length, Number(args[0]));
        },
      },
      {
        pattern: /^Then the create route shows the mode group title (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.root?.textContent?.includes(args[0]), true);
        },
      },
      {
        pattern: /^Then the create route renders 2 departure rows$/,
        run: async ({ assert, world }) => {
          assert.equal(world.root?.querySelectorAll('[data-testid="departure-row"]').length, 2);
          await destroyPageHandle(world);
        },
      },
      {
        pattern: /^Then the create route shows the error text Could not load departures\.$/,
        run: async ({ assert, world }) => {
          const error = world.root?.querySelector('[data-testid="create-error"]');
          assert.equal(error?.textContent?.includes("Could not load departures."), true);
          await destroyPageHandle(world);
        },
      },
    ],
  }
);
