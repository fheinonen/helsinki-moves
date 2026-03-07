import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { summarizeBundleBudgets } from "@shared/performance/bundle-budget";

interface World {
  summary?: ReturnType<typeof summarizeBundleBudgets>;
}

defineFeature<World>(
  test,
  `
Feature: Bundle budget checks

  Scenario: Bundled assets stay within the gzip budgets
    Given bundled assets total 60 KiB of JavaScript and 20 KiB of CSS
    When bundle budgets are evaluated
    Then the bundle budget has no violations

  Scenario: Bundled assets exceed the JavaScript gzip budget
    Given bundled assets total 96 KiB of JavaScript and 20 KiB of CSS
    When bundle budgets are evaluated
    Then the bundle budget reports a JavaScript violation
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given bundled assets total (\d+) KiB of JavaScript and (\d+) KiB of CSS$/,
        run: ({ args, world }) => {
          world.summary = summarizeBundleBudgets([
            {
              fileName: "app.js",
              gzipBytes: Number(args[0]) * 1024,
              type: "js",
            },
            {
              fileName: "app.css",
              gzipBytes: Number(args[1]) * 1024,
              type: "css",
            },
          ]);
        },
      },
      {
        pattern: /^When bundle budgets are evaluated$/,
        run: ({ world }) => {
          if (!world.summary) {
            throw new Error("Expected bundle summary");
          }
        },
      },
      {
        pattern: /^Then the bundle budget has no violations$/,
        run: ({ assert, world }) => {
          assert.equal(world.summary?.violations.length, 0);
        },
      },
      {
        pattern: /^Then the bundle budget reports a JavaScript violation$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.summary?.violations.some((violation) => violation.type === "js"),
            true
          );
        },
      },
    ],
  }
);
