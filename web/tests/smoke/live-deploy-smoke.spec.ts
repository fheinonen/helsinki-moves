import { test } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";

definePlaywrightFeature(
  test,
  `
Feature: Live deploy smoke

  Scenario: Live deployment loads the shell and primary controls
    When the live deployment home page is opened
    Then the mode changer is visible
    And the refresh action is visible
    And the voice action is visible

  Scenario: Live deployment allows switching to bus mode
    When the live deployment home page is opened
    And the user selects BUS mode in the live deployment
    Then the BUS mode button is active
  `,
  {
    createWorld: async () => ({}),
    stepDefinitions: [
      {
        pattern: /^When the live deployment home page is opened$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.goto("/");
        },
      },
      {
        pattern: /^Then the mode changer is visible$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          assert.equal(await page.locator('[role="radiogroup"]').isVisible(), true);
        },
      },
      {
        pattern: /^(?:Then|And) the refresh action is visible$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          assert.equal(await page.locator("[data-refresh]").isVisible(), true);
        },
      },
      {
        pattern: /^(?:Then|And) the voice action is visible$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          assert.equal(await page.locator("[data-voice-action]").isVisible(), true);
        },
      },
      {
        pattern: /^And the user selects BUS mode in the live deployment$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.locator('[data-mode="BUS"]').click();
        },
      },
      {
        pattern: /^Then the BUS mode button is active$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          assert.equal(await page.locator('[data-mode="BUS"]').getAttribute("aria-checked"), "true");
        },
      },
    ],
  }
);
