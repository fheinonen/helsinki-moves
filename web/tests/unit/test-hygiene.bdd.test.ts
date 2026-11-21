import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  auditTestHygiene,
  type TestHygieneResult,
  type TestHygieneSnapshot,
} from "../../tools/test-hygiene-core.mjs";

interface World {
  result?: TestHygieneResult;
  snapshot: TestHygieneSnapshot;
}

function createCleanSnapshot(): TestHygieneSnapshot {
  return {
    cliBddFiles: [
      {
        content: 'package bdd_test\nimport _ "hm/internal/testing"\n',
        path: "cli/tests/bdd/help_and_validation.bdd_test.go",
      },
      {
        content: "Feature: help\n  Scenario: prints help\n",
        path: "cli/tests/bdd/help_and_validation.scenarios.txt",
      },
    ],
    e2eFiles: [
      {
        content: `
import { test, expect } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";
definePlaywrightFeature(test, \`
Feature: Visual
  Scenario: Matches baseline
    When the app opens
    Then it matches the baseline
\`, {
  createWorld: async () => ({}),
  stepDefinitions: [
    { pattern: /^When the app opens$/, run: async ({ fixtures }) => { void fixtures; } },
    { pattern: /^Then it matches the baseline$/, run: async ({ fixtures }) => { await expect(fixtures.page).toHaveScreenshot("app-shell-desktop.png"); } },
  ],
});
`,
        path: "web/tests/e2e/ui-visual-regression.spec.ts",
      },
    ],
    helperFiles: [
      {
        content: "export function defineFeature() {}",
        path: "web/tests/helpers/bdd-runner.ts",
      },
      {
        content: 'import { defineFeature } from "@tests/helpers/bdd-runner"; export function definePlaywrightFeature() { return defineFeature; }',
        path: "web/tests/helpers/playwright-bdd-runner.ts",
      },
    ],
    packageScripts: {
      "ui:check": "playwright test tests/e2e/ui-visual-regression.spec.ts --project=chromium",
    },
    smokeFiles: [],
    snapshotDirs: [
      {
        files: ["app-shell-desktop-chromium-linux.png"],
        path: "web/tests/e2e/ui-visual-regression.spec.ts-snapshots",
      },
    ],
    unitFiles: [
      {
        content: `
import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore } from "@client/app/app-store";
defineFeature(test, \`
Feature: Store
  Scenario: Starts in rail mode
    When the store is created
    Then the active mode is RAIL
\`, {
  createWorld: () => ({}),
  stepDefinitions: [
    { pattern: /^When the store is created$/, run: ({ world }) => { Object.assign(world, { store: createAppStore() }); } },
    { pattern: /^Then the active mode is RAIL$/, run: ({ assert }) => { assert.equal("RAIL", "RAIL"); } },
  ],
});
`,
        path: "web/tests/unit/app-store.bdd.test.ts",
      },
    ],
  };
}

defineFeature<World>(
  test,
  `
Feature: CI test hygiene guard

  Scenario: A clean BDD test suite produces no violations
    Given a clean test suite snapshot
    When the test hygiene audit runs
    Then the hygiene audit reports 0 violations

  Scenario: Legacy non-BDD and config-scraping unit tests fail the audit
    Given a clean test suite snapshot
    And a legacy JavaScript unit test file is present
    And a config-scraping unit test without production imports is present
    When the test hygiene audit runs
    Then the hygiene audit reports violation code "legacy-test-file" for "web/tests/unit/old.test.js"
    And the hygiene audit reports violation code "no-production-import" for "web/tests/unit/retired-legacy.bdd.test.ts"

  Scenario: Orphaned snapshot directories and unused snapshot PNGs fail the audit
    Given a clean test suite snapshot
    And an orphaned pre-rewrite snapshot directory is present
    And an unreferenced snapshot PNG is present in an active snapshot directory
    When the test hygiene audit runs
    Then the hygiene audit reports violation code "orphaned-snapshot" for "web/tests/e2e/ui-visual-regression.spec.js-snapshots"
    And the hygiene audit reports violation code "orphaned-snapshot" for "web/tests/e2e/ui-visual-regression.spec.ts-snapshots/obsolete-board-chromium-linux.png"

  Scenario: No-op steps, unused steps, broken And patterns, and skipped tests fail the audit
    Given a clean test suite snapshot
    And a unit test has a no-op step, an unused step, a broken And pattern, and failFirstProbe disabled
    And an E2E spec has a skipped test
    When the test hygiene audit runs
    Then the hygiene audit reports violation code "disabled-or-skipped-test" for "web/tests/unit/bad-steps.bdd.test.ts"
    And the hygiene audit reports violation code "noop-or-broken-step" for "web/tests/unit/bad-steps.bdd.test.ts"
    And the hygiene audit reports violation code "unused-step-definition" for "web/tests/unit/bad-steps.bdd.test.ts"
    And the hygiene audit reports violation code "disabled-or-skipped-test" for "web/tests/e2e/skipped.spec.ts"

  Scenario: Unused test helpers and broken package script references fail the audit
    Given a clean test suite snapshot
    And an unused test helper file is present
    And a package script references a deleted test file
    When the test hygiene audit runs
    Then the hygiene audit reports violation code "unused-helper" for "web/tests/helpers/dead-helper.ts"
    And the hygiene audit reports violation code "broken-script-reference" for "web/package.json"

  Scenario: Unpaired, non-BDD, or README-scraping CLI BDD tests fail the audit
    Given a clean test suite snapshot
    And a non-BDD Go test is placed in cli/tests/bdd
    And an orphaned CLI scenario file is present
    And a README-scraping CLI BDD test is present
    When the test hygiene audit runs
    Then the hygiene audit reports violation code "legacy-test-file" for "cli/tests/bdd/fallback_test.go"
    And the hygiene audit reports violation code "unpaired-cli-bdd" for "cli/tests/bdd/orphan.scenarios.txt"
    And the hygiene audit reports violation code "no-production-import" for "cli/tests/bdd/readme_contract.bdd_test.go"
  `,
  {
    createWorld: () => ({ snapshot: createCleanSnapshot() }),
    stepDefinitions: [
      {
        pattern: /^Given a clean test suite snapshot$/,
        run: ({ world }) => {
          world.snapshot = createCleanSnapshot();
        },
      },
      {
        pattern: /^Given a legacy JavaScript unit test file is present$/,
        run: ({ world }) => {
          world.snapshot.unitFiles.push({
            content: 'import { test } from "vitest"; test("old", () => {});',
            path: "web/tests/unit/old.test.js",
          });
        },
      },
      {
        pattern: /^Given a config-scraping unit test without production imports is present$/,
        run: ({ world }) => {
          world.snapshot.unitFiles.push({
            content: `
import fs from "node:fs";
import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
defineFeature(test, \`
Feature: Retired
  Scenario: Absent
    When checked
    Then absent
\`, {
  createWorld: () => ({}),
  stepDefinitions: [
    { pattern: /^When checked$/, run: () => { fs.existsSync("old"); } },
    { pattern: /^Then absent$/, run: ({ assert }) => { assert.equal(false, false); } },
  ],
});
`,
            path: "web/tests/unit/retired-legacy.bdd.test.ts",
          });
        },
      },
      {
        pattern: /^Given an orphaned pre-rewrite snapshot directory is present$/,
        run: ({ world }) => {
          world.snapshot.snapshotDirs.push({
            files: ["ui-board-desktop-chromium-linux.png"],
            path: "web/tests/e2e/ui-visual-regression.spec.js-snapshots",
          });
        },
      },
      {
        pattern: /^Given an unreferenced snapshot PNG is present in an active snapshot directory$/,
        run: ({ world }) => {
          world.snapshot.snapshotDirs[0]?.files.push("obsolete-board-chromium-linux.png");
        },
      },
      {
        pattern:
          /^Given a unit test has a no-op step, an unused step, a broken And pattern, and failFirstProbe disabled$/,
        run: ({ world }) => {
          world.snapshot.unitFiles.push({
            content: `
import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore } from "@client/app/app-store";
defineFeature(test, \`
Feature: Bad
  Scenario: Bad scenario
    Given setup
    When action
    Then result
\`, {
  createWorld: () => ({ store: createAppStore() }),
  failFirstProbe: false,
  stepDefinitions: [
    { pattern: /^Given setup$/, run: () => {} },
    { pattern: /^When action$/, run: ({ world }) => { void world; } },
    { pattern: /^Then result$/, run: ({ assert }) => { assert.equal(1, 1); } },
    { pattern: /^And never matches$/, run: ({ assert }) => { assert.equal(1, 1); } },
  ],
});
`,
            path: "web/tests/unit/bad-steps.bdd.test.ts",
          });
        },
      },
      {
        pattern: /^Given an E2E spec has a skipped test$/,
        run: ({ world }) => {
          world.snapshot.e2eFiles.push({
            content: `
import { test } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";
definePlaywrightFeature(test.skip, \`
Feature: Skipped
  Scenario: Skipped
    When opened
    Then done
\`, {
  createWorld: async () => ({}),
  stepDefinitions: [
    { pattern: /^When opened$/, run: async () => { await Promise.resolve(); } },
    { pattern: /^Then done$/, run: ({ assert }) => { assert.equal(1, 1); } },
  ],
});
`,
            path: "web/tests/e2e/skipped.spec.ts",
          });
        },
      },
      {
        pattern: /^Given an unused test helper file is present$/,
        run: ({ world }) => {
          world.snapshot.helperFiles.push({
            content: "export const dead = true;",
            path: "web/tests/helpers/dead-helper.ts",
          });
        },
      },
      {
        pattern: /^Given a package script references a deleted test file$/,
        run: ({ world }) => {
          world.snapshot.packageScripts["ui:old"] = "playwright test tests/e2e/deleted.spec.ts";
        },
      },
      {
        pattern: /^Given a non-BDD Go test is placed in cli\/tests\/bdd$/,
        run: ({ world }) => {
          world.snapshot.cliBddFiles.push({
            content: "package bdd_test\nfunc TestFallback() {}\n",
            path: "cli/tests/bdd/fallback_test.go",
          });
        },
      },
      {
        pattern: /^Given an orphaned CLI scenario file is present$/,
        run: ({ world }) => {
          world.snapshot.cliBddFiles.push({
            content: "Feature: orphan\n  Scenario: none\n",
            path: "cli/tests/bdd/orphan.scenarios.txt",
          });
        },
      },
      {
        pattern: /^Given a README-scraping CLI BDD test is present$/,
        run: ({ world }) => {
          world.snapshot.cliBddFiles.push(
            {
              content: 'package bdd_test\nconst doc = "README.md"\n',
              path: "cli/tests/bdd/readme_contract.bdd_test.go",
            },
            {
              content: "Feature: readme\n  Scenario: checks readme\n",
              path: "cli/tests/bdd/readme_contract.scenarios.txt",
            }
          );
        },
      },
      {
        pattern: /^When the test hygiene audit runs$/,
        run: ({ world }) => {
          world.result = auditTestHygiene(world.snapshot);
        },
      },
      {
        pattern: /^Then the hygiene audit reports (\d+) violations$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.result?.violations.length, Number(args[0]));
        },
      },
      {
        pattern: /^Then the hygiene audit reports violation code "([^"]+)" for "([^"]+)"$/,
        run: ({ args, assert, world }) => {
          const [code, file] = args;
          const found = Boolean(
            world.result?.violations.some(
              (violation) => violation.code === code && violation.file === file
            )
          );
          assert.equal(
            found,
            true,
            `Expected violation ${code} for ${file}, got: ${JSON.stringify(world.result?.violations)}`
          );
        },
      },
    ],
  }
);
