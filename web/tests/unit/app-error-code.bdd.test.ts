import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { isAppErrorCode } from "@shared/domain/error";

interface World {
  result?: boolean;
  value?: unknown;
}

defineFeature<World>(
  test,
  `
Feature: App error codes

  Scenario: Known app error codes are accepted
    Given the candidate app error code is invalid payload
    When app error code validation runs
    Then the app error code validation result is true

  Scenario: Unknown app error codes are rejected
    Given the candidate app error code is exploded
    When app error code validation runs
    Then the app error code validation result is false
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the candidate app error code is (.+)$/,
        run: ({ args, world }) => {
          world.value = args[0];
        },
      },
      {
        pattern: /^When app error code validation runs$/,
        run: ({ world }) => {
          world.result = isAppErrorCode(world.value);
        },
      },
      {
        pattern: /^Then the app error code validation result is (true|false)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.result, args[0] === "true");
        },
      },
    ],
  }
);
