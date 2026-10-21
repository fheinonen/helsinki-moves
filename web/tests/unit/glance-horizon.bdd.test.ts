import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createApp } from "@server/app";
import { createDigitransitService } from "@server/services/digitransit/client";
import { departureFetchWindow } from "@server/services/glance/glance-horizon";
import type { Departure } from "@shared/domain/departure";
import type { Mode } from "@shared/domain/mode";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";

const STOP_ID = "HSL:GLANCE";

interface Row {
  destination: string;
  line: string;
  minutes: number;
}

interface World {
  clockMs: number;
  mode: Mode;
  payload?: DeparturesSuccessResponse;
  queryText?: string;
  queryVariables?: Record<string, number | string>;
  rows: Row[];
  status?: number;
}

const BUSY_ROWS: Row[] = [
  { destination: "Helsinki", line: "I", minutes: 1 },
  { destination: "Helsinki", line: "I", minutes: 2 },
  { destination: "Helsinki", line: "I", minutes: 3 },
  { destination: "Helsinki", line: "P", minutes: 4 },
  { destination: "Helsinki", line: "I", minutes: 5 },
  { destination: "Helsinki", line: "L", minutes: 6 },
  { destination: "Helsinki", line: "I", minutes: 7 },
  { destination: "Helsinki", line: "A", minutes: 8 },
  { destination: "Helsinki", line: "I", minutes: 9 },
  { destination: "Helsinki", line: "I", minutes: 10 },
  { destination: "Helsinki", line: "I", minutes: 11 },
  { destination: "Helsinki", line: "I", minutes: 12 },
  { destination: "Helsinki", line: "U", minutes: 13 },
  { destination: "Helsinki", line: "I", minutes: 14 },
];

function rows(specs: Array<[string, number]>, destination = "Helsinki"): Row[] {
  return specs.map(([line, minutes]) => ({ destination, line, minutes }));
}

function upstreamMode(mode: Mode): string {
  if (mode === "METRO") {
    return "SUBWAY";
  }
  return mode;
}

function departuresFor(world: World): Departure[] {
  return world.rows.map((row) => ({
    departureIso: new Date(world.clockMs + row.minutes * 60_000).toISOString(),
    destination: row.destination,
    line: row.line,
    stopId: STOP_ID,
  }));
}

function boardText(world: World): string {
  const departures = world.payload?.station?.departures;
  if (!departures) {
    throw new Error("Expected a departure board");
  }
  return departures
    .map((departure) => {
      const minutes = Math.round(
        (new Date(departure.departureIso).getTime() - world.clockMs) / 60_000
      );
      return `${departure.line} ${minutes}`;
    })
    .join(", ");
}

async function loadBoard(world: World, search = ""): Promise<void> {
  const app = createApp({
    digitransitService: {
      async getDeparturesForStopIds() {
        return new Map([[STOP_ID, departuresFor(world)]]);
      },
      async getNearbyStops() {
        return [
          {
            distance: 40,
            stop: {
              code: "1",
              gtfsId: STOP_ID,
              name: "Pasila",
              vehicleMode: upstreamMode(world.mode),
            },
          },
        ];
      },
    },
    now: () => world.clockMs,
  });
  const response = await app.request(
    `http://localhost/api/v1/departures?lat=60.17&lon=24.94&mode=${world.mode}&stopId=${STOP_ID}${search}`
  );
  world.payload = (await response.json()) as DeparturesSuccessResponse;
}

async function askUpstream(world: World, mode: Mode): Promise<void> {
  const service = createDigitransitService({
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body || "{}")) as {
        query?: string;
        variables?: Record<string, number | string>;
      };
      world.queryText = body.query;
      world.queryVariables = body.variables;
      return new Response(
        JSON.stringify({ data: { s0: { stoptimesWithoutPatterns: [] } } }),
        { status: 200 }
      );
    },
    getApiKey: () => "test-key",
  });
  await service.getDeparturesForStopIds([STOP_ID], {
    fetchWindow: departureFetchWindow(mode, world.clockMs),
    mode,
  });
}

defineFeature<World>(
  test,
  `
Feature: Glance horizon

  Scenario: Rail departures stop at the forty minute horizon
    Given the clock is 2026-03-07T10:00:00.000Z
    And a RAIL stop has lines A at 5, A at 10, A at 15, A at 20, and Z at 41 minutes
    When the departures route loads that stop
    Then the board is A 5, A 10, A 15, A 20
    And the line filter still counts Z once

  Scenario: A quiet rail stop stretches fifteen minutes at a time
    Given the clock is 2026-03-07T10:00:00.000Z
    And a RAIL stop has lines A at 50, A at 50, A at 50, A at 54, and A at 60 minutes
    When the departures route loads that stop
    Then the board is A 50, A 50, A 50, A 54

  Scenario: A busy rail stop leads with one departure from each line
    Given the clock is 2026-03-07T10:00:00.000Z
    And a RAIL stop has the busy line mix
    When the departures route loads that stop
    Then the board is I 1, P 4, L 6, A 8, U 13, I 2, I 3, I 5, I 7, I 9

  Scenario: Rail departures never pass seventy five minutes
    Given the clock is 2026-03-07T10:00:00.000Z
    And a RAIL stop has lines A at 10, A at 70, A at 75, and A at 76 minutes
    When the departures route loads that stop
    Then the board is A 10, A 70, A 75

  Scenario: A line filter keeps rail departures in time order
    Given the clock is 2026-03-07T10:00:00.000Z
    And a RAIL stop has the busy line mix
    When the departures route loads that stop for lines I,P
    Then the board is I 1, I 2, I 3, P 4, I 5, I 7, I 9, I 10, I 11, I 12

  Scenario: A destination filter keeps rail departures in time order
    Given the clock is 2026-03-07T10:00:00.000Z
    And a RAIL stop has the busy line mix
    When the departures route loads that stop for destination Helsinki
    Then the board is I 1, I 2, I 3, P 4, I 5, L 6, I 7, A 8, I 9, I 10

  Scenario: A results count does not shorten the rail board
    Given the clock is 2026-03-07T10:00:00.000Z
    And a RAIL stop has the busy line mix
    When the departures route loads that stop with results 2
    Then the board is I 1, P 4, L 6, A 8, U 13, I 2, I 3, I 5, I 7, I 9

  Scenario: Metro departures stop at twenty five minutes
    Given the clock is 2026-03-07T10:00:00.000Z
    And a METRO stop has lines M at 5, M at 10, M at 20, and M at 30 minutes
    When the departures route loads that stop
    Then the board is M 5, M 10, M 20

  Scenario: Tram departures stop at thirty five minutes
    Given the clock is 2026-03-07T10:00:00.000Z
    And a TRAM stop has lines T at 5, T at 10, T at 20, and T at 40 minutes
    When the departures route loads that stop
    Then the board is T 5, T 10, T 20

  Scenario: Bus departures stop at forty five minutes
    Given the clock is 2026-03-07T10:00:00.000Z
    And a BUS stop has lines B at 5, B at 10, B at 20, B at 40, and B at 50 minutes
    When the departures route loads that stop
    Then the board is B 5, B 10, B 20, B 40

  Scenario: A crowded rail stop shows at most ten departures
    Given the clock is 2026-03-07T10:00:00.000Z
    And a RAIL stop has one departure each for eleven lines
    When the departures route loads that stop
    Then the board is L01 1, L02 2, L03 3, L04 4, L05 5, L06 6, L07 7, L08 8, L09 9, L10 10

  Scenario: Rail fetch asks for the seventy five minute horizon
    Given the clock is 2026-03-07T10:00:00.000Z
    When Digitransit is asked for RAIL departures
    Then the upstream time range is 4500 seconds
    And the upstream departure count is 4500
    And the upstream start time is the clock

  Scenario: A results count outside 1 to 60 is rejected
    When the departures route rejects results 0
    Then the departures response status is 400

  Scenario: Metro fetch asks for the forty five minute horizon
    Given the clock is 2026-03-07T10:00:00.000Z
    When Digitransit is asked for METRO departures
    Then the upstream time range is 2700 seconds
    And the upstream departure count is 2700
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
        },
      },
      {
        pattern: /^Given a RAIL stop has lines A at 5, A at 10, A at 15, A at 20, and Z at 41 minutes$/,
        run: ({ world }) => {
          world.mode = "RAIL";
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
        pattern: /^Given a RAIL stop has lines A at 50, A at 50, A at 50, A at 54, and A at 60 minutes$/,
        run: ({ world }) => {
          world.mode = "RAIL";
          world.rows = rows([
            ["A", 50],
            ["A", 50],
            ["A", 50],
            ["A", 54],
            ["A", 60],
          ]);
        },
      },
      {
        pattern: /^Given a RAIL stop has the busy line mix$/,
        run: ({ world }) => {
          world.mode = "RAIL";
          world.rows = BUSY_ROWS.map((row) => ({ ...row }));
        },
      },
      {
        pattern: /^Given a RAIL stop has lines A at 10, A at 70, A at 75, and A at 76 minutes$/,
        run: ({ world }) => {
          world.mode = "RAIL";
          world.rows = rows([
            ["A", 10],
            ["A", 70],
            ["A", 75],
            ["A", 76],
          ]);
        },
      },
      {
        pattern: /^Given a METRO stop has lines M at 5, M at 10, M at 20, and M at 30 minutes$/,
        run: ({ world }) => {
          world.mode = "METRO";
          world.rows = rows([
            ["M", 5],
            ["M", 10],
            ["M", 20],
            ["M", 30],
          ]);
        },
      },
      {
        pattern: /^Given a TRAM stop has lines T at 5, T at 10, T at 20, and T at 40 minutes$/,
        run: ({ world }) => {
          world.mode = "TRAM";
          world.rows = rows([
            ["T", 5],
            ["T", 10],
            ["T", 20],
            ["T", 40],
          ]);
        },
      },
      {
        pattern: /^Given a BUS stop has lines B at 5, B at 10, B at 20, B at 40, and B at 50 minutes$/,
        run: ({ world }) => {
          world.mode = "BUS";
          world.rows = rows([
            ["B", 5],
            ["B", 10],
            ["B", 20],
            ["B", 40],
            ["B", 50],
          ]);
        },
      },
      {
        pattern: /^Given a RAIL stop has one departure each for eleven lines$/,
        run: ({ world }) => {
          world.mode = "RAIL";
          world.rows = Array.from({ length: 11 }, (_item, index) => ({
            destination: "Helsinki",
            line: `L${String(index + 1).padStart(2, "0")}`,
            minutes: index + 1,
          }));
        },
      },
      {
        pattern: /^When the departures route loads that stop$/,
        run: async ({ world }) => {
          await loadBoard(world);
        },
      },
      {
        pattern: /^When the departures route loads that stop for lines I,P$/,
        run: async ({ world }) => {
          await loadBoard(world, "&line=I,P");
        },
      },
      {
        pattern: /^When the departures route loads that stop for destination Helsinki$/,
        run: async ({ world }) => {
          await loadBoard(world, "&dest=Helsinki");
        },
      },
      {
        pattern: /^When the departures route loads that stop with results 2$/,
        run: async ({ world }) => {
          await loadBoard(world, "&results=2");
        },
      },
      {
        pattern: /^Then the board is (.+)$/,
        run: ({ assert, world, args }) => {
          assert.equal(boardText(world), args[0]);
        },
      },
      {
        pattern: /^Then the line filter still counts Z once$/,
        run: ({ assert, world }) => {
          const lineZ = world.payload?.filterOptions.lines.find((option) => option.value === "Z");
          assert.equal(lineZ?.count, 1);
        },
      },
      {
        pattern: /^When the departures route rejects results 0$/,
        run: async ({ world }) => {
          const app = createApp();
          const response = await app.request(
            "http://localhost/api/v1/departures?lat=60.17&lon=24.94&mode=RAIL&results=0"
          );
          world.status = response.status;
        },
      },
      {
        pattern: /^Then the departures response status is 400$/,
        run: ({ assert, world }) => {
          assert.equal(world.status, 400);
        },
      },
      {
        pattern: /^When Digitransit is asked for RAIL departures$/,
        run: async ({ world }) => {
          await askUpstream(world, "RAIL");
        },
      },
      {
        pattern: /^When Digitransit is asked for METRO departures$/,
        run: async ({ world }) => {
          await askUpstream(world, "METRO");
        },
      },
      {
        pattern: /^Then the upstream time range is (\d+) seconds$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.queryVariables?.timeRange, Number(args[0]));
          assert.match(world.queryText || "", /timeRange:\s*\$timeRange/);
        },
      },
      {
        pattern: /^Then the upstream departure count is (\d+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.queryVariables?.departures, Number(args[0]));
        },
      },
      {
        pattern: /^Then the upstream start time is the clock$/,
        run: ({ assert, world }) => {
          assert.equal(world.queryVariables?.startTime, Math.floor(world.clockMs / 1000));
        },
      },
    ],
  }
);
