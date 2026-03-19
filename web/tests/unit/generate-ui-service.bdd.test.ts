import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  buildGenerateUiSystemPrompt,
  buildGenerateUiUserPrompt,
} from "@server/services/generate-ui/generate-ui-service";

interface World {
  systemPrompt?: string;
  userPrompt?: string;
}

defineFeature<World>(
  test,
  `
Feature: Generate UI service prompts

  Scenario: The system prompt preserves the default board root for patch updates
    When the generate ui system prompt is built
    Then the generate ui system prompt says to keep the board root
    Then the generate ui system prompt says to omit root instead of blanking it
    Then the generate ui system prompt says to avoid empty patches
    Then the generate ui system prompt says not to add a stop header

  Scenario: The user prompt carries the current create-route board as the editing baseline
    When the generate ui user prompt is built for a compact tram board
    Then the generate ui user prompt mentions the current spec
    Then the generate ui user prompt says empty patches are invalid
    Then the generate ui user prompt requires a board title change
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^When the generate ui system prompt is built$/,
        run: ({ world }) => {
          world.systemPrompt = buildGenerateUiSystemPrompt();
        },
      },
      {
        pattern: /^When the generate ui user prompt is built for a compact tram board$/,
        run: ({ world }) => {
          world.userPrompt = buildGenerateUiUserPrompt("Build a compact tram board");
        },
      },
      {
        pattern: /^Then the generate ui system prompt says to keep the board root$/,
        run: ({ assert, world }) => {
          assert.equal(world.systemPrompt?.includes('Keep the default board root "board"'), true);
        },
      },
      {
        pattern: /^Then the generate ui system prompt says to omit root instead of blanking it$/,
        run: ({ assert, world }) => {
          assert.equal(world.systemPrompt?.includes("Never blank the root"), true);
        },
      },
      {
        pattern: /^Then the generate ui user prompt mentions the current spec$/,
        run: ({ assert, world }) => {
          assert.equal(world.userPrompt?.includes("Current UI state:"), true);
        },
      },
      {
        pattern: /^Then the generate ui user prompt says empty patches are invalid$/,
        run: ({ assert, world }) => {
          assert.equal(world.userPrompt?.includes("Returning an empty patch is invalid"), true);
        },
      },
      {
        pattern: /^Then the generate ui user prompt requires a board title change$/,
        run: ({ assert, world }) => {
          assert.equal(world.userPrompt?.includes('At minimum, update "/elements/board/props/title"'), true);
        },
      },
      {
        pattern: /^Then the generate ui system prompt says to avoid empty patches$/,
        run: ({ assert, world }) => {
          assert.equal(world.systemPrompt?.includes("Do not return an empty patch"), true);
        },
      },
      {
        pattern: /^Then the generate ui system prompt says not to add a stop header$/,
        run: ({ assert, world }) => {
          assert.equal(world.systemPrompt?.includes("Do not add a global StopHeader"), true);
        },
      },
    ],
  }
);
