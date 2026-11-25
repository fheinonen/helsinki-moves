import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  closestRedGreenDistance,
  contrastOnDarkBoard,
  GLANCEABLE_COLOR_VISION_DISTANCE,
  parseCssRgb,
  READABLE_BOARD_CONTRAST,
  RED_GREEN_PROFILES,
  simulateColorVision,
  worstRedGreenDistance,
} from "@tests/helpers/color-vision";
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
  closePair?: [string, string];
  colorChoiceMs?: number;
  colors: Map<string, string>;
  container?: HTMLElement;
  store?: AppStore;
  trips: Departure[];
}

const BASE_TIME_MS = Date.parse("2026-03-07T10:00:00.000Z");
const COLOR_PATTERN = /^rgb\(\d+, \d+, \d+\)$/;
const DESTINATION_SCHEME = [
  "#ffdf00",
  "#9e88ff",
  "#a29989",
  "#fdfffd",
  "#d2ccff",
  "#c69920",
  "#c8deac",
  "#9499a7",
  "#becccf",
  "#ecd176",
  "#d2f0fe",
  "#b08fcb",
  "#b7abff",
  "#9fb9cd",
  "#e0fede",
  "#cbcbbc",
  "#e9ffb0",
  "#b8a9aa",
  "#ffff75",
  "#a9ba92",
  "#fc886e",
  "#dbbb0e",
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
  return worstRedGreenDistance(parseCssRgb(first), parseCssRgb(second));
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
    Given a board with 22 different destinations
    When the departure board is shown
    Then each destination uses its own color
    And the destination texts stay in departure order

  Scenario: Destination colors stay distinct for red-green color vision
    Given a board with 22 different destinations
    When the departure board is shown
    Then each destination color stays distinct across red-green color vision
    And each destination color stays readable on the dark board

  Scenario: Neighboring departures on a long board stay apart across red-green color vision
    Given a board with 16 different destinations
    When the departure board is shown
    Then each departure stays at least 29 apart across red-green color vision from the row above and the row below
    And each destination color stays in the existing scheme

  Scenario: Neighboring departures across all 22 destinations stay apart across red-green color vision
    Given a board with 22 different destinations
    When the departure board is shown
    Then each departure stays at least 29 apart across red-green color vision from the row above and the row below
    And each destination color stays in the existing scheme

  Scenario: A fresh 12-destination board spreads colors across the scheme without clustering
    Given a board with 12 different destinations
    When the departure board is shown
    Then each destination uses its own color
    And each departure stays at least 29 apart across red-green color vision from the row above and the row below
    And destinations two rows apart stay at least 16 apart across red-green color vision
    And at most 8 pairs of destinations on the board sit closer than 14 across red-green color vision

  Scenario: Mixed departures beside each other stay apart across the whole board
    Given a board with trips to Eira, Kamppi, Ruoholahti, Rautatientori, Lauttasaari, Kamppi, Herttoniemi, Ruskeasuo, and Toolo
    When the departure board is shown
    Then each departure stays at least 29 apart across red-green color vision from the row above and the row below
    And every pair of different destinations on the board stays at least 15 apart across red-green color vision

  Scenario: The departure board a rider glances at keeps neighbors apart across red-green color vision
    Given a board with trips to Kamppi, Ruoholahti, Eira, Rautatientori, Lauttasaari, Kamppi, Herttoniemi, Ruskeasuo, and Toolo
    When the departure board is shown
    Then each departure stays at least 29 apart across red-green color vision from the row above and the row below
    And destinations two rows apart stay at least 16 apart across red-green color vision
    And every pair of different destinations on the board stays at least 15 apart across red-green color vision

  Scenario: A repeated destination stays apart from the rows above and below it
    Given a board with 22 different destinations followed by the second destination
    When the departure board is shown
    Then the repeated destination keeps the color of its first row
    And each departure stays at least 27 apart across red-green color vision from the row above and the row below

  Scenario: Two new destinations after every color is used stay apart from the rows beside them
    Given a board with 22 different destinations
    When the departure board is shown
    When two new destinations are shown between Destination 7 and Destination 14
    Then each departure stays at least 29 apart across red-green color vision from the row above and the row below
    And each destination color stays in the existing scheme

  Scenario: A new destination between close colors stays apart from both rows
    Given a board with 22 different destinations
    When the departure board is shown
    When a new destination is shown between the two closest-colored destinations
    Then the new destination stays at least 32 apart across red-green color vision from the row above and the row below
    And each destination color stays in the existing scheme

  Scenario: Added departures stay apart from the rows already colored
    Given a board with trips to Eira and Kamppi
    When the departure board is shown
    Then the shown destination colors are remembered
    When Ruoholahti and Lauttasaari are added after those departures
    Then Eira and Kamppi keep their remembered colors
    And each departure stays at least 29 apart across red-green color vision from the row above and the row below

  Scenario: Coloring a long board finishes within single-digit milliseconds
    Given a board with 22 different destinations
    When destination colors are chosen for the board
    Then choosing the destination colors takes under 10 milliseconds

  Scenario: Coloring a repeated long board finishes within single-digit milliseconds
    Given a board with 22 different destinations followed by the second destination
    When destination colors are chosen for the board
    Then choosing the destination colors takes under 10 milliseconds

  Scenario: Coloring a dense board of eight destinations finishes within single-digit milliseconds
    Given a busy board with 8 destinations that meet across many rows
    When destination colors are chosen for the board
    Then choosing the destination colors takes under 10 milliseconds

  Scenario: A board with more than 22 destinations uses the full scheme and stays fast
    Given a board with 26 different destinations
    When the departure board is shown
    Then all 22 scheme colors appear on the board
    And each departure stays at least 29 apart across red-green color vision from the row above and the row below
    When destination colors are chosen for the board
    Then choosing the destination colors takes under 10 milliseconds

  Scenario: Later departures reordering earlier destinations keep them apart across red-green color vision
    Given a board with trips to Kamppi, Ruoholahti, Eira, Rautatientori, Lauttasaari, Kamppi, Herttoniemi, Ruskeasuo, and Toolo
    When the departure board is shown
    Then the shown destination colors are remembered
    When later departures append the same destinations in a different order
    Then each destination keeps its remembered color
    And each departure stays at least 15 apart across red-green color vision from the row above and the row below

  Scenario: Loading eight more destinations after the glance board keeps all neighbors apart
    Given a board with trips to Kamppi, Ruoholahti, Eira, Rautatientori, Lauttasaari, Kamppi, Herttoniemi, Ruskeasuo, and Toolo
    When the departure board is shown
    When 8 new later departures are appended to the board
    Then each destination uses its own color
    And each departure stays at least 29 apart across red-green color vision from the row above and the row below

  Scenario: Adding four more interwoven destinations onto a busy eight-destination board keeps every destination unique
    Given a busy board with 8 destinations that meet across many rows
    When the departure board is shown
    When 4 new destinations are interwoven with those departures
    Then each destination uses its own color

  Scenario: Loading more departures in stages keeps later neighbors apart even near the palette limit
    Given a board with 20 different destinations
    When the departure board is shown
    When 2 new later departures are appended to the board
    Then each departure stays at least 29 apart across red-green color vision from the row above and the row below
    And each destination color stays in the existing scheme

  Scenario: Loading further destinations after all colors are used spreads reused colors apart
    Given a board with 22 different destinations
    When the departure board is shown
    When 4 new later departures are appended to the board
    Then the 4 appended departures use 4 different colors
    And each departure stays at least 29 apart across red-green color vision from the row above and the row below
    And each destination color stays in the existing scheme

  Scenario: Switching through Rail, Tram, Metro, and Bus keeps every Bus destination uniquely colored
    Given a board with 6 Rail destinations
    When the departure board is shown
    When the rider switches through 8 Tram destinations, 4 Metro destinations, and 10 Bus destinations
    Then each destination uses its own color
    And each departure stays at least 29 apart across red-green color vision from the row above and the row below

  Scenario: Switching from a 20-destination stop to a 10-destination stop keeps every destination uniquely colored
    Given a board with 20 different destinations
    When the departure board is shown
    When the board switches to 4 remembered destinations and 6 new destinations
    Then each destination uses its own color
    And each departure stays at least 29 apart across red-green color vision from the row above and the row below

  Scenario: Destinations that reused an off-board color on separate stops separate again when they meet on one board
    Given a board with 22 different destinations
    When the departure board is shown
    When the board visits a separate 10-destination stop and then combines destinations from both stops
    Then each destination uses its own color
    And each departure stays at least 15 apart across red-green color vision from the row above and the row below
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
        pattern: /^Given a board with (\d+) different destinations followed by the second destination$/,
        run: ({ args, world }) => {
          const count = Number(args[0]);
          const destinations = Array.from({ length: count }, (_, index) => `Destination ${index + 1}`);
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
        pattern: /^When a new destination is shown between the two closest-colored destinations$/,
        run: ({ world }) => {
          const rows = readRows(world);
          let bestPair: [string, string] = [rows[0].destination, rows[1].destination];
          let bestDist = Infinity;
          for (let left = 0; left < rows.length; left += 1) {
            for (let right = left + 1; right < rows.length; right += 1) {
              const distance = neighborDistance(rows[left].color, rows[right].color);
              if (distance < bestDist) {
                bestDist = distance;
                bestPair = [rows[left].destination, rows[right].destination];
              }
            }
          }
          world.closePair = bestPair;
          replaceTrips(world, createTrips([bestPair[0], "Kallio", bestPair[1]], ["7", "17", "14"]));
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
        pattern: /^Then each destination color stays distinct across red-green color vision$/,
        run: ({ assert, world }) => {
          const colors = [...colorsByDestination(readRows(world)).values()];
          assert.equal(colors.length, DESTINATION_SCHEME.length);
          const closest = closestRedGreenDistance(colors);
          assert.equal(
            closest.distance >= GLANCEABLE_COLOR_VISION_DISTANCE,
            true,
            `Closest ${closest.profile} pair differs by ${closest.distance.toFixed(2)}`
          );
        },
      },
      {
        pattern: /^Then each destination color stays readable on the dark board$/,
        run: ({ assert, world }) => {
          for (const color of colorsByDestination(readRows(world)).values()) {
            const rgb = parseCssRgb(color);
            for (const profile of RED_GREEN_PROFILES) {
              const simulated = contrastOnDarkBoard(simulateColorVision(rgb, profile));
              assert.equal(
                simulated >= READABLE_BOARD_CONTRAST,
                true,
                `${color} ${profile} contrast ${simulated.toFixed(2)}`
              );
            }
          }
        },
      },
      {
        pattern:
          /^Then each departure stays at least (\d+) apart across red-green color vision from the row above and the row below$/,
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
          /^Then the new destination stays at least (\d+) apart across red-green color vision from the row above and the row below$/,
        run: ({ args, assert, world }) => {
          const minimum = Number(args[0]);
          const rows = readRows(world);
          const index = rows.findIndex((row) => row.destination === "Kallio");
          const row = rows[index];
          const above = rows[index - 1];
          const below = rows[index + 1];
          assert.equal(above?.destination, world.closePair?.[0]);
          assert.equal(below?.destination, world.closePair?.[1]);
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
        pattern: /^Then all 22 scheme colors appear on the board$/,
        run: ({ assert, world }) => {
          const seen = new Set(readRows(world).map((row) => row.color));
          const allowed = schemeColors();
          for (const color of seen) {
            assert.equal(allowed.has(color), true, `Unexpected color ${color}`);
          }
          assert.equal(seen.size, DESTINATION_SCHEME.length);
        },
      },
      {
        pattern: /^When later departures append the same destinations in a different order$/,
        run: ({ world }) => {
          const reordered = [
            "Toolo",
            "Herttoniemi",
            "Ruskeasuo",
            "Kamppi",
            "Eira",
            "Lauttasaari",
            "Ruoholahti",
            "Rautatientori",
          ];
          const suffix = createTrips(
            reordered,
            reordered.map((_, index) => `L${index + 1}`),
            world.trips.length * 60_000
          );
          const combined = world.trips.concat(suffix);
          world.trips = combined;
          replaceTrips(world, combined);
        },
      },
      {
        pattern: /^When (\d+) new later departures are appended to the board$/,
        run: ({ args, world }) => {
          const count = Number(args[0]);
          const added = Array.from({ length: count }, (_, index) => `Later ${index + 1}`);
          const suffix = createTrips(
            added,
            added.map((_, index) => `M${index + 1}`),
            world.trips.length * 60_000
          );
          const combined = world.trips.concat(suffix);
          world.trips = combined;
          replaceTrips(world, combined);
        },
      },
      {
        pattern: /^Then the (\d+) appended departures use (\d+) different colors$/,
        run: ({ args, assert, world }) => {
          const tailCount = Number(args[0]);
          const expectedColors = Number(args[1]);
          const tail = readRows(world).slice(-tailCount);
          assert.equal(tail.length, tailCount);
          assert.equal(new Set(tail.map((row) => row.color)).size, expectedColors);
        },
      },
      {
        pattern:
          /^Then destinations two rows apart stay at least (\d+) apart across red-green color vision$/,
        run: ({ args, assert, world }) => {
          const minimum = Number(args[0]);
          const rows = readRows(world);
          assert.equal(rows.length > 2, true);
          for (let index = 0; index + 2 < rows.length; index += 1) {
            const first = rows[index];
            const second = rows[index + 2];
            if (first.destination === second.destination) {
              continue;
            }
            const distance = neighborDistance(first.color, second.color);
            assert.equal(
              distance >= minimum,
              true,
              `${first.destination} and ${second.destination} (2 rows apart) are ${distance.toFixed(2)} apart`
            );
          }
        },
      },
      {
        pattern:
          /^Then at most (\d+) pairs of destinations on the board sit closer than (\d+) across red-green color vision$/,
        run: ({ args, assert, world }) => {
          const maxPairs = Number(args[0]);
          const cutoff = Number(args[1]);
          const colors = [...colorsByDestination(readRows(world)).values()];
          let closePairs = 0;
          for (let left = 0; left < colors.length; left += 1) {
            for (let right = left + 1; right < colors.length; right += 1) {
              if (neighborDistance(colors[left], colors[right]) < cutoff) {
                closePairs += 1;
              }
            }
          }
          assert.equal(
            closePairs <= maxPairs,
            true,
            `Found ${closePairs} destination pairs closer than ${cutoff} (max ${maxPairs})`
          );
        },
      },
      {
        pattern:
          /^Then every pair of different destinations on the board stays at least (\d+) apart across red-green color vision$/,
        run: ({ args, assert, world }) => {
          const minimum = Number(args[0]);
          const colors = [...colorsByDestination(readRows(world)).values()];
          const closest = closestRedGreenDistance(colors);
          assert.equal(
            closest.distance >= minimum,
            true,
            `Closest ${closest.profile} pair on board differs by ${closest.distance.toFixed(2)}`
          );
        },
      },
      {
        pattern: /^When 4 new destinations are interwoven with those departures$/,
        run: ({ world }) => {
          const interwoven = [
            "Later 1",
            "Destination 1",
            "Later 2",
            "Destination 2",
            "Later 3",
            "Destination 3",
            "Later 4",
            "Destination 4",
            "Later 1",
            "Later 3",
            "Later 2",
            "Later 4",
          ];
          const suffix = createTrips(
            interwoven,
            interwoven.map((_, index) => `W${index + 1}`),
            world.trips.length * 60_000
          );
          const combined = world.trips.concat(suffix);
          world.trips = combined;
          replaceTrips(world, combined);
        },
      },
      {
        pattern: /^Given a board with 6 Rail destinations$/,
        run: ({ world }) => {
          const rail = ["Helsinki", "Lentoasema", "Tikkurila", "Kerava", "Kirkkonummi", "Leppävaara"];
          world.trips = createTrips(rail, ["I", "P", "K", "K", "U", "A"]);
        },
      },
      {
        pattern: /^When the rider switches through 8 Tram destinations, 4 Metro destinations, and 10 Bus destinations$/,
        run: ({ world }) => {
          const tram = [
            "Kamppi",
            "Länsiterminaali",
            "Eira",
            "Pikku Huopalahti",
            "Arabia",
            "Munkkiniemi",
            "Töölö",
            "Olympiaterminaali",
          ];
          const metro = ["Matinkylä", "Kivenlahti", "Vuosaari", "Mellunmäki"];
          const bus = [
            "Herttoniemi",
            "Itäkeskus",
            "Malmi",
            "Oulunkylä",
            "Maunula",
            "Haaga",
            "Pitäjänmäki",
            "Konala",
            "Kannelmäki",
            "Myyrmäki",
          ];
          replaceTrips(world, createTrips(tram, tram.map((_, i) => `T${i + 1}`)));
          replaceTrips(world, createTrips(metro, ["M1", "M1", "M1", "M2"]));
          const busTrips = createTrips(bus, bus.map((_, i) => `B${i + 1}`));
          world.trips = busTrips;
          replaceTrips(world, busTrips);
        },
      },
      {
        pattern: /^When the board switches to 4 remembered destinations and 6 new destinations$/,
        run: ({ world }) => {
          const mixed = [
            "Destination 1",
            "Destination 2",
            "Destination 3",
            "Destination 4",
            "StopB 1",
            "StopB 2",
            "StopB 3",
            "StopB 4",
            "StopB 5",
            "StopB 6",
          ];
          const nextTrips = createTrips(mixed, mixed.map((_, i) => `S${i + 1}`));
          world.trips = nextTrips;
          replaceTrips(world, nextTrips);
        },
      },
      {
        pattern: /^When the board visits a separate 10-destination stop and then combines destinations from both stops$/,
        run: ({ world }) => {
          const stopB = Array.from({ length: 10 }, (_, index) => `OtherStop ${index + 1}`);
          replaceTrips(world, createTrips(stopB, stopB.map((_, i) => `O${i + 1}`)));
          const stopBRows = readRows(world);
          const sharedDest = stopBRows[0].destination;
          const sharedColor = stopBRows[0].color;
          // Find a destination from the original 22-destination board that had the same color
          const originalDestinations = Array.from({ length: 22 }, (_, i) => `Destination ${i + 1}`);
          replaceTrips(world, createTrips(originalDestinations, originalDestinations));
          const collidingOriginal =
            readRows(world).find((row) => row.color === sharedColor)?.destination || "Destination 1";
          const combined = [
            collidingOriginal,
            sharedDest,
            "Destination 2",
            "OtherStop 2",
            "Destination 3",
            "OtherStop 3",
          ];
          const combinedTrips = createTrips(combined, combined.map((_, i) => `C${i + 1}`));
          world.trips = combinedTrips;
          replaceTrips(world, combinedTrips);
        },
      },
    ],
  }
);
