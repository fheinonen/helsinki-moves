import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";

interface World {
  css?: string;
  hasFirefoxBackdropDisable?: boolean;
  hasFirefoxBlock?: boolean;
}

defineFeature<World>(
  test,
  `
Feature: Firefox performance contracts

  Scenario: Firefox disables heavy glass blur in the rewrite shell
    Given the rewrite shell stylesheet
    When Firefox performance overrides are inspected
    Then the stylesheet defines a Firefox-specific supports block
    And glass blur is disabled inside the Firefox block
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the rewrite shell stylesheet$/,
        run: ({ world }) => {
          world.css = fs.readFileSync(
            path.resolve(__dirname, "../../src/client/styles/main.css"),
            "utf8"
          );
        },
      },
      {
        pattern: /^When Firefox performance overrides are inspected$/,
        run: ({ world }) => {
          const firefoxBlockMatch = String(world.css || "").match(
            /@supports\s*\(\s*-moz-appearance:\s*none\s*\)\s*\{([\s\S]*?)\}\s*$/
          );
          world.hasFirefoxBlock = Boolean(firefoxBlockMatch);
          world.hasFirefoxBackdropDisable = Boolean(
            firefoxBlockMatch &&
              /backdrop-filter:\s*none;/.test(firefoxBlockMatch[1])
          );
        },
      },
      {
        pattern: /^Then the stylesheet defines a Firefox-specific supports block$/,
        run: ({ assert, world }) => {
          assert.equal(world.hasFirefoxBlock, true);
        },
      },
      {
        pattern: /^(?:Then|And) glass blur is disabled inside the Firefox block$/,
        run: ({ assert, world }) => {
          assert.equal(world.hasFirefoxBackdropDisable, true);
        },
      },
    ],
  }
);
