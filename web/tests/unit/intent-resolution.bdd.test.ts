import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  destinationTextChanged,
  resolveDestinationBoundary,
  resolvePromptIntentBoundary,
} from "@client/create/intent-resolution";
import type { TravelIntentClient } from "@client/services/travel-intent-client";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";

interface World {
  changeDetected?: boolean;
  promptResult?: Awaited<ReturnType<typeof resolvePromptIntentBoundary>>;
  responses?: DeparturesSuccessResponse[];
  travelIntentClient?: TravelIntentClient;
}

defineFeature<World>(
  test,
  `
Feature: Intent resolution

  Scenario: A parsed travel prompt resolves before route assembly
    Given prompt intent parsing has no fallback model
    When the prompt boundary resolves i want to take bus 59 from Talontie 17 to Tripla
    Then the prompt boundary status is resolved
    And the resolved destination is Tripla
    And the resolved location query is Talontie 17

  Scenario: An ambiguous destination requires clarification before route assembly
    Given departures contain low-confidence destination clarification
    When the destination boundary resolves visible responses
    Then the destination boundary status is needs_clarification
    And the clarification destination is Tripla

  Scenario: An unparseable travel prompt fails before route assembly
    Given prompt intent parsing falls back to an empty model result
    When the prompt boundary resolves i want to go to someplace nice by bus
    Then the prompt boundary status is failure
    And the prompt boundary failure reason is parse_failed

  Scenario: A destination-only travel prompt fails until a starting location is known
    Given prompt intent parsing has no fallback model
    When the prompt boundary resolves i want to take bus to Elielinaukio
    Then the prompt boundary status is failure
    And the prompt boundary failure reason is missing_location

  Scenario: Changing destination text invalidates a prior destination resolution
    Given a resolved destination text Tripla
    When the destination text changes to Mall of Tripla
    Then the prior destination resolution is invalidated
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given prompt intent parsing has no fallback model$/,
        run: ({ world }) => {
          world.travelIntentClient = undefined;
        },
      },
      {
        pattern: /^Given prompt intent parsing falls back to an empty model result$/,
        run: ({ world }) => {
          world.travelIntentClient = {
            async parse() {
              return {
                locationQuery: null,
                requests: [],
              };
            },
          };
        },
      },
      {
        pattern: /^Given departures contain low-confidence destination clarification$/,
        run: ({ world }) => {
          world.responses = [
            {
              destinationResolution: {
                confidence: 0.62,
                input: "Tripla",
                suggestions: ["Herttoniemi(M) via Pasila as.", "Kamppi"],
                type: "needs-clarification",
              },
              filterOptions: {
                destinations: [],
                lines: [],
              },
              mode: "BUS",
              selectedStopId: "HSL:STOP_BUS",
              station: {
                departures: [],
                distanceMeters: 10,
                stopCode: "H1514",
                stopCodes: ["H1514"],
                stopName: "Talontie",
                type: "stop",
              },
              stops: [],
            },
          ];
        },
      },
      {
        pattern: /^Given a resolved destination text Tripla$/,
        run: ({ world }) => {
          world.changeDetected = destinationTextChanged("Tripla", "Tripla");
        },
      },
      {
        pattern: /^When the prompt boundary resolves i want to take bus 59 from Talontie 17 to Tripla$/,
        run: async ({ world }) => {
          world.promptResult = await resolvePromptIntentBoundary({
            prompt: "i want to take bus 59 from Talontie 17 to Tripla",
            travelIntentClient: world.travelIntentClient,
          });
        },
      },
      {
        pattern: /^When the prompt boundary resolves i want to go to someplace nice by bus$/,
        run: async ({ world }) => {
          world.promptResult = await resolvePromptIntentBoundary({
            prompt: "i want to go to someplace nice by bus",
            travelIntentClient: world.travelIntentClient,
          });
        },
      },
      {
        pattern: /^When the prompt boundary resolves i want to take bus to Elielinaukio$/,
        run: async ({ world }) => {
          world.promptResult = await resolvePromptIntentBoundary({
            prompt: "i want to take bus to Elielinaukio",
            travelIntentClient: world.travelIntentClient,
          });
        },
      },
      {
        pattern: /^When the destination boundary resolves visible responses$/,
        run: ({ world }) => {
          if (!world.responses) {
            throw new Error("Expected responses");
          }
          world.promptResult = resolveDestinationBoundary(world.responses);
        },
      },
      {
        pattern: /^When the destination text changes to Mall of Tripla$/,
        run: ({ world }) => {
          world.changeDetected = destinationTextChanged("Tripla", "Mall of Tripla");
        },
      },
      {
        pattern: /^Then the prompt boundary status is resolved$/,
        run: ({ assert, world }) => {
          assert.equal(world.promptResult?.status, "resolved");
        },
      },
      {
        pattern: /^Then the destination boundary status is needs_clarification$/,
        run: ({ assert, world }) => {
          assert.equal(world.promptResult?.status, "needs_clarification");
        },
      },
      {
        pattern: /^Then the prompt boundary status is failure$/,
        run: ({ assert, world }) => {
          assert.equal(world.promptResult?.status, "failure");
        },
      },
      {
        pattern: /^(Then|And) the resolved destination is Tripla$/,
        run: ({ assert, world }) => {
          if (world.promptResult?.status !== "resolved") {
            throw new Error("Expected resolved prompt boundary");
          }
          assert.equal(world.promptResult.requests[0]?.destinations[0], "Tripla");
        },
      },
      {
        pattern: /^(Then|And) the resolved location query is Talontie 17$/,
        run: ({ assert, world }) => {
          if (world.promptResult?.status !== "resolved") {
            throw new Error("Expected resolved prompt boundary");
          }
          assert.equal(world.promptResult.locationQuery, "Talontie 17");
        },
      },
      {
        pattern: /^(Then|And) the clarification destination is Tripla$/,
        run: ({ assert, world }) => {
          if (world.promptResult?.status !== "needs_clarification") {
            throw new Error("Expected clarification boundary");
          }
          assert.equal(world.promptResult.inputDestination, "Tripla");
        },
      },
      {
        pattern: /^(Then|And) the prompt boundary failure reason is parse_failed$/,
        run: ({ assert, world }) => {
          if (world.promptResult?.status !== "failure") {
            throw new Error("Expected failure boundary");
          }
          assert.equal(world.promptResult.reason, "parse_failed");
        },
      },
      {
        pattern: /^(Then|And) the prompt boundary failure reason is missing_location$/,
        run: ({ assert, world }) => {
          if (world.promptResult?.status !== "failure") {
            throw new Error("Expected failure boundary");
          }
          assert.equal(world.promptResult.reason, "missing_location");
        },
      },
      {
        pattern: /^Then the prior destination resolution is invalidated$/,
        run: ({ assert, world }) => {
          assert.equal(world.changeDetected, true);
        },
      },
    ],
  }
);
