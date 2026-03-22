import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { summarizeBundleBudgets } from "@shared/performance/bundle-budget";

interface World {
  result?: ReturnType<typeof summarizeBundleBudgets>;
}

defineFeature<World>(
  test,
  `
Feature: Bundle budgets

  Scenario: Assets under budget produce no violations
    Given gzip bundle assets under the configured budgets
    When bundle budgets are summarized
    Then the bundle budget violation count is 0

  Scenario: Assets over CSS budget produce one violation
    Given gzip bundle assets over the CSS budget
    When bundle budgets are summarized
    Then the bundle budget violation count is 1
    And the bundle budget totals are 90000 JavaScript bytes and 50000 CSS bytes
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given gzip bundle assets under the configured budgets$/,
        run: ({ world }) => {
          world.result = summarizeBundleBudgets([
            { fileName: "app.js", gzipBytes: 10_000, type: "js" },
            { fileName: "app.css", gzipBytes: 2_000, type: "css" },
          ]);
        },
      },
      {
        pattern: /^Given gzip bundle assets over the CSS budget$/,
        run: ({ world }) => {
          world.result = summarizeBundleBudgets([
            { fileName: "vendor.js", gzipBytes: 80_000, type: "js" },
            { fileName: "app.js", gzipBytes: 10_000, type: "js" },
            { fileName: "app.css", gzipBytes: 50_000, type: "css" },
          ]);
        },
      },
      {
        pattern: /^When bundle budgets are summarized$/,
        run: () => {},
      },
      {
        pattern: /^Then the bundle budget violation count is (\d+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.result?.violations.length, Number(args[0]));
        },
      },
      {
        pattern: /^Then the bundle budget totals are (\d+) JavaScript bytes and (\d+) CSS bytes$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.result?.jsGzipBytes, Number(args[0]));
          assert.equal(world.result?.cssGzipBytes, Number(args[1]));
        },
      },
    ],
  }
);
