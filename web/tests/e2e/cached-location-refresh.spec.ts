import { test } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";

interface World {
  deviceLat?: number;
  deviceLon?: number;
}

function stationNameFor(lat: number, lon: number): string {
  if (Math.abs(lat - 60.222) < 0.001 && Math.abs(lon - 24.899) < 0.001) {
    return "Huopalahti station";
  }
  if (Math.abs(lat - 60.1997) < 0.001 && Math.abs(lon - 24.9354) < 0.001) {
    return "Pasila station";
  }
  if (Math.abs(lat - 60.3) < 0.001 && Math.abs(lon - 24.95) < 0.001) {
    return "Malmi station";
  }
  return "Unknown station";
}

function buildDeparturesPayload(lat: number, lon: number): Record<string, unknown> {
  const stopName = stationNameFor(lat, lon);
  return {
    filterOptions: { destinations: [], lines: [] },
    mode: "BUS",
    selectedStopId: stopName,
    station: {
      departures: [
        {
          departureIso: new Date(Date.now() + 5 * 60_000).toISOString(),
          destination: "Center",
          line: "23",
        },
      ],
      distanceMeters: 40,
      stopCode: "X",
      stopCodes: ["X"],
      stopName,
      type: "stop",
    },
    stops: [
      {
        code: "X",
        distanceMeters: 40,
        id: stopName,
        lat,
        lon,
        memberStopIds: [stopName],
        name: stopName,
        stopCodes: ["X"],
      },
    ],
  };
}

definePlaywrightFeature<World>(
  test,
  `
Feature: Cached location refresh

  Scenario: Refresh follows the device after it moves
    Given a device at 60.222 and 24.899 that repeats its first fix until a fresh location is requested
    And departures follow the coordinates sent by the page
    When the user opens the app
    Then the station title is Huopalahti station
    When the device moves to 60.1997 and 24.9354
    And the user presses refresh
    Then the station title is Pasila station
    When the device moves to 60.3 and 24.95
    And the user presses refresh
    Then the station title is Malmi station
  `,
  {
    createWorld: async () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a device at 60\.222 and 24\.899 that repeats its first fix until a fresh location is requested$/,
        run: async ({ fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          world.deviceLat = 60.222;
          world.deviceLon = 24.899;
          await page.addInitScript(() => {
            const state = {
              lat: 60.222,
              lon: 24.899,
              network: null as { lat: number; lon: number } | null,
            };

            Object.defineProperty(window, "__moveTestDevice", {
              configurable: true,
              value: (lat: number, lon: number) => {
                state.lat = lat;
                state.lon = lon;
              },
            });

            Object.defineProperty(navigator, "geolocation", {
              configurable: true,
              value: {
                getCurrentPosition(success: PositionCallback, _error?: PositionErrorCallback | null, options?: PositionOptions) {
                  const accurate = options?.enableHighAccuracy === true;
                  if (!accurate && !state.network) {
                    state.network = { lat: state.lat, lon: state.lon };
                  }
                  const point = accurate ? { lat: state.lat, lon: state.lon } : state.network;
                  success({
                    coords: {
                      accuracy: 20,
                      altitude: null,
                      altitudeAccuracy: null,
                      heading: null,
                      latitude: point?.lat ?? state.lat,
                      longitude: point?.lon ?? state.lon,
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
        pattern: /^Given departures follow the coordinates sent by the page$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/departures**", async (route) => {
            const requestUrl = new URL(route.request().url());
            const lat = Number(requestUrl.searchParams.get("lat"));
            const lon = Number(requestUrl.searchParams.get("lon"));
            await route.fulfill({
              body: JSON.stringify(buildDeparturesPayload(lat, lon)),
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
        pattern: /^Then the station title is (.+)$/,
        run: async ({ args, assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const expected = args[0];
          await page.waitForFunction(() => {
            const title = document.querySelector("[data-station-title]")?.textContent || "";
            return title.length > 0;
          });
          assert.equal(await page.locator("[data-station-title]").textContent(), expected);
        },
      },
      {
        pattern: /^When the device moves to ([\d.]+) and ([\d.]+)$/,
        run: async ({ args, fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          world.deviceLat = Number(args[0]);
          world.deviceLon = Number(args[1]);
          await page.evaluate(([lat, lon]) => {
            (window as typeof window & {
              __moveTestDevice?: (nextLat: number, nextLon: number) => void;
            }).__moveTestDevice?.(lat, lon);
          }, [world.deviceLat, world.deviceLon] as [number, number]);
        },
      },
      {
        pattern: /^When the user presses refresh$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const response = page.waitForResponse((candidate) => candidate.url().includes("/api/v1/departures"));
          await page.locator("[data-refresh]").click();
          await response;
        },
      },
    ],
  }
);
