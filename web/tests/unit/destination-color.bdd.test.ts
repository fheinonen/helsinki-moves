import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  closestProtanopiaDistance,
  contrastOnDarkBoard,
  GLANCEABLE_PROTANOPIA_DISTANCE,
  parseCssRgb,
  READABLE_BOARD_CONTRAST,
  simulateProtanopia,
} from "@tests/helpers/protanopia";
import { createAppStore, type AppStore } from "@client/app/app-store";
import { renderAppShell } from "@client/app/app-shell";
import { createAppController } from "@client/app/app-controller";
import type { Departure } from "@shared/domain/departure";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";

interface DepartureRow {
  color: string;
  destination: string;
  mark: string;
}

interface World {
  cleanup?: () => void;
  colors: Map<string, string>;
  container?: HTMLElement;
  store?: AppStore;
  trips: Departure[];
}

const BASE_TIME_MS = Date.parse("2026-03-07T10:00:00.000Z");
const COLOR_PATTERN = /^rgb\(\d+, \d+, \d+\)$/;
const GLANCE_DESTINATIONS = [
  "Eira",
  "Kamppi",
  "Ruoholahti",
  "Rautatientori",
  "Lauttasaari",
  "Kamppi",
  "Herttoniemi",
  "Ruskeasuo",
  "Toolo",
];
const GLANCE_LINES = ["18", "550", "560", "65A", "14", "14", "21", "63", "8"];

function createTrips(destinations: string[], lines: string[], offsetMs = 0): Departure[] {
  return destinations.map((destination, index) => ({
    departureIso: new Date(BASE_TIME_MS + offsetMs + (index + 1) * 60_000).toISOString(),
    destination,
    line: lines[index] || String(index + 1),
  }));
}

function countValues(values: string[]): { count: number; value: string }[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].map(([value, count]) => ({ count, value }));
}

function boardResponse(departures: Departure[], catalog: Departure[]): DeparturesSuccessResponse {
  return {
    filterOptions: {
      destinations: countValues(catalog.map((trip) => trip.destination)),
      lines: countValues(catalog.map((trip) => trip.line)),
    },
    mode: "BUS",
    selectedStopId: "HSL:STOP_A",
    station: {
      departures,
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
    ],
  };
}

function showBoard(world: World, trips: Departure[]): void {
  const store = createAppStore();
  store.applyDeparturesResponse(boardResponse(trips, trips));
  const documentRef = document.implementation.createHTMLDocument("destination-color");
  documentRef.body.innerHTML = "<div id='root'></div>";
  const container = documentRef.querySelector<HTMLElement>("#root");
  if (!container) {
    throw new Error("Expected departure board");
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
    store,
  });
  world.cleanup = renderAppShell({
    controller,
    documentRef,
    root: container,
  });
  world.container = container;
  world.store = store;
  world.trips = trips;
}

function replaceTrips(world: World, departures: Departure[]): void {
  if (!world.store) {
    throw new Error("Expected departure board");
  }
  world.store.applyDeparturesResponse(boardResponse(departures, world.trips));
}

function paintedColor(value: string): string {
  const probe = document.createElement("span");
  probe.style.color = value;
  return probe.style.color;
}

function readRows(world: World): DepartureRow[] {
  if (!world.container) {
    throw new Error("Expected departure board");
  }
  return [...world.container.querySelectorAll(".departure-card")].map((card) => {
    const text = card.querySelector<HTMLElement>(".departure-card__destination-text");
    const mark = (card as HTMLElement).style.getPropertyValue("--destination-color").trim();
    return {
      color: text?.style.color || "",
      destination: text?.textContent || "",
      mark: paintedColor(mark),
    };
  });
}

function colorsByDestination(rows: DepartureRow[]): Map<string, string> {
  const colors = new Map<string, string>();
  for (const row of rows) {
    const known = colors.get(row.destination);
    if (known === undefined) {
      colors.set(row.destination, row.color);
      continue;
    }
    if (known !== row.color) {
      throw new Error(`Trips to ${row.destination} use different colors`);
    }
  }
  return colors;
}

defineFeature<World>(
  test,
  `
Feature: Destination color

  Scenario: Trips to one destination share a color
    Given a board with trips to Eira, Kamppi, Ruoholahti, Rautatientori, Lauttasaari, Kamppi, Herttoniemi, Ruskeasuo, and Toolo
    When the departure board is shown
    Then the two Kamppi trips share a destination color
    And each destination uses its own color
    And the destination texts stay in departure order

  Scenario: Destination color stays stable when the board refreshes and filters
    Given a board with trips to Eira, Kamppi, Ruoholahti, Rautatientori, Lauttasaari, Kamppi, Herttoniemi, Ruskeasuo, and Toolo
    When the departure board is shown
    Then the shown destination colors are remembered
    When the board refreshes with the same destinations
    Then each destination keeps its remembered color
    When a destination filter leaves only Kamppi
    Then the Kamppi trips keep their remembered color
    And every remaining destination text says Kamppi
    When a line filter leaves Lauttasaari and the later Kamppi trip
    Then those trips keep their remembered colors

  Scenario: The same destination keeps one color when spacing differs
    Given a board with a Kamppi trip and the same destination padded with a space
    When the departure board is shown
    Then the padded destination shares the Kamppi color
    And both destination texts stay visible

  Scenario: Different destinations on a long board do not share a color
    Given a board with 16 different destinations
    When the departure board is shown
    Then each destination uses its own color
    And the destination texts stay in departure order

  Scenario: Destination colors stay distinct for protanopia
    Given a board with 16 different destinations
    When the departure board is shown
    Then each destination color stays distinct under protanopia
    And each destination color stays readable on the dark board
  `,
  {
    createWorld: () => ({
      colors: new Map<string, string>(),
      trips: [],
    }),
    stepDefinitions: [
      {
        pattern:
          /^Given a board with trips to Eira, Kamppi, Ruoholahti, Rautatientori, Lauttasaari, Kamppi, Herttoniemi, Ruskeasuo, and Toolo$/,
        run: ({ world }) => {
          world.trips = createTrips(GLANCE_DESTINATIONS, GLANCE_LINES);
        },
      },
      {
        pattern: /^Given a board with a Kamppi trip and the same destination padded with a space$/,
        run: ({ world }) => {
          world.trips = createTrips(["Kamppi", "Kamppi "], ["550", "14"]);
        },
      },
      {
        pattern: /^Given a board with 16 different destinations$/,
        run: ({ world }) => {
          const destinations = Array.from({ length: 16 }, (_, index) => `Destination ${index + 1}`);
          world.trips = createTrips(destinations, destinations);
        },
      },
      {
        pattern: /^When the departure board is shown$/,
        run: ({ world }) => {
          showBoard(world, world.trips);
        },
      },
      {
        pattern: /^When the board refreshes with the same destinations$/,
        run: ({ world }) => {
          replaceTrips(
            world,
            world.trips.map((trip) => ({
              ...trip,
              departureIso: new Date(Date.parse(trip.departureIso) + 60_000).toISOString(),
            }))
          );
        },
      },
      {
        pattern: /^When a destination filter leaves only Kamppi$/,
        run: ({ world }) => {
          replaceTrips(
            world,
            world.trips.filter((trip) => trip.destination === "Kamppi")
          );
        },
      },
      {
        pattern: /^When a line filter leaves Lauttasaari and the later Kamppi trip$/,
        run: ({ world }) => {
          replaceTrips(
            world,
            world.trips.filter((trip) => trip.line === "14")
          );
        },
      },
      {
        pattern: /^Then the two Kamppi trips share a destination color$/,
        run: ({ assert, world }) => {
          const kamppi = readRows(world).filter((row) => row.destination === "Kamppi");
          assert.equal(kamppi.length, 2);
          assert.match(kamppi[0].color, COLOR_PATTERN);
          assert.equal(kamppi[0].color, kamppi[1].color);
        },
      },
      {
        pattern: /^Then each destination uses its own color$/,
        run: ({ assert, world }) => {
          const rows = readRows(world);
          const colors = colorsByDestination(rows);
          for (const row of rows) {
            assert.match(row.color, COLOR_PATTERN);
            assert.equal(row.mark, row.color);
          }
          assert.equal(new Set(colors.values()).size, colors.size);
        },
      },
      {
        pattern: /^Then the destination texts stay in departure order$/,
        run: ({ assert, world }) => {
          assert.equal(
            readRows(world)
              .map((row) => row.destination)
              .join("|"),
            world.trips.map((trip) => trip.destination).join("|")
          );
        },
      },
      {
        pattern: /^Then the shown destination colors are remembered$/,
        run: ({ assert, world }) => {
          const rows = readRows(world);
          for (const row of rows) {
            assert.match(row.color, COLOR_PATTERN);
            assert.equal(row.mark, row.color);
          }
          world.colors = colorsByDestination(rows);
        },
      },
      {
        pattern: /^Then each destination keeps its remembered color$/,
        run: ({ assert, world }) => {
          for (const row of readRows(world)) {
            assert.equal(row.color, world.colors.get(row.destination));
          }
        },
      },
      {
        pattern: /^Then the Kamppi trips keep their remembered color$/,
        run: ({ assert, world }) => {
          const kamppi = readRows(world).filter((row) => row.destination === "Kamppi");
          assert.equal(kamppi.length, 2);
          assert.equal(kamppi[0].color, world.colors.get("Kamppi"));
          assert.equal(kamppi[1].color, world.colors.get("Kamppi"));
        },
      },
      {
        pattern: /^Then every remaining destination text says Kamppi$/,
        run: ({ assert, world }) => {
          const rows = readRows(world);
          assert.equal(rows.length, 2);
          for (const row of rows) {
            assert.equal(row.destination, "Kamppi");
          }
        },
      },
      {
        pattern: /^Then those trips keep their remembered colors$/,
        run: ({ assert, world }) => {
          const rows = readRows(world);
          assert.equal(
            rows.map((row) => row.destination).join("|"),
            "Lauttasaari|Kamppi"
          );
          for (const row of rows) {
            assert.equal(row.color, world.colors.get(row.destination));
          }
        },
      },
      {
        pattern: /^Then the padded destination shares the Kamppi color$/,
        run: ({ assert, world }) => {
          const rows = readRows(world);
          assert.equal(rows.length, 2);
          assert.match(rows[0].color, COLOR_PATTERN);
          assert.equal(rows[0].color, rows[1].color);
        },
      },
      {
        pattern: /^Then each destination color stays distinct under protanopia$/,
        run: ({ assert, world }) => {
          const colors = [...colorsByDestination(readRows(world)).values()];
          assert.equal(colors.length, 16);
          const closest = closestProtanopiaDistance(colors);
          assert.equal(
            closest >= GLANCEABLE_PROTANOPIA_DISTANCE,
            true,
            `Closest protanopia pair differs by ${closest.toFixed(2)}`
          );
        },
      },
      {
        pattern: /^Then each destination color stays readable on the dark board$/,
        run: ({ assert, world }) => {
          for (const color of colorsByDestination(readRows(world)).values()) {
            const rgb = parseCssRgb(color);
            const painted = contrastOnDarkBoard(rgb);
            const simulated = contrastOnDarkBoard(simulateProtanopia(rgb));
            assert.equal(painted >= READABLE_BOARD_CONTRAST, true, `${color} contrast ${painted.toFixed(2)}`);
            assert.equal(
              simulated >= READABLE_BOARD_CONTRAST,
              true,
              `${color} protanopia contrast ${simulated.toFixed(2)}`
            );
          }
        },
      },
      {
        pattern: /^Then both destination texts stay visible$/,
        run: ({ assert, world }) => {
          const rows = readRows(world);
          assert.equal(rows[0]?.destination, "Kamppi");
          assert.equal(rows[1]?.destination, "Kamppi ");
        },
      },
    ],
  }
);
