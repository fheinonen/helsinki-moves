import { test } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";

interface World {
  latestDeparturesRequest?: string;
}

function buildDeparturesPayload(input: {
  destination: string;
  line: string;
  mode: "BUS" | "RAIL";
  selectedStopId: string | null;
  stationName: string;
  stops: Array<{
    code: string;
    distanceMeters: number;
    id: string;
    name: string;
  }>;
}): Record<string, unknown> {
  return {
    filterOptions: {
      destinations: [{ count: 1, value: input.destination }],
      lines: [{ count: 1, value: input.line }],
    },
    mode: input.mode,
    selectedStopId: input.selectedStopId,
    station: {
      departures: [
        {
          departureIso: new Date(Date.now() + 5 * 60_000).toISOString(),
          destination: input.destination,
          line: input.line,
        },
      ],
      distanceMeters: input.stops[0]?.distanceMeters || 80,
      stopCode: input.stops[0]?.code || null,
      stopCodes: input.stops.map((stop) => stop.code),
      stopName: input.stationName,
      type: "stop",
    },
    stops: input.stops.map((stop) => ({
      code: stop.code,
      distanceMeters: stop.distanceMeters,
      id: stop.id,
      memberStopIds: [stop.id],
      name: stop.name,
      stopCodes: [stop.code],
    })),
  };
}

definePlaywrightFeature<World>(
  test,
  `
Feature: Departures interactions

  Scenario: User denied location sees recovery guidance
    Given browser geolocation is denied
    When the user opens the app
    Then the status message is Location access denied.

  Scenario: User switches to bus mode and sees bus departures
    Given departures are mocked by selected mode
    When the user opens the app
    And the user selects BUS mode
    Then the BUS mode button is active
    And the station title is Kamppi Terminal

  Scenario: User changes stop and line filter
    Given departures are mocked with selectable bus stops
    When the user opens the app
    And the user selects BUS mode
    And the user selects stop HSL:STOP_B
    And the user opens the filters
    And the user toggles line filter 560
    Then the latest departures request includes stop HSL:STOP_B
    And the latest departures request includes line 560
    And one departure card is visible
  `,
  {
    createWorld: async () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given browser geolocation is denied$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.addInitScript(() => {
            Object.defineProperty(navigator, "geolocation", {
              configurable: true,
              value: {
                getCurrentPosition(
                  _success: PositionCallback,
                  error?: PositionErrorCallback | null
                ) {
                  error?.({
                    code: 1,
                    message: "denied",
                    PERMISSION_DENIED: 1,
                    POSITION_UNAVAILABLE: 2,
                    TIMEOUT: 3,
                  } as GeolocationPositionError);
                },
              },
            });
          });
        },
      },
      {
        pattern: /^Given departures are mocked by selected mode$/,
        run: async ({ fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/departures**", async (route) => {
            const requestUrl = route.request().url();
            world.latestDeparturesRequest = requestUrl;
            const url = new URL(requestUrl);
            const mode = (url.searchParams.get("mode") || "RAIL").toUpperCase();

            const payload =
              mode === "BUS"
                ? buildDeparturesPayload({
                    destination: "Kamppi",
                    line: "550",
                    mode: "BUS",
                    selectedStopId: "HSL:STOP_A",
                    stationName: "Kamppi Terminal",
                    stops: [
                      {
                        code: "A1",
                        distanceMeters: 80,
                        id: "HSL:STOP_A",
                        name: "Kamppi",
                      },
                    ],
                  })
                : buildDeparturesPayload({
                    destination: "Central",
                    line: "I",
                    mode: "RAIL",
                    selectedStopId: "HSL:STATION_A",
                    stationName: "Central Station",
                    stops: [
                      {
                        code: "1",
                        distanceMeters: 60,
                        id: "HSL:STATION_A",
                        name: "Central",
                      },
                    ],
                  });

            await route.fulfill({
              body: JSON.stringify(payload),
              contentType: "application/json",
              status: 200,
            });
          });
        },
      },
      {
        pattern: /^Given departures are mocked with selectable bus stops$/,
        run: async ({ fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/departures**", async (route) => {
            const requestUrl = route.request().url();
            world.latestDeparturesRequest = requestUrl;
            const url = new URL(requestUrl);
            const mode = (url.searchParams.get("mode") || "RAIL").toUpperCase();
            const stopId = url.searchParams.get("stopId");
            const line = url.searchParams.get("line");

            const payload =
              mode !== "BUS"
                ? buildDeparturesPayload({
                    destination: "Central",
                    line: "I",
                    mode: "RAIL",
                    selectedStopId: "HSL:STATION_A",
                    stationName: "Central Station",
                    stops: [
                      {
                        code: "1",
                        distanceMeters: 60,
                        id: "HSL:STATION_A",
                        name: "Central",
                      },
                    ],
                  })
                : buildDeparturesPayload({
                    destination: stopId === "HSL:STOP_B" ? "Ruoholahti" : "Kamppi",
                    line: line || (stopId === "HSL:STOP_B" ? "560" : "550"),
                    mode: "BUS",
                    selectedStopId: stopId || "HSL:STOP_A",
                    stationName: stopId === "HSL:STOP_B" ? "Ruoholahti" : "Kamppi",
                    stops: [
                      {
                        code: "A1",
                        distanceMeters: 80,
                        id: "HSL:STOP_A",
                        name: "Kamppi",
                      },
                      {
                        code: "B1",
                        distanceMeters: 120,
                        id: "HSL:STOP_B",
                        name: "Ruoholahti",
                      },
                    ],
                  });

            await route.fulfill({
              body: JSON.stringify(payload),
              contentType: "application/json",
              status: 200,
            });
          });
        },
      },
      {
        pattern: /^When the user opens the app$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.goto("/");
        },
      },
      {
        pattern: /^When the user selects BUS mode$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.locator('[data-mode="BUS"]').click();
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
        pattern: /^When the user toggles line filter (.+)$/,
        run: async ({ args, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.locator(`[data-line-filter="${args[0]}"]`).click();
        },
      },
      {
        pattern: /^When the user opens the filters$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.locator("[data-filter-toggle]").click();
          await page.locator("[data-filter-panel]").waitFor({ state: "visible" });
        },
      },
      {
        pattern: /^Then the status message is (.+)$/,
        run: async ({ args, assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForSelector("[data-status]");
          assert.equal(await page.locator("[data-status]").textContent(), args[0]);
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
        pattern: /^Then the station title is (.+)$/,
        run: async ({ args, assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.locator("[data-station-title]").waitFor({ state: "attached" });
          assert.equal(await page.locator("[data-station-title]").textContent(), args[0]);
        },
      },
      {
        pattern: /^Then the latest departures request includes stop (.+)$/,
        run: ({ args, assert, world }) => {
          const url = new URL(world.latestDeparturesRequest || "https://example.test");
          assert.equal(url.searchParams.get("stopId"), args[0]);
        },
      },
      {
        pattern: /^Then the latest departures request includes line (.+)$/,
        run: ({ args, assert, world }) => {
          const url = new URL(world.latestDeparturesRequest || "https://example.test");
          assert.equal(url.searchParams.get("line"), args[0]);
        },
      },
      {
        pattern: /^Then one departure card is visible$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForSelector(".departure-card");
          assert.equal(await page.locator(".departure-card").count(), 1);
        },
      },
    ],
  }
);
