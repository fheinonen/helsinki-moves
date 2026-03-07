import { test } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";

interface World {
  departureCardCount?: number;
}

definePlaywrightFeature<World>(
  test,
  `
Feature: App shell

  Scenario: User opens the app and sees the primary controls
    Given the app shell is opened
    When the user views the primary controls
    Then the mode changer is visible
    And departure cards are visible
  `,
  {
    createWorld: async () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app shell is opened$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/departures**", async (route) => {
            await route.fulfill({
              body: JSON.stringify({
                filterOptions: {
                  destinations: [{ count: 1, value: "Kamppi" }],
                  lines: [{ count: 1, value: "550" }],
                },
                mode: "BUS",
                selectedStopId: "HSL:STOP_A",
                station: {
                  departures: [
                    {
                      departureIso: new Date(Date.now() + 5 * 60_000).toISOString(),
                      destination: "Kamppi",
                      line: "550",
                    },
                  ],
                  distanceMeters: 80,
                  stopCode: "A1",
                  stopCodes: ["A1"],
                  stopName: "Kamppi",
                  type: "stop",
                },
                stops: [],
              }),
              contentType: "application/json",
              status: 200,
            });
          });
          await page.goto("/");
          await page.waitForSelector(".departure-card");
        },
      },
      {
        pattern: /^When the user views the primary controls$/,
        run: async ({ fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          world.departureCardCount = await page.locator(".departure-card").count();
        },
      },
      {
        pattern: /^Then the mode changer is visible$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          assert.equal(await page.locator('[aria-label="Transport mode"]').isVisible(), true);
        },
      },
      {
        pattern: /^Then departure cards are visible$/,
        run: ({ assert, world }) => {
          assert.equal((world.departureCardCount || 0) > 0, true);
        },
      },
    ],
  }
);
