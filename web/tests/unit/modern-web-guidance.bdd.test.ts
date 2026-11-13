import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { createAppController } from "@client/app/app-controller";
import { createAppStore, type AppStore } from "@client/app/app-store";
import { renderAppShell } from "@client/app/app-shell";
import { createVehicleSpanMap } from "@client/features/departures/vehicle-span-view";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import { defineFeature } from "@tests/helpers/bdd-runner";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

interface World {
  css?: string;
  head?: HTMLElement;
  map?: HTMLElement;
  root?: HTMLElement;
  store?: AppStore;
}

function pressableDepartures(): DeparturesSuccessResponse {
  return {
    filterOptions: {
      destinations: [{ count: 1, value: "Kamppi" }],
      lines: [{ count: 1, value: "550" }],
    },
    mode: "BUS",
    selectedStopId: "HSL:STOP1",
    station: {
      departures: [
        {
          departureIso: "2000-01-01T00:00:00.000Z",
          destination: "Kamppi",
          line: "550",
          stopId: "HSL:STOP1",
          tripId: "HSL:TRIP1",
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

function renderShell(world: World): void {
  const store = world.store;
  if (!store) {
    throw new Error("Expected store");
  }
  const documentRef = document.implementation.createHTMLDocument("guidance");
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
  renderAppShell({
    controller: createAppController({
      departuresClient,
      locationService,
      store,
    }),
    documentRef,
    openVehicleSpan: () => () => undefined,
    root,
  });
  world.root = root;
}

function buttonText(root: HTMLElement | undefined, text: string): HTMLButtonElement | null {
  const buttons = [...(root?.querySelectorAll("button") ?? [])];
  return buttons.find((button) => (button.textContent || "").replace(/\s+/g, " ").trim() === text) ?? null;
}

function departureButton(root: HTMLElement | undefined): HTMLButtonElement | null {
  const row = [...(root?.querySelectorAll("tr") ?? [])].find((candidate) => {
    const text = candidate.textContent || "";
    return text.includes("550") && text.includes("Kamppi");
  });
  return row?.querySelector("button") ?? null;
}

function focusRuleRemovesOutline(css: string, selector: string): boolean {
  const blocks = css.match(/[^{}]+\{[^{}]*\}/g) ?? [];
  return blocks.some((block) => {
    const head = block.slice(0, block.indexOf("{"));
    const body = block.slice(block.indexOf("{"));
    return head.includes(selector) && /outline:\s*none/.test(body);
  });
}

defineFeature<World>(
  test,
  `
Feature: Modern web guidance

  Scenario: A keyboard user opens a departure from its button
    Given a pressable departure for line 550 to Kamppi
    When the app shell is rendered
    Then the departure button reads 550 to Kamppi, Now
    When the departure button is activated
    Then the vehicle map opens for 550 to Kamppi

  Scenario: The departure board sits in the main landmark
    Given a pressable departure for line 550 to Kamppi
    When the app shell is rendered
    Then the departures table sits inside main
    And the departures table is named Departures

  Scenario: The page opts into operating system text scale
    When the production document is read
    Then the document opts into text scale

  Scenario: A selected line filter reports that it is pressed
    Given a pressable departure for line 550 to Kamppi
    When the app shell is rendered with line 550 selected
    Then the 550 filter reads pressed
    And the Kamppi filter reads not pressed

  Scenario: A focused stop option keeps its outline
    When the production stylesheet is read
    Then a focused stop option keeps its outline

  Scenario: Map graphics have accessible names
    When a vehicle span map places the Kamppi stop
    Then the route graphic is named Route to Kamppi
    And the stop marker is an image named Kamppi
    And the vehicle marker is hidden from assistive technology
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a pressable departure for line 550 to Kamppi$/,
        run: ({ world }) => {
          const store = createAppStore();
          store.applyDeparturesResponse(pressableDepartures());
          world.store = store;
        },
      },
      {
        pattern: /^When the app shell is rendered$/,
        run: ({ world }) => {
          renderShell(world);
        },
      },
      {
        pattern: /^When the app shell is rendered with line 550 selected$/,
        run: ({ world }) => {
          world.store?.setLineAndDestinationFilters(["550"], []);
          renderShell(world);
        },
      },
      {
        pattern: /^Then the departure button reads 550 to Kamppi, Now$/,
        run: ({ assert, world }) => {
          const button = departureButton(world.root);
          assert.equal(button?.getAttribute("aria-label"), "550 to Kamppi, Now");
          assert.equal(button?.querySelector("time")?.textContent, "Now");
        },
      },
      {
        pattern: /^When the departure button is activated$/,
        run: ({ world }) => {
          const button = departureButton(world.root);
          if (!button) {
            throw new Error("Expected the departure button");
          }
          button.click();
        },
      },
      {
        pattern: /^Then the vehicle map opens for 550 to Kamppi$/,
        run: ({ assert, world }) => {
          assert.equal(world.root?.querySelector("[aria-label='550 to Kamppi']") instanceof HTMLElement, true);
        },
      },
      {
        pattern: /^Then the departures table sits inside main$/,
        run: ({ assert, world }) => {
          const table = world.root?.querySelector("table");
          assert.equal(table?.closest("main") instanceof HTMLElement, true);
        },
      },
      {
        pattern: /^Then the departures table is named Departures$/,
        run: ({ assert, world }) => {
          assert.equal(world.root?.querySelector("table caption")?.textContent, "Departures");
        },
      },
      {
        pattern: /^When the production document is read$/,
        run: ({ world }) => {
          const html = fs.readFileSync(path.join(webRoot, "index.html"), "utf8");
          const parsed = new DOMParser().parseFromString(html, "text/html");
          world.head = parsed.head;
        },
      },
      {
        pattern: /^Then the document opts into text scale$/,
        run: ({ assert, world }) => {
          const meta = world.head?.querySelector("meta[name='text-scale']");
          assert.equal(meta?.getAttribute("content"), "scale");
        },
      },
      {
        pattern: /^Then the 550 filter reads pressed$/,
        run: ({ assert, world }) => {
          assert.equal(buttonText(world.root, "550 (1)")?.getAttribute("aria-pressed"), "true");
        },
      },
      {
        pattern: /^Then the Kamppi filter reads not pressed$/,
        run: ({ assert, world }) => {
          assert.equal(buttonText(world.root, "Kamppi (1)")?.getAttribute("aria-pressed"), "false");
        },
      },
      {
        pattern: /^When the production stylesheet is read$/,
        run: ({ world }) => {
          world.css = fs.readFileSync(path.join(webRoot, "src/client/styles/main.css"), "utf8");
        },
      },
      {
        pattern: /^Then a focused stop option keeps its outline$/,
        run: ({ assert, world }) => {
          assert.equal(focusRuleRemovesOutline(world.css || "", ".stop-selector__option:focus-visible"), false);
        },
      },
      {
        pattern: /^When a vehicle span map places the Kamppi stop$/,
        run: ({ world }) => {
          const documentRef = document.implementation.createHTMLDocument("map");
          const map = createVehicleSpanMap({
            destination: "Kamppi",
            documentRef,
            line: "550",
            onClose() {
              return undefined;
            },
          });
          documentRef.body.append(map.element);
          map.apply({ stop: { lat: 60.18, lon: 24.95 }, type: "place" });
          world.map = map.element;
        },
      },
      {
        pattern: /^Then the route graphic is named Route to Kamppi$/,
        run: ({ assert, world }) => {
          const route = world.map?.querySelector("svg");
          assert.equal(route?.getAttribute("role"), "img");
          assert.equal(route?.getAttribute("aria-label"), "Route to Kamppi");
        },
      },
      {
        pattern: /^Then the stop marker is an image named Kamppi$/,
        run: ({ assert, world }) => {
          const marker = world.map?.querySelector("[data-stop-marker]");
          assert.equal(marker?.getAttribute("role"), "img");
          assert.equal(marker?.getAttribute("aria-label"), "Kamppi");
        },
      },
      {
        pattern: /^Then the vehicle marker is hidden from assistive technology$/,
        run: ({ assert, world }) => {
          assert.equal(world.map?.querySelector("[data-vehicle-marker]")?.getAttribute("aria-hidden"), "true");
        },
      },
    ],
  }
);
