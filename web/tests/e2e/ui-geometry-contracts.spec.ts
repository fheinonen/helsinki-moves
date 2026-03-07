import { test } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";
import { installFixedNow } from "@tests/helpers/install-fixed-now";

const FIXED_NOW_MS = Date.parse("2026-03-07T10:00:00.000Z");

function buildPayload() {
  return {
    filterOptions: {
      destinations: [
        { count: 1, value: "Kamppi" },
        { count: 1, value: "Ruoholahti" },
      ],
      lines: [
        { count: 1, value: "550" },
        { count: 1, value: "560" },
      ],
    },
    mode: "BUS",
    selectedStopId: "HSL:STOP_A",
    station: {
      departures: [
        {
          departureIso: new Date(FIXED_NOW_MS + 5 * 60_000).toISOString(),
          destination: "Kamppi",
          line: "550",
        },
        {
          departureIso: new Date(FIXED_NOW_MS + 8 * 60_000).toISOString(),
          destination: "Ruoholahti",
          line: "560",
        },
      ],
      distanceMeters: 80,
      stopCode: "A1",
      stopCodes: ["A1"],
      stopName: "Kamppi",
      type: "stop",
    },
    stops: [
      {
        code: "A1",
        distanceMeters: 80,
        id: "HSL:STOP_A",
        memberStopIds: ["HSL:STOP_A"],
        name: "Kamppi",
        stopCodes: ["A1"],
      },
      {
        code: "B1",
        distanceMeters: 120,
        id: "HSL:STOP_B",
        memberStopIds: ["HSL:STOP_B"],
        name: "Ruoholahti",
        stopCodes: ["B1"],
      },
    ],
  };
}

definePlaywrightFeature(
  test,
  `
Feature: UI geometry contracts

  Scenario: Desktop shell keeps controls and cards visible
    Given deterministic UI mocks are installed
    And deterministic time is configured
    When the app is opened in desktop viewport
    Then the stop selector is visible
    And the filter controls stay visible
    And departure cards stay visible

  Scenario: Mobile shell keeps controls and cards visible
    Given deterministic UI mocks are installed
    And deterministic time is configured
    When the app is opened in mobile viewport
    Then the stop selector is visible
    And the filter controls stay visible
    And departure cards stay visible
  `,
  {
    createWorld: async () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given deterministic UI mocks are installed$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/departures**", async (route) => {
            await route.fulfill({
              body: JSON.stringify(buildPayload()),
              contentType: "application/json",
              status: 200,
            });
          });
        },
      },
      {
        pattern: /^Given deterministic time is configured$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await installFixedNow(page, FIXED_NOW_MS);
        },
      },
      {
        pattern: /^When the app is opened in desktop viewport$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.setViewportSize({ width: 1280, height: 960 });
          await page.goto("/");
          await page.waitForSelector(".departure-card");
        },
      },
      {
        pattern: /^When the app is opened in mobile viewport$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.setViewportSize({ width: 390, height: 844 });
          await page.goto("/");
          await page.waitForSelector(".departure-card");
        },
      },
      {
        pattern: /^Then the stop selector is visible$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          assert.equal(await page.locator("[data-stop-select]").isVisible(), true);
        },
      },
      {
        pattern: /^Then the filter controls stay visible$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          assert.equal(await page.locator("[data-filter-summary]").isVisible(), true);
          assert.equal(await page.locator("[data-line-filter]").first().isVisible(), true);
        },
      },
      {
        pattern: /^Then departure cards stay visible$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          assert.equal((await page.locator(".departure-card").count()) >= 1, true);
        },
      },
    ],
  }
);
