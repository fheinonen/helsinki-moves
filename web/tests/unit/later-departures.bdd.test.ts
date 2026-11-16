import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createApp } from "@server/app";
import type { Departure } from "@shared/domain/departure";
import type { Mode } from "@shared/domain/mode";
import type { DepartureFetchWindow } from "@server/services/glance/glance-horizon";

const STOP_ID = "HSL:GLANCE";
const CURSOR_SEPARATOR = "\u001f";

interface Row {
  destination: string;
  line: string;
  minutes: number;
}

interface LaterPayload {
  departures?: Departure[];
  error?: string;
}

interface World {
  clockMs: number;
  mode: Mode;
  payload?: LaterPayload;
  rows: Row[];
  status?: number;
}

function rows(specs: Array<[string, number]>, destination = "Helsinki"): Row[] {
  return specs.map(([line, minutes]) => ({ destination, line, minutes }));
}

function departuresFor(world: World): Departure[] {
  return world.rows.map((row) => ({
    departureIso: new Date(world.clockMs + row.minutes * 60_000).toISOString(),
    destination: row.destination,
    line: row.line,
    stopId: STOP_ID,
  }));
}

function cursorFor(world: World, line: string, minutes: number): string {
  const row = world.rows.find((item) => item.line === line && item.minutes === minutes);
  if (!row) {
    throw new Error(`Expected ${line} at ${minutes} minutes`);
  }
  const departureMs = world.clockMs + row.minutes * 60_000;
  return [String(departureMs), row.line, row.destination, STOP_ID, ""].join(CURSOR_SEPARATOR);
}

function insideFetchWindow(departure: Departure, fetchWindow: DepartureFetchWindow): boolean {
  const timeMs = Date.parse(departure.departureIso);
  const startMs = fetchWindow.startTimeUnixSeconds * 1000;
  const endMs = startMs + fetchWindow.timeRangeSeconds * 1000;
  return timeMs >= startMs && timeMs < endMs;
}

function laterText(world: World): string {
  const departures = world.payload?.departures;
  if (!departures) {
    return "";
  }
  return departures
    .map((departure) => {
      const minutes = Math.round((Date.parse(departure.departureIso) - world.clockMs) / 60_000);
      return `${departure.line} ${minutes}`;
    })
    .join(", ");
}

async function requestLater(world: World, after: string): Promise<void> {
  const app = createApp({
    digitransitService: {
      async getDeparturesForStopIds(_stopIds, options) {
        const departures = departuresFor(world).filter((departure) =>
          insideFetchWindow(departure, options.fetchWindow)
        );
        return new Map([[STOP_ID, departures]]);
      },
      async getNearbyStops() {
        return [
          {
            distance: 40,
            stop: {
              code: "1",
              gtfsId: STOP_ID,
              name: "Pasila",
              vehicleMode: "RAIL",
            },
          },
        ];
      },
    },
    now: () => world.clockMs,
  });
  const params = new URLSearchParams({
    lat: "60.17",
    lon: "24.94",
    mode: world.mode,
    stopId: STOP_ID,
    after,
  });
  const response = await app.request(`http://localhost/api/v1/departures?${params.toString()}`);
  world.status = response.status;
  world.payload = (await response.json()) as LaterPayload;
}

defineFeature<World>(
  test,
  `
Feature: Later departures

  Scenario: A second page after the glance tail is the hidden rail row
    Given the clock is 2026-03-07T10:00:00.000Z
    And a RAIL stop has lines A at 5, A at 10, A at 15, A at 20, and Z at 41 minutes
    When the departures route is asked for the page after A at 20
    Then the later board is Z 41

  Scenario: A departure past the glance horizon is on the next page
    Given the clock is 2026-03-07T10:00:00.000Z
    And a RAIL stop has lines A at 20 and A at 76 minutes
    When the departures route is asked for the page after A at 20
    Then the later board is A 76

  Scenario: A same-time departure with a later tie is on the next page
    Given the clock is 2026-03-07T10:00:00.000Z
    And a RAIL stop has lines A at 20 and Z at 20 minutes
    When the departures route is asked for the page after A at 20
    Then the later board is Z 20

  Scenario: A cursor that does not parse is rejected
    Given the clock is 2026-03-07T10:00:00.000Z
    And a RAIL stop has lines A at 20 minutes
    When the departures route is asked with after not-a-cursor
    Then the departures response status is 400
    And the departures error is invalid coordinates
  `,
  {
    createWorld: () => ({
      clockMs: Date.parse("2026-03-07T10:00:00.000Z"),
      mode: "RAIL",
      rows: [],
    }),
    stepDefinitions: [
      {
        pattern: /^Given the clock is 2026-03-07T10:00:00.000Z$/,
        run: ({ world }) => {
          world.clockMs = Date.parse("2026-03-07T10:00:00.000Z");
          world.mode = "RAIL";
        },
      },
      {
        pattern: /^Given a RAIL stop has lines A at 5, A at 10, A at 15, A at 20, and Z at 41 minutes$/,
        run: ({ world }) => {
          world.rows = rows([
            ["A", 5],
            ["A", 10],
            ["A", 15],
            ["A", 20],
            ["Z", 41],
          ]);
        },
      },
      {
        pattern: /^Given a RAIL stop has lines A at 20 and A at 76 minutes$/,
        run: ({ world }) => {
          world.rows = rows([
            ["A", 20],
            ["A", 76],
          ]);
        },
      },
      {
        pattern: /^Given a RAIL stop has lines A at 20 and Z at 20 minutes$/,
        run: ({ world }) => {
          world.rows = rows([
            ["A", 20],
            ["Z", 20],
          ]);
        },
      },
      {
        pattern: /^Given a RAIL stop has lines A at 20 minutes$/,
        run: ({ world }) => {
          world.rows = rows([["A", 20]]);
        },
      },
      {
        pattern: /^When the departures route is asked for the page after A at 20$/,
        run: async ({ world }) => {
          await requestLater(world, cursorFor(world, "A", 20));
        },
      },
      {
        pattern: /^When the departures route is asked with after not-a-cursor$/,
        run: async ({ world }) => {
          await requestLater(world, "not-a-cursor");
        },
      },
      {
        pattern: /^Then the later board is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(laterText(world), args[0], "later departures were not the next suffix");
        },
      },
      {
        pattern: /^Then the departures response status is 400$/,
        run: ({ assert, world }) => {
          assert.equal(world.status, 400, "a cursor that does not parse was accepted");
        },
      },
      {
        pattern: /^Then the departures error is invalid coordinates$/,
        run: ({ assert, world }) => {
          assert.equal(world.payload?.error, "invalid coordinates");
        },
      },
    ],
  }
);
