import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { shouldSubmitLegacyGeneration } from "@client/create/legacy-generation-flow";

interface World {
  hasLoadGeneratedDepartures?: boolean;
  prompt?: string;
  result?: boolean;
}

defineFeature<World>(
  test,
  `
Feature: Legacy generation flow

  Scenario: Generic board prompt stays on legacy generation
    Given load-generated-departures is available
    And the prompt is Build a compact departures board
    When legacy generation submit is evaluated
    Then legacy generation should submit

  Scenario: Intent-canvas travel prompt does not submit legacy generation
    Given load-generated-departures is available
    And the prompt is let's go to Mall of Tripla
    When legacy generation submit is evaluated
    Then legacy generation should not submit

  Scenario: Travel prompt needing starting location does not submit legacy generation
    Given load-generated-departures is available
    And the prompt is i want to take bus to Elielinaukio
    When legacy generation submit is evaluated
    Then legacy generation should not submit

  Scenario: Without prompt departures loader generic prompt still submits legacy generation
    Given load-generated-departures is unavailable
    And the prompt is Build a compact departures board
    When legacy generation submit is evaluated
    Then legacy generation should submit
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given load-generated-departures is available$/,
        run: ({ world }) => {
          world.hasLoadGeneratedDepartures = true;
        },
      },
      {
        pattern: /^Given load-generated-departures is unavailable$/,
        run: ({ world }) => {
          world.hasLoadGeneratedDepartures = false;
        },
      },
      {
        pattern: /^(Given|And) the prompt is (.+)$/,
        run: ({ args, world }) => {
          world.prompt = args[1];
        },
      },
      {
        pattern: /^When legacy generation submit is evaluated$/,
        run: ({ world }) => {
          world.result = shouldSubmitLegacyGeneration({
            hasLoadGeneratedDepartures: world.hasLoadGeneratedDepartures === true,
            prompt: world.prompt || "",
          });
        },
      },
      {
        pattern: /^Then legacy generation should submit$/,
        run: ({ assert, world }) => {
          assert.equal(world.result, true);
        },
      },
      {
        pattern: /^Then legacy generation should not submit$/,
        run: ({ assert, world }) => {
          assert.equal(world.result, false);
        },
      },
    ],
  }
);
