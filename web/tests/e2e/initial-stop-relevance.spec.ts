import { test } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";

interface World {
  departuresCalls: URL[];
}

function buildStopModePayload(url: URL): Record<string, unknown> {
  const requestedStopId = String(url.searchParams.get("stopId") || "").trim();
  const mode = String(url.searchParams.get("mode") || "BUS");
  const selectedId = requestedStopId === "HSL:OLD" ? "HSL:OLD" : "HSL:NEAR";
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
    mode,
    selectedStopId: selectedId,
    station: {
      departures: [
        {
          departureIso: new Date(Date.now() + 5 * 60_000).toISOString(),
          destination: isOld ? "Old Terminal" : "Central Railway Station",
          line: isOld ? "550" : "20",
        },
      ],
      distanceMeters: isOld ? 0 : 80,
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
        lat: 60.17,
        lon: 24.94,
        memberStopIds: ["HSL:NEAR"],
        name: "Nearest Stop",
        stopCodes: ["N100"],
      },
      {
        code: "O200",
        distanceMeters: 0,
        id: "HSL:OLD",
        lat: 60.2,
        lon: 24.9,
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
Feature: Bookmarked query

  Scenario: A bookmark restores mode, stop, line, and destination without device location
    Given browser geolocation is counted for bookmarks
    And departures reflect the requested stop and mode
    When the page is opened with a bookmarked bus query
    Then the first departures request stop id equals HSL:OLD
    And the first departures request omits coordinates
    And geolocation call count is 0
    And the station title is Old Terminal
    And the BUS mode button is active
    And current URL stop query equals HSL:OLD
    And current URL line filter equals 550
    And current URL destination filter equals Old Terminal
    And line filter 550 is active

  Scenario: Refresh loads departures from the device location
    Given browser geolocation is counted for bookmarks
    And departures reflect the requested stop and mode
    When the page is opened with a bookmarked bus query
    And the user refreshes nearby departures
    Then geolocation call count is 1
    And the latest departures request omits stop id
    And the latest departures request coordinates are 60.1699|24.9384
    And the station title is Nearest Stop

  Scenario: Changing mode searches from the bookmarked stop
    Given browser geolocation is counted for bookmarks
    And departures reflect the requested stop and mode
    When the page is opened with a bookmarked bus query
    And the user selects tram mode
    Then geolocation call count is 0
    And the latest departures request mode is TRAM
    And the latest departures request omits stop id
    And the latest departures request coordinates are 60.2|24.9
  `,
  {
    createWorld: async () => ({
      departuresCalls: [],
    }),
    stepDefinitions: [
      {
        pattern: /^Given browser geolocation is counted for bookmarks$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.addInitScript(() => {
            const counter = { calls: 0 };
            Object.defineProperty(window, "__geoCalls", {
              configurable: true,
              value: () => counter.calls,
            });
            Object.defineProperty(navigator, "geolocation", {
              configurable: true,
              value: {
                getCurrentPosition(success: PositionCallback) {
                  counter.calls += 1;
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
        pattern: /^Given departures reflect the requested stop and mode$/,
        run: async ({ fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/departures**", async (route) => {
            const url = new URL(route.request().url());
            world.departuresCalls.push(url);
            await route.fulfill({
              body: JSON.stringify(buildStopModePayload(url)),
              contentType: "application/json",
              status: 200,
            });
          });
        },
      },
      {
        pattern: /^When the page is opened with a bookmarked bus query$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.goto("/?mode=bus&stop=HSL:OLD&line=550&dest=Old%20Terminal");
          await page.waitForFunction(() => {
            const element = document.querySelector("[data-station-title]");
            return element?.textContent === "Old Terminal";
          });
        },
      },
      {
        pattern: /^When the user refreshes nearby departures$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.locator("[data-refresh]").click();
        },
      },
      {
        pattern: /^When the user selects tram mode$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.locator('[data-mode="TRAM"]').click();
        },
      },
      {
        pattern: /^Then the first departures request stop id equals (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.departuresCalls[0]?.searchParams.get("stopId"), args[0]);
        },
      },
      {
        pattern: /^Then the first departures request omits coordinates$/,
        run: ({ assert, world }) => {
          assert.equal(world.departuresCalls[0]?.searchParams.has("lat"), false);
          assert.equal(world.departuresCalls[0]?.searchParams.has("lon"), false);
        },
      },
      {
        pattern: /^Then geolocation call count is (\d+)$/,
        run: async ({ args, assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const calls = await page.evaluate(() => {
            const readCalls = (window as unknown as { __geoCalls?: () => number }).__geoCalls;
            return readCalls ? readCalls() : -1;
          });
          assert.equal(calls, Number(args[0]));
        },
      },
      {
        pattern: /^Then the station title is (.+)$/,
        run: async ({ args, assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForFunction(
            (title) => document.querySelector("[data-station-title]")?.textContent === title,
            args[0]
          );
          assert.equal(await page.locator("[data-station-title]").textContent(), args[0]);
        },
      },
      {
        pattern: /^Then the BUS mode button is active$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          assert.equal(await page.locator('[data-mode="BUS"]').getAttribute("aria-checked"), "true");
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
        pattern: /^Then current URL line filter equals (.+)$/,
        run: async ({ args, assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForFunction(
            (line) => new URL(window.location.href).searchParams.getAll("line").join("|") === line,
            args[0]
          );
          assert.equal(new URL(page.url()).searchParams.getAll("line").join("|"), args[0]);
        },
      },
      {
        pattern: /^Then current URL destination filter equals (.+)$/,
        run: async ({ args, assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForFunction(
            (destination) => new URL(window.location.href).searchParams.getAll("dest").join("|") === destination,
            args[0]
          );
          assert.equal(new URL(page.url()).searchParams.getAll("dest").join("|"), args[0]);
        },
      },
      {
        pattern: /^Then line filter (.+) is active$/,
        run: async ({ args, assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const chip = page.locator(`[data-line-filter="${args[0]}"]`);
          await chip.waitFor({ state: "attached" });
          assert.equal(await chip.evaluate((element) => element.classList.contains("is-active")), true);
        },
      },
      {
        pattern: /^Then the latest departures request omits stop id$/,
        run: ({ assert, world }) => {
          const latest = world.departuresCalls[world.departuresCalls.length - 1];
          assert.equal(latest?.searchParams.has("stopId"), false);
        },
      },
      {
        pattern: /^Then the latest departures request coordinates are (.+)$/,
        run: ({ args, assert, world }) => {
          const latest = world.departuresCalls[world.departuresCalls.length - 1];
          assert.equal(`${latest?.searchParams.get("lat")}|${latest?.searchParams.get("lon")}`, args[0]);
        },
      },
      {
        pattern: /^Then the latest departures request mode is (.+)$/,
        run: ({ args, assert, world }) => {
          const latest = world.departuresCalls[world.departuresCalls.length - 1];
          assert.equal(latest?.searchParams.get("mode"), args[0]);
        },
      },
    ],
  }
);
