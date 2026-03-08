import { test } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";
import { installFixedNow } from "@tests/helpers/install-fixed-now";

const FIXED_NOW_MS = Date.parse("2026-03-07T12:32:07.000Z");

function buildPayload() {
  return {
    filterOptions: {
      destinations: [
        { count: 2, value: "Kamppi via Töölö" },
        { count: 1, value: "Pasila" },
      ],
      lines: [
        { count: 3, value: "18" },
      ],
    },
    mode: "BUS",
    selectedStopId: "HSL:TALONTIE",
    station: {
      departures: [
        {
          departureIso: new Date(FIXED_NOW_MS + 4 * 60_000).toISOString(),
          destination: "Kamppi via Töölö",
          line: "18",
        },
        {
          departureIso: new Date(FIXED_NOW_MS + 7 * 60_000).toISOString(),
          destination: "Kamppi via To\u0308o\u0308lo\u0308",
          line: "18",
        },
        {
          departureIso: new Date(FIXED_NOW_MS + 9 * 60_000).toISOString(),
          destination: "Pasila",
          line: "18",
        },
      ],
      distanceMeters: 140,
      stopCode: "1234",
      stopCodes: ["1234"],
      stopName: "Talontie",
      type: "stop",
    },
    stops: [
      {
        code: "1234",
        distanceMeters: 140,
        id: "HSL:TALONTIE",
        memberStopIds: ["HSL:TALONTIE"],
        name: "Talontie",
        stopCodes: ["1234"],
      },
    ],
  };
}

definePlaywrightFeature(
  test,
  `
Feature: Destination filter normalization

  Scenario: Destination filter keeps visually matching departures visible
    Given destination filter normalization mocks are installed
    And deterministic time is configured for destination filtering
    When the app is opened in mobile viewport for destination filtering
    And the user opens the filters for destination filtering
    And the user selects destination filter Kamppi via Töölö
    Then two departure cards are visible after destination filtering
    And the filtered departures stay in departure order
  `,
  {
    createWorld: async () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given destination filter normalization mocks are installed$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/departures**", async (route) => {
            const url = new URL(route.request().url());
            const destination = url.searchParams.get("dest");
            const payload = buildPayload();
            if (destination === "Kamppi via Töölö") {
              payload.station.departures = payload.station.departures.slice(0, 2);
            }
            await route.fulfill({
              body: JSON.stringify(payload),
              contentType: "application/json",
              status: 200,
            });
          });
        },
      },
      {
        pattern: /^(?:Given|And) deterministic time is configured for destination filtering$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await installFixedNow(page, FIXED_NOW_MS);
        },
      },
      {
        pattern: /^When the app is opened in mobile viewport for destination filtering$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.setViewportSize({ width: 390, height: 844 });
          await page.goto("/?mode=bus");
          await page.waitForSelector(".departure-card");
        },
      },
      {
        pattern: /^(?:When|And) the user opens the filters for destination filtering$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.locator("[data-filter-toggle]").click();
          await page.locator("[data-filter-panel]").waitFor({ state: "visible" });
        },
      },
      {
        pattern: /^(?:When|And) the user selects destination filter (.+)$/,
        run: async ({ args, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.locator(`[data-destination-filter="${args[0]}"]`).click();
          await page.waitForLoadState("networkidle");
        },
      },
      {
        pattern: /^Then two departure cards are visible after destination filtering$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          assert.equal(await page.locator(".departure-card").count(), 2);
        },
      },
      {
        pattern: /^(?:Then|And) the filtered departures stay in departure order$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const destinations = await page.locator(".departure-card__destination").evaluateAll((elements) =>
            elements.map((element) => element.textContent?.trim() || "")
          );
          const times = await page.locator(".departure-card__time").evaluateAll((elements) =>
            elements.map((element) => element.textContent?.trim() || "")
          );
          assert.equal(destinations.join("|"), "Kamppi via Töölö|Kamppi via To\u0308o\u0308lo\u0308");
          assert.equal(times.join("|"), "4m|7m");
        },
      },
    ],
  }
);
