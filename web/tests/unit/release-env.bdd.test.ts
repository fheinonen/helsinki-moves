import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { validateReleaseEnv } from "@shared/config/release-env";

interface World {
  validation?: ReturnType<typeof validateReleaseEnv>;
}

defineFeature<World>(
  test,
  `
Feature: Release env validation

  Scenario: Release env validation passes when required vars are present
    Given release env includes Digitransit and speech secrets
    When release env validation is evaluated
    Then release env has no missing required vars

  Scenario: Release env validation reports missing voice secrets
    Given release env includes Digitransit only
    When release env validation is evaluated
    Then release env reports missing required vars SPEECH_TRANSCRIBE_API_KEY and SPEECH_TRANSCRIBE_MODEL
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given release env includes Digitransit and speech secrets$/,
        run: ({ world }) => {
          world.validation = validateReleaseEnv({
            DIGITRANSIT_API_KEY: "digitransit-key",
            SPEECH_TRANSCRIBE_API_KEY: "speech-key",
            SPEECH_TRANSCRIBE_MODEL: "gpt-4o-mini-transcribe",
          });
        },
      },
      {
        pattern: /^Given release env includes Digitransit only$/,
        run: ({ world }) => {
          world.validation = validateReleaseEnv({
            DIGITRANSIT_API_KEY: "digitransit-key",
          });
        },
      },
      {
        pattern: /^When release env validation is evaluated$/,
        run: ({ world }) => {
          if (!world.validation) {
            throw new Error("Expected release env validation");
          }
        },
      },
      {
        pattern: /^Then release env has no missing required vars$/,
        run: ({ assert, world }) => {
          assert.equal(world.validation?.missingRequired.length, 0);
        },
      },
      {
        pattern:
          /^Then release env reports missing required vars SPEECH_TRANSCRIBE_API_KEY and SPEECH_TRANSCRIBE_MODEL$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.validation?.missingRequired.join(","),
            "SPEECH_TRANSCRIBE_API_KEY,SPEECH_TRANSCRIBE_MODEL"
          );
        },
      },
    ],
  }
);
