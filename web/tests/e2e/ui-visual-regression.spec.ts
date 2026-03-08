import { test, expect } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";
import { installFixedNow } from "@tests/helpers/install-fixed-now";

const FIXED_NOW_MS = Date.parse("2026-03-07T12:32:07.000Z");

function buildPayload() {
  return {
    filterOptions: {
      destinations: [
        { count: 2, value: "Kamppi" },
        { count: 1, value: "Ruoholahti" },
        { count: 1, value: "Eira" },
      ],
      lines: [
        { count: 2, value: "14" },
        { count: 1, value: "18" },
        { count: 1, value: "21" },
        { count: 1, value: "63" },
        { count: 1, value: "65A" },
        { count: 1, value: "8" },
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
          stopCode: "A1",
        },
        {
          departureIso: new Date(FIXED_NOW_MS + 8 * 60_000).toISOString(),
          destination: "Ruoholahti",
          line: "560",
          stopCode: "A1",
        },
        {
          departureIso: new Date(FIXED_NOW_MS + 2 * 60_000).toISOString(),
          destination: "Eira",
          line: "18",
          stopCode: "A2",
        },
        {
          departureIso: new Date(FIXED_NOW_MS + 14 * 60_000).toISOString(),
          destination: "Rautatientori",
          line: "65A",
          stopCode: "A3",
        },
        {
          departureIso: new Date(FIXED_NOW_MS + 18 * 60_000).toISOString(),
          destination: "Lauttasaari",
          line: "14",
          stopCode: "A1",
        },
        {
          departureIso: new Date(FIXED_NOW_MS + 22 * 60_000).toISOString(),
          destination: "Kamppi",
          line: "14",
          stopCode: "A2",
        },
        {
          departureIso: new Date(FIXED_NOW_MS + 25 * 60_000).toISOString(),
          destination: "Herttoniemi",
          line: "21",
          stopCode: "A3",
        },
        {
          departureIso: new Date(FIXED_NOW_MS + 30 * 60_000).toISOString(),
          destination: "Ruskeasuo",
          line: "63",
          stopCode: "A1",
        },
        {
          departureIso: new Date(FIXED_NOW_MS + 35 * 60_000).toISOString(),
          destination: "Toolo",
          line: "8",
          stopCode: "A2",
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
Feature: UI visual regression

  Scenario: Desktop shell matches the approved baseline
    Given deterministic visual mocks are installed
    And deterministic time is configured for visual checks
    When the app is opened in desktop viewport for visual checks
    Then the desktop app shell matches the approved baseline

  Scenario: Mobile shell matches the approved baseline
    Given deterministic visual mocks are installed
    And deterministic time is configured for visual checks
    When the app is opened in mobile viewport for visual checks
    Then the mobile app shell matches the approved baseline
  `,
  {
    createWorld: async () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given deterministic visual mocks are installed$/,
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
        pattern: /^Given deterministic time is configured for visual checks$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await installFixedNow(page, FIXED_NOW_MS);
        },
      },
      {
        pattern: /^When the app is opened in desktop viewport for visual checks$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.setViewportSize({ width: 1280, height: 960 });
          await page.goto("/");
          await page.waitForSelector(".departure-card");
        },
      },
      {
        pattern: /^When the app is opened in mobile viewport for visual checks$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.setViewportSize({ width: 390, height: 844 });
          await page.goto("/");
          await page.waitForSelector(".departure-card");
        },
      },
      {
        pattern: /^Then the desktop app shell matches the approved baseline$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          assert.equal(true, true);
          await expect(page.locator(".app-shell")).toHaveScreenshot("app-shell-desktop.png", {
            animations: "disabled",
            caret: "hide",
            scale: "css",
            maxDiffPixels: 120,
          });
        },
      },
      {
        pattern: /^Then the mobile app shell matches the approved baseline$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          assert.equal(true, true);
          await expect(page.locator(".app-shell")).toHaveScreenshot("app-shell-mobile.png", {
            animations: "disabled",
            caret: "hide",
            scale: "css",
            maxDiffPixels: 120,
          });
        },
      },
    ],
  }
);
