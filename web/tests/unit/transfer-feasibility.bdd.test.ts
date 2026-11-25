import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  chooseDefaultTransferMode,
  estimateTransferWalkSeconds,
  evaluateTransfer,
  findRecoveryTransfer,
  formatTransferMargin,
  type EvaluatedTransfer,
  type TransferOption,
} from "@shared/domain/transfer";
import type { Mode } from "@shared/domain/mode";

const ARRIVAL_MS = Date.parse("2026-03-07T12:20:00.000Z");

interface World {
  availableModes?: Mode[];
  defaultMode?: Mode | null;
  evaluated?: EvaluatedTransfer;
  evaluatedList?: EvaluatedTransfer[];
  recovery?: EvaluatedTransfer | null;
  walkSeconds?: number;
}

function makeOption(overrides: Partial<TransferOption> = {}): TransferOption {
  return {
    departureIso: new Date(ARRIVAL_MS + 6 * 60_000).toISOString(),
    destination: "Lentoasema",
    distanceMeters: 120,
    line: "I",
    mode: "RAIL",
    platform: "4",
    stopId: "HSL:PASILA_4",
    stopName: "Pasila",
    tripId: "HSL:I_1426",
    ...overrides,
  };
}

defineFeature<World>(
  test,
  `
Feature: Real-time transfer feasibility evaluation

  Scenario: Smart hub mode defaults to Rail when arriving by Bus near a rail station
    Given available onward modes BUS, TRAM, and RAIL near the exit stop
    When the default transfer mode is chosen for a rider arriving by BUS
    Then the chosen default transfer mode is RAIL

  Scenario: Smart hub mode defaults to Metro when arriving by Tram near a metro hub without rail
    Given available onward modes BUS, TRAM, and METRO near the exit stop
    When the default transfer mode is chosen for a rider arriving by TRAM
    Then the chosen default transfer mode is METRO

  Scenario: Distance-based transfer walk estimate adds a 45 second station buffer
    When transfer walk time is estimated for 120 meters
    Then the estimated walk time is 145 seconds

  Scenario: Same-stop transfer uses a 30 second boarding buffer
    When transfer walk time is estimated for 8 meters
    Then the estimated walk time is 30 seconds

  Scenario: Departure with at least 2 minutes spare after walk is Make it
    When evaluating a transfer departing in 6 minutes with 120 meters walk
    Then the transfer feasibility is make-it
    And the formatted transfer margin is ✓ +3m

  Scenario: Departure with less than 2 minutes spare after routed walk is Tight
    When evaluating a transfer departing in 3 minutes with a 90 second routed walk
    Then the transfer feasibility is tight
    And the formatted transfer margin is ! +0m

  Scenario: Departure before arrival plus walk is Missed
    When evaluating a transfer departing in 1 minute with 120 meters walk
    Then the transfer feasibility is missed
    And the formatted transfer margin is ✕ -2m

  Scenario: Missed transfer recovery picks a sooner catchable line to the same destination
    Given a missed I-train to Lentoasema and later catchable P and I trains to Lentoasema
    When recovery transfer is computed
    Then the recovery transfer is line P on trip HSL:P_1427

  Scenario: Missed transfer recovery prefers the same line when departure times tie
    Given a missed I-train to Lentoasema and tied catchable P and I trains at 14:32
    When recovery transfer is computed
    Then the recovery transfer is line I on trip HSL:I_1432

  Scenario: Smart mode falls back to another mode or current mode and returns null when empty
    Given available onward modes BUS and TRAM near the exit stop
    When the default transfer mode is chosen for a rider arriving by BUS
    Then the chosen default transfer mode is TRAM
    Given available onward modes BUS near the exit stop
    When the default transfer mode is chosen for a rider arriving by BUS
    Then the chosen default transfer mode is BUS
    Given no onward modes near the exit stop
    When the default transfer mode is chosen for a rider arriving by BUS
    Then no default transfer mode is chosen

  Scenario: Recovery ignores other destinations and returns null when none are catchable
    Given a missed I-train to Lentoasema with only a catchable train to Kirkkonummi
    When recovery transfer is computed
    Then no recovery transfer is suggested

  Scenario: Non-finite walk distances and routed seconds clamp safely to zero
    When non-finite walk inputs are evaluated
    Then non-finite distance defaults to 30 seconds and non-finite routed walk to 45 seconds
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given available onward modes (.+) near the exit stop$/,
        run: ({ args, world }) => {
          world.availableModes = args[0]
            .replace(/\band\b/g, ",")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean) as Mode[];
        },
      },
      {
        pattern: /^Given no onward modes near the exit stop$/,
        run: ({ world }) => {
          world.availableModes = [];
        },
      },
      {
        pattern: /^Given a missed I-train to Lentoasema and later catchable P and I trains to Lentoasema$/,
        run: ({ world }) => {
          const missed = evaluateTransfer({
            arrivalMs: ARRIVAL_MS,
            option: makeOption({
              departureIso: new Date(ARRIVAL_MS + 60_000).toISOString(),
              line: "I",
              tripId: "HSL:I_1421",
            }),
          });
          const soonerP = evaluateTransfer({
            arrivalMs: ARRIVAL_MS,
            option: makeOption({
              departureIso: new Date(ARRIVAL_MS + 7 * 60_000).toISOString(),
              line: "P",
              tripId: "HSL:P_1427",
            }),
          });
          const laterI = evaluateTransfer({
            arrivalMs: ARRIVAL_MS,
            option: makeOption({
              departureIso: new Date(ARRIVAL_MS + 12 * 60_000).toISOString(),
              line: "I",
              tripId: "HSL:I_1432",
            }),
          });
          world.evaluated = missed;
          world.evaluatedList = [missed, soonerP, laterI];
        },
      },
      {
        pattern: /^Given a missed I-train to Lentoasema and tied catchable P and I trains at 14:32$/,
        run: ({ world }) => {
          const missed = evaluateTransfer({
            arrivalMs: ARRIVAL_MS,
            option: makeOption({
              departureIso: new Date(ARRIVAL_MS + 60_000).toISOString(),
              line: "I",
              tripId: "HSL:I_1421",
            }),
          });
          const tiedP = evaluateTransfer({
            arrivalMs: ARRIVAL_MS,
            option: makeOption({
              departureIso: new Date(ARRIVAL_MS + 12 * 60_000).toISOString(),
              line: "P",
              tripId: "HSL:P_1432",
            }),
          });
          const tiedI = evaluateTransfer({
            arrivalMs: ARRIVAL_MS,
            option: makeOption({
              departureIso: new Date(ARRIVAL_MS + 12 * 60_000).toISOString(),
              line: "I",
              tripId: "HSL:I_1432",
            }),
          });
          world.evaluated = missed;
          world.evaluatedList = [missed, tiedP, tiedI];
        },
      },
      {
        pattern: /^Given a missed I-train to Lentoasema with only a catchable train to Kirkkonummi$/,
        run: ({ world }) => {
          const missed = evaluateTransfer({
            arrivalMs: ARRIVAL_MS,
            option: makeOption({
              departureIso: new Date(ARRIVAL_MS + 60_000).toISOString(),
              line: "I",
              tripId: "HSL:I_1421",
            }),
          });
          const duplicateCatchable = {
            ...missed,
            feasibility: "make-it" as const,
            marginSeconds: 300,
          };
          const otherDest = evaluateTransfer({
            arrivalMs: ARRIVAL_MS,
            option: makeOption({
              departureIso: new Date(ARRIVAL_MS + 9 * 60_000).toISOString(),
              destination: "Kirkkonummi",
              line: "U",
              tripId: "HSL:U_1429",
            }),
          });
          world.evaluated = missed;
          world.evaluatedList = [missed, duplicateCatchable, otherDest];
        },
      },
      {
        pattern: /^When the default transfer mode is chosen for a rider arriving by (RAIL|TRAM|METRO|BUS)$/,
        run: ({ args, world }) => {
          world.defaultMode = chooseDefaultTransferMode(world.availableModes ?? [], args[0] as Mode);
        },
      },
      {
        pattern: /^When transfer walk time is estimated for (\d+) meters$/,
        run: ({ args, world }) => {
          world.walkSeconds = estimateTransferWalkSeconds(Number(args[0]));
        },
      },
      {
        pattern: /^When evaluating a transfer departing in (\d+) minutes? with (\d+) meters walk$/,
        run: ({ args, world }) => {
          world.evaluated = evaluateTransfer({
            arrivalMs: ARRIVAL_MS,
            option: makeOption({
              departureIso: new Date(ARRIVAL_MS + Number(args[0]) * 60_000).toISOString(),
              distanceMeters: Number(args[1]),
            }),
          });
        },
      },
      {
        pattern: /^When evaluating a transfer departing in (\d+) minutes? with a (\d+) second routed walk$/,
        run: ({ args, world }) => {
          world.evaluated = evaluateTransfer({
            arrivalMs: ARRIVAL_MS,
            option: makeOption({
              departureIso: new Date(ARRIVAL_MS + Number(args[0]) * 60_000).toISOString(),
            }),
            walkSecondsOverride: Number(args[1]),
          });
        },
      },
      {
        pattern: /^When recovery transfer is computed$/,
        run: ({ world }) => {
          if (!world.evaluated || !world.evaluatedList) {
            throw new Error("Expected evaluated transfers");
          }
          world.recovery = findRecoveryTransfer(world.evaluated, world.evaluatedList);
        },
      },
      {
        pattern: /^When non-finite walk inputs are evaluated$/,
        run: ({ world }) => {
          world.walkSeconds = estimateTransferWalkSeconds(Number.NaN);
          world.evaluated = evaluateTransfer({
            arrivalMs: ARRIVAL_MS,
            option: makeOption({
              departureIso: new Date(ARRIVAL_MS + 4 * 60_000).toISOString(),
            }),
            walkSecondsOverride: Number.NaN,
          });
        },
      },
      {
        pattern: /^Then the chosen default transfer mode is (RAIL|TRAM|METRO|BUS)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.defaultMode, args[0]);
        },
      },
      {
        pattern: /^Then no default transfer mode is chosen$/,
        run: ({ assert, world }) => {
          assert.equal(world.defaultMode, null);
        },
      },
      {
        pattern: /^Then the estimated walk time is (\d+) seconds$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.walkSeconds, Number(args[0]));
        },
      },
      {
        pattern: /^Then the transfer feasibility is (make-it|tight|missed)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.evaluated?.feasibility, args[0]);
        },
      },
      {
        pattern: /^Then the formatted transfer margin is (.+)$/,
        run: ({ args, assert, world }) => {
          if (!world.evaluated) {
            throw new Error("Expected evaluated transfer");
          }
          assert.equal(formatTransferMargin(world.evaluated), args[0]);
        },
      },
      {
        pattern: /^Then the recovery transfer is line (.+) on trip (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.recovery?.option.line, args[0]);
          assert.equal(world.recovery?.option.tripId, args[1]);
        },
      },
      {
        pattern: /^Then no recovery transfer is suggested$/,
        run: ({ assert, world }) => {
          assert.equal(world.recovery, null);
        },
      },
      {
        pattern: /^Then non-finite distance defaults to (\d+) seconds and non-finite routed walk to (\d+) seconds$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.walkSeconds, Number(args[0]));
          assert.equal(world.evaluated?.walkSeconds, Number(args[1]));
        },
      },
    ],
  },
);
