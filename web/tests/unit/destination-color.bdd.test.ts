import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  closestProtanopiaDistance,
  contrastOnDarkBoard,
  GLANCEABLE_PROTANOPIA_DISTANCE,
  parseCssRgb,
  protanopiaDistance,
  READABLE_BOARD_CONTRAST,
  simulateProtanopia,
} from "@tests/helpers/protanopia";
import { createAppStore, type AppStore } from "@client/app/app-store";
import { renderAppShell } from "@client/app/app-shell";
import { createAppController } from "@client/app/app-controller";
import { createDestinationColorBook } from "@shared/domain/destination-color";
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
  colorChoiceMs?: number;
  colors: Map<string, string>;
  container?: HTMLElement;
  store?: AppStore;
  trips: Departure[];
}

const BASE_TIME_MS = Date.parse("2026-03-07T10:00:00.000Z");
const COLOR_PATTERN = /^rgb\(\d+, \d+, \d+\)$/;
const DESTINATION_SCHEME = [
  "#ffff22",
  "#a283ff",
  "#cb9484",
  "#b5ffe4",
  "#d4d6ff",
  "#7ca51b",
  "#feffb5",
  "#adcac7",
  "#a4959c",
  "#e5c7ac",
  "#a5ca00",
  "#dd9f6a",
  "#b3a8c2",
  "#f7e678",
  "#65c1ff",
  "#c684cf",
] as const;
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
    async getLaterDepartures() {
      throw new Error("later departures are not part of this scenario");
    },
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

function schemeColors(): Set<string> {
  return new Set(DESTINATION_SCHEME.map((color) => paintedColor(color)));
}

function neighborDistance(first: string, second: string): number {
  return protanopiaDistance(parseCssRgb(first), parseCssRgb(second));
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

function measureColorChoiceMs(destinations: readonly string[]): number {
  createDestinationColorBook().colorsFor(destinations);
  const samples: number[] = [];
  for (let run = 0; run < 3; run += 1) {
    const book = createDestinationColorBook();
    const start = performance.now();
    book.colorsFor(destinations);
    samples.push(performance.now() - start);
  }
  samples.sort((left, right) => left - right);
  return samples[1];
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

  Scenario: Neighboring departures on a long board stay apart under protanopia
    Given a board with 16 different destinations
    When the departure board is shown
    Then each departure stays at least 31 apart under protanopia from the row above and the row below
    And each destination color stays in the existing scheme

  Scenario: Mixed departures beside each other stay apart under protanopia
    Given a board with trips to Eira, Kamppi, Ruoholahti, Rautatientori, Lauttasaari, Kamppi, Herttoniemi, Ruskeasuo, and Toolo
    When the departure board is shown
    Then each departure stays at least 52 apart under protanopia from the row above and the row below

  Scenario: The departure board a rider glances at keeps neighbors apart under protanopia
    Given a board with trips to Kamppi, Ruoholahti, Eira, Rautatientori, Lauttasaari, Kamppi, Herttoniemi, Ruskeasuo, and Toolo
    When the departure board is shown
    Then each departure stays at least 32 apart under protanopia from the row above and the row below

  Scenario: A repeated destination stays apart from the rows above and below it
    Given a board with 16 different destinations followed by the second destination
    When the departure board is shown
    Then the repeated destination keeps the color of its first row
    And each departure stays at least 29 apart under protanopia from the row above and the row below

  Scenario: Two new destinations after every color is used stay apart from the rows beside them
    Given a board with 16 different destinations
    When the departure board is shown
    When two new destinations are shown between Destination 7 and Destination 14
    Then each departure stays at least 29 apart under protanopia from the row above and the row below
    And each destination color stays in the existing scheme

  Scenario: A new destination between close colors stays apart from both rows
    Given a board with 16 different destinations
    When the departure board is shown
    When a new destination is shown between Destination 7 and Destination 14
    Then the new destination stays at least 32 apart under protanopia from the row above and the row below
    And each destination color stays in the existing scheme

  Scenario: Added departures stay apart from the rows already colored
    Given a board with trips to Eira and Kamppi
    When the departure board is shown
    Then the shown destination colors are remembered
    When Ruoholahti and Lauttasaari are added after those departures
    Then Eira and Kamppi keep their remembered colors
    And each departure stays at least 29 apart under protanopia from the row above and the row below

  Scenario: Coloring a long board finishes within single-digit milliseconds
    Given a board with 16 different destinations
    When destination colors are chosen for the board
    Then choosing the destination colors takes under 10 milliseconds

  Scenario: Coloring a repeated long board finishes within single-digit milliseconds
    Given a board with 16 different destinations followed by the second destination
    When destination colors are chosen for the board
    Then choosing the destination colors takes under 10 milliseconds

  Scenario: Coloring a dense board of eight destinations finishes within single-digit milliseconds
    Given a busy board with 8 destinations that meet across many rows
    When destination colors are chosen for the board
    Then choosing the destination colors takes under 10 milliseconds

  Scenario: A board with more than 16 destinations uses the full scheme and stays fast
    Given a board with 20 different destinations
    When the departure board is shown
    Then all 16 scheme colors appear on the board
    And each departure stays at least 29 apart under protanopia from the row above and the row below
    When destination colors are chosen for the board
    Then choosing the destination colors takes under 10 milliseconds
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
        pattern: /^Given a board with (\d+) different destinations$/,
        run: ({ args, world }) => {
          const count = Number(args[0]);
          const destinations = Array.from({ length: count }, (_, index) => `Destination ${index + 1}`);
          world.trips = createTrips(destinations, destinations);
        },
      },
      {
        pattern: /^Given a board with 16 different destinations followed by the second destination$/,
        run: ({ world }) => {
          const destinations = Array.from({ length: 16 }, (_, index) => `Destination ${index + 1}`);
          destinations.push("Destination 2");
          world.trips = createTrips(destinations, destinations);
        },
      },
      {
        pattern: /^Given a busy board with 8 destinations that meet across many rows$/,
        run: ({ world }) => {
          const order = [0, 1, 2, 3, 4, 5, 6, 7, 0, 7, 3, 7, 6, 1, 2, 5];
          const destinations = order.map((index) => `Destination ${index + 1}`);
          world.trips = createTrips(destinations, destinations);
        },
      },
      {
        pattern: /^Given a board with trips to Eira and Kamppi$/,
        run: ({ world }) => {
          world.trips = createTrips(["Eira", "Kamppi"], ["18", "550"]);
        },
      },
      {
        pattern:
          /^Given a board with trips to Kamppi, Ruoholahti, Eira, Rautatientori, Lauttasaari, Kamppi, Herttoniemi, Ruskeasuo, and Toolo$/,
        run: ({ world }) => {
          world.trips = createTrips(
            ["Kamppi", "Ruoholahti", "Eira", "Rautatientori", "Lauttasaari", "Kamppi", "Herttoniemi", "Ruskeasuo", "Toolo"],
            ["550", "560", "18", "65A", "14", "14", "21", "63", "8"]
          );
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
        pattern: /^When two new destinations are shown between Destination 7 and Destination 14$/,
        run: ({ world }) => {
          replaceTrips(
            world,
            createTrips(["Destination 7", "Kallio", "Pasila", "Destination 14"], ["7", "17", "18", "14"])
          );
        },
      },
      {
        pattern: /^When a new destination is shown between Destination 7 and Destination 14$/,
        run: ({ world }) => {
          replaceTrips(world, createTrips(["Destination 7", "Kallio", "Destination 14"], ["7", "17", "14"]));
        },
      },
      {
        pattern: /^When Ruoholahti and Lauttasaari are added after those departures$/,
        run: ({ world }) => {
          const destinations = world.trips.map((trip) => trip.destination).concat("Ruoholahti", "Lauttasaari");
          replaceTrips(
            world,
            createTrips(
              destinations,
              destinations.map((_, index) => String(index + 1))
            )
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
        pattern:
          /^Then each departure stays at least (\d+) apart under protanopia from the row above and the row below$/,
        run: ({ args, assert, world }) => {
          const minimum = Number(args[0]);
          const rows = readRows(world);
          assert.equal(rows.length > 1, true);
          rows.forEach((row, index) => {
            const above = rows[index - 1];
            const below = rows[index + 1];
            if (above && above.destination !== row.destination) {
              const distance = neighborDistance(above.color, row.color);
              assert.equal(
                distance >= minimum,
                true,
                `${row.destination} is ${distance.toFixed(2)} from ${above.destination} above`
              );
            }
            if (below && below.destination !== row.destination) {
              const distance = neighborDistance(row.color, below.color);
              assert.equal(
                distance >= minimum,
                true,
                `${row.destination} is ${distance.toFixed(2)} from ${below.destination} below`
              );
            }
          });
        },
      },
      {
        pattern: /^Then each destination color stays in the existing scheme$/,
        run: ({ assert, world }) => {
          const allowed = schemeColors();
          for (const row of readRows(world)) {
            assert.equal(allowed.has(row.color), true, `${row.destination} uses ${row.color}`);
          }
        },
      },
      {
        pattern: /^Then the repeated destination keeps the color of its first row$/,
        run: ({ assert, world }) => {
          const rows = readRows(world);
          const first = rows.find((row) => row.destination === "Destination 2");
          const last = rows[rows.length - 1];
          assert.equal(first?.destination, "Destination 2");
          assert.equal(last?.destination, "Destination 2");
          assert.equal(last?.color, first?.color);
          assert.equal(rows.filter((row) => row.destination === "Destination 2").length, 2);
        },
      },
      {
        pattern:
          /^Then the new destination stays at least (\d+) apart under protanopia from the row above and the row below$/,
        run: ({ args, assert, world }) => {
          const minimum = Number(args[0]);
          const rows = readRows(world);
          const index = rows.findIndex((row) => row.destination === "Kallio");
          const row = rows[index];
          const above = rows[index - 1];
          const below = rows[index + 1];
          assert.equal(above?.destination, "Destination 7");
          assert.equal(below?.destination, "Destination 14");
          const aboveDistance = neighborDistance(above.color, row.color);
          const belowDistance = neighborDistance(row.color, below.color);
          assert.equal(aboveDistance >= minimum, true, `Kallio is ${aboveDistance.toFixed(2)} from the row above`);
          assert.equal(belowDistance >= minimum, true, `Kallio is ${belowDistance.toFixed(2)} from the row below`);
        },
      },
      {
        pattern: /^Then Eira and Kamppi keep their remembered colors$/,
        run: ({ assert, world }) => {
          const rows = readRows(world);
          for (const name of ["Eira", "Kamppi"]) {
            const row = rows.find((candidate) => candidate.destination === name);
            assert.equal(row?.color, world.colors.get(name));
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
      {
        pattern: /^When destination colors are chosen for the board$/,
        run: ({ world }) => {
          const destinations = world.trips.map((trip) => trip.destination);
          world.colorChoiceMs = measureColorChoiceMs(destinations);
        },
      },
      {
        pattern: /^Then choosing the destination colors takes under (\d+) milliseconds$/,
        run: ({ args, assert, world }) => {
          const limitMs = Number(args[0]);
          const elapsed = world.colorChoiceMs ?? Infinity;
          assert.equal(elapsed < limitMs, true, `Choosing destination colors took ${elapsed.toFixed(2)}ms`);
        },
      },
      {
        pattern: /^Then all 16 scheme colors appear on the board$/,
        run: ({ assert, world }) => {
          const seen = new Set(readRows(world).map((row) => row.color));
          const allowed = schemeColors();
          for (const color of seen) {
            assert.equal(allowed.has(color), true, `Unexpected color ${color}`);
          }
          assert.equal(seen.size, DESTINATION_SCHEME.length);
        },
      },
    ],
  }
);
