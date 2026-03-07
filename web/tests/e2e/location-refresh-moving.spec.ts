import { test } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";

interface World {
  latestLat?: string | null;
  latestLon?: string | null;
}

function buildDeparturesPayload(input: {
  distanceMeters: number;
  stationName: string;
  stopCode: string;
  stopId: string;
  line: string;
}): Record<string, unknown> {
  return {
    filterOptions: {
      destinations: [{ count: 1, value: "Pasila" }],
      lines: [{ count: 1, value: input.line }],
    },
    mode: "BUS",
    selectedStopId: input.stopId,
    station: {
      departures: [
        {
          departureIso: new Date(Date.now() + 5 * 60_000).toISOString(),
          destination: "Pasila",
          line: input.line,
        },
      ],
      distanceMeters: input.distanceMeters,
      stopCode: input.stopCode,
      stopCodes: [input.stopCode],
      stopName: input.stationName,
      type: "stop",
    },
    stops: [
      {
        code: input.stopCode,
        distanceMeters: input.distanceMeters,
        id: input.stopId,
        memberStopIds: [input.stopId],
        name: input.stationName,
        stopCodes: [input.stopCode],
      },
    ],
  };
}

function classifyLocation(lat: number, lon: number) {
  const nearPasila =
    Math.abs(lat - 60.1997) < 0.01 &&
    Math.abs(lon - 24.9354) < 0.02;

  if (nearPasila) {
    return buildDeparturesPayload({
      distanceMeters: 120,
      line: "23",
      stationName: "Pasila station",
      stopCode: "P100",
      stopId: "HSL:PASILA",
    });
  }

  return buildDeparturesPayload({
    distanceMeters: 980,
    line: "52",
    stationName: "Huopalahti station",
    stopCode: "H200",
    stopId: "HSL:HUOPA",
  });
}

definePlaywrightFeature<World>(
  test,
  `
Feature: Moving location refresh

  Scenario: Refresh location updates nearest stop after movement
    Given browser geolocation starts at 60.2220 and 24.8990
    And departures are mocked by request coordinates
    When the user opens the app
    Then the station title is Huopalahti station
    When browser geolocation moves to 60.1997 and 24.9354
    And the user taps refresh location
    Then the latest departures request latitude is 60.1997
    And the latest departures request longitude is 24.9354
    And the station title is Pasila station
  `,
  {
    createWorld: async () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given browser geolocation starts at 60\.2220 and 24\.8990$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.addInitScript(() => {
            type GeoState = {
              lat: number;
              lon: number;
            };

            const state: GeoState = {
              lat: 60.222,
              lon: 24.899,
            };

            Object.defineProperty(window, "__setTestGeolocation", {
              configurable: true,
              value: (lat: number, lon: number) => {
                state.lat = lat;
                state.lon = lon;
              },
            });

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
                      latitude: state.lat,
                      longitude: state.lon,
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
        pattern: /^Given departures are mocked by request coordinates$/,
        run: async ({ fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/departures**", async (route) => {
            const requestUrl = new URL(route.request().url());
            const lat = Number(requestUrl.searchParams.get("lat"));
            const lon = Number(requestUrl.searchParams.get("lon"));
            world.latestLat = requestUrl.searchParams.get("lat");
            world.latestLon = requestUrl.searchParams.get("lon");
            await route.fulfill({
              body: JSON.stringify(classifyLocation(lat, lon)),
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
        pattern: /^Then the station title is Huopalahti station$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForFunction(() => {
            const element = document.querySelector("[data-station-title]");
            return element?.textContent === "Huopalahti station";
          });
          assert.equal(await page.locator("[data-station-title]").textContent(), "Huopalahti station");
        },
      },
      {
        pattern: /^When browser geolocation moves to 60\.1997 and 24\.9354$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.evaluate(() => {
            (window as typeof window & {
              __setTestGeolocation?: (lat: number, lon: number) => void;
            }).__setTestGeolocation?.(60.1997, 24.9354);
          });
        },
      },
      {
        pattern: /^When the user taps refresh location$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.locator("[data-refresh]").click();
        },
      },
      {
        pattern: /^Then the latest departures request latitude is 60\.1997$/,
        run: ({ assert, world }) => {
          assert.equal(world.latestLat, "60.1997");
        },
      },
      {
        pattern: /^Then the latest departures request longitude is 24\.9354$/,
        run: ({ assert, world }) => {
          assert.equal(world.latestLon, "24.9354");
        },
      },
      {
        pattern: /^Then the station title is Pasila station$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForFunction(() => {
            const element = document.querySelector("[data-station-title]");
            return element?.textContent === "Pasila station";
          });
          assert.equal(await page.locator("[data-station-title]").textContent(), "Pasila station");
        },
      },
    ],
  }
);
