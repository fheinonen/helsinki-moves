import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { parseVoiceLineIntent } from "@client/features/voice/voice-line-intent";

interface World {
  parsedIntent?: ReturnType<typeof parseVoiceLineIntent>;
}

defineFeature<World>(
  test,
  `
Feature: Voice line intent parsing

  Scenario: Treat numeric transcript with trailing period as a line number
    Given voice line-intent parsing is available
    When voice line intent is parsed from "10."
    Then parsed voice line equals "10"
    And parsed voice line mode equals ""

  Scenario: Treat explicit bus transcript with trailing period as a line number
    Given voice line-intent parsing is available
    When voice line intent is parsed from "bus 10."
    Then parsed voice line equals "10"
    And parsed voice line mode equals "BUS"

  Scenario: Treat letter transcript with trailing period as a line token
    Given voice line-intent parsing is available
    When voice line intent is parsed from "A."
    Then parsed voice line equals "A"
    And parsed voice line mode equals ""
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given voice line-intent parsing is available$/,
        run: () => {},
      },
      {
        pattern: /^When voice line intent is parsed from "([^"]*)"$/,
        run: ({ args, world }) => {
          world.parsedIntent = parseVoiceLineIntent(args[0]);
        },
      },
      {
        pattern: /^Then parsed voice line equals "([^"]*)"$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.parsedIntent?.line || "", args[0]);
        },
      },
      {
        pattern: /^Then parsed voice line mode equals "([^"]*)"$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.parsedIntent?.mode || "", args[0]);
        },
      },
    ],
  }
);
