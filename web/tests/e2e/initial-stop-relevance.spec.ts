import { test } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";

interface World {
  departuresCalls: URL[];
}

function buildStopModePayload(selectedStopId: string): Record<string, unknown> {
  const selectedId = selectedStopId === "HSL:OLD" ? "HSL:OLD" : "HSL:NEAR";
  const isOld = selectedId === "HSL:OLD";

  return {
    filterOptions: isOld
      ? {
          destinations: [{ count: 1, value: "Old Terminal" }],
          lines: [{ count: 1, value: "550" }],
        }
      : {
          destinations: [{ count: 1, value: "Central Railway Station" }],
          lines: [{ count: 1, value: "20" }],
        },
    mode: "BUS",
    selectedStopId: selectedId,
    station: {
      departures: [
        {
          departureIso: new Date(Date.now() + 5 * 60_000).toISOString(),
          destination: isOld ? "Old Terminal" : "Central Railway Station",
          line: isOld ? "550" : "20",
        },
      ],
      distanceMeters: isOld ? 620 : 80,
      stopCode: isOld ? "O200" : "N100",
      stopCodes: [isOld ? "O200" : "N100"],
      stopName: isOld ? "Old Terminal" : "Nearest Stop",
      type: "stop",
    },
    stops: [
      {
        code: "N100",
        distanceMeters: 80,
        id: "HSL:NEAR",
        memberStopIds: ["HSL:NEAR"],
        name: "Nearest Stop",
        stopCodes: ["N100"],
      },
      {
        code: "O200",
        distanceMeters: 620,
        id: "HSL:OLD",
        memberStopIds: ["HSL:OLD"],
        name: "Old Terminal",
        stopCodes: ["O200"],
      },
    ],
  };
}

definePlaywrightFeature<World>(
  test,
  `
Feature: Stop-mode relevance

  Scenario: First stop-mode load ignores stale stop context and picks nearest stop
    Given browser geolocation is fixed for stop relevance
    And departures reflect the requested stop context
    When the page is opened with stale bus stop query filters
    Then first departures request omits stop id
    And the station title is Nearest Stop
    And current URL stop query equals HSL:NEAR
    And current URL has no line or destination filters

  Scenario: Stop context is restored only after explicit user re-selection
    Given browser geolocation is fixed for stop relevance
    And departures reflect the requested stop context
    When the page is opened with stale bus stop query filters
    And the user selects stop HSL:OLD
    Then first departures request omits stop id
    And second departures request stop id equals HSL:OLD
    And the station title is Old Terminal
    And current URL stop query equals HSL:OLD
  `,
  {
    createWorld: async () => ({
      departuresCalls: [],
    }),
    stepDefinitions: [
      {
        pattern: /^Given browser geolocation is fixed for stop relevance$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.addInitScript(() => {
            Object.defineProperty(navigator, "geolocation", {
              configurable: true,
              value: {
                getCurrentPosition(success: PositionCallback) {
                  success({
                    coords: {
                      accuracy: 20,
                      altitude: null,
                      altitudeAccuracy: null,
                      heading: null,
                      latitude: 60.1699,
                      longitude: 24.9384,
                      speed: null,
                      toJSON() {
                        return {};
                      },
                    },
                    timestamp: Date.now(),
                    toJSON() {
                      return {};
                    },
                  } as GeolocationPosition);
                },
              },
            });
          });
        },
      },
      {
        pattern: /^Given departures reflect the requested stop context$/,
        run: async ({ fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/departures**", async (route) => {
            const url = new URL(route.request().url());
            world.departuresCalls.push(url);
            const requestedStopId = String(url.searchParams.get("stopId") || "").trim();
            await route.fulfill({
              body: JSON.stringify(buildStopModePayload(requestedStopId)),
              contentType: "application/json",
              status: 200,
            });
          });
        },
      },
      {
        pattern: /^When the page is opened with stale bus stop query filters$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.goto("/?mode=bus&stop=HSL:OLD&line=550&dest=Old%20Terminal");
        },
      },
      {
        pattern: /^When the user selects stop (.+)$/,
        run: async ({ args, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.locator("[data-stop-select]").click();
          await page.locator(`[data-stop-option="${args[0]}"]`).click();
        },
      },
      {
        pattern: /^Then first departures request omits stop id$/,
        run: ({ assert, world }) => {
          assert.equal(world.departuresCalls[0]?.searchParams.has("stopId"), false);
        },
      },
      {
        pattern: /^Then second departures request stop id equals (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.departuresCalls[1]?.searchParams.get("stopId"), args[0]);
        },
      },
      {
        pattern: /^Then the station title is Nearest Stop$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForFunction(() => {
            const element = document.querySelector("[data-station-title]");
            return element?.textContent === "Nearest Stop";
          });
          assert.equal(await page.locator("[data-station-title]").textContent(), "Nearest Stop");
        },
      },
      {
        pattern: /^Then the station title is Old Terminal$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForFunction(() => {
            const element = document.querySelector("[data-station-title]");
            return element?.textContent === "Old Terminal";
          });
          assert.equal(await page.locator("[data-station-title]").textContent(), "Old Terminal");
        },
      },
      {
        pattern: /^Then current URL stop query equals (.+)$/,
        run: async ({ args, assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForFunction(
            (expectedStopId) => new URL(window.location.href).searchParams.get("stop") === expectedStopId,
            args[0]
          );
          assert.equal(new URL(page.url()).searchParams.get("stop"), args[0]);
        },
      },
      {
        pattern: /^Then current URL has no line or destination filters$/,
        run: ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const params = new URL(page.url()).searchParams;
          assert.equal(params.getAll("line").length, 0);
          assert.equal(params.getAll("dest").length, 0);
        },
      },
    ],
  }
);
