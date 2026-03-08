import { test } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";

interface World {
  refreshGetCurrentPositionCallCountStart?: number;
  latestLat?: string | null;
  latestLon?: string | null;
}

function buildDeparturesPayload(): Record<string, unknown> {
  return {
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
    stops: [
      {
        code: "A1",
        distanceMeters: 80,
        id: "HSL:STOP_A",
        memberStopIds: ["HSL:STOP_A"],
        name: "Kamppi",
        stopCodes: ["A1"],
      },
    ],
  };
}

definePlaywrightFeature<World>(
  test,
  `
Feature: Location refresh fallback

  Scenario: Refresh reuses the last known location when geolocation becomes unavailable
    Given browser geolocation starts at 60.17 and 24.94
    And departures are mocked by request coordinates
    When the user opens the app
    Then the station title is Kamppi
    When geolocation becomes unavailable
    And the user taps refresh location
    Then geolocation refresh retries once with high accuracy
    Then the latest departures request latitude is 60.17
    And the latest departures request longitude is 24.94
    And the station title is Kamppi
  `,
  {
    createWorld: async () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given browser geolocation starts at 60\.17 and 24\.94$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.addInitScript(() => {
            type GeoState = {
              lat: number;
              lon: number;
              mode: "ok" | "unavailable";
            };

            const state: GeoState = {
              lat: 60.17,
              lon: 24.94,
              mode: "ok",
            };

            Object.defineProperty(window, "__testGeoState", {
              configurable: true,
              value: state,
              writable: true,
            });

            Object.defineProperty(window, "__setTestGeolocationMode", {
              configurable: true,
              value: (mode: string) => {
                state.mode = mode === "unavailable" ? "unavailable" : "ok";
              },
            });

            Object.defineProperty(window, "__testGeoCalls", {
              configurable: true,
              value: [],
              writable: true,
            });

            Object.defineProperty(navigator, "geolocation", {
              configurable: true,
              value: {
                getCurrentPosition(
                  success: PositionCallback,
                  error?: PositionErrorCallback | null,
                  options?: PositionOptions
                ) {
                  (
                    window as typeof window & {
                      __testGeoCalls?: Array<{
                        enableHighAccuracy: boolean;
                        type: string;
                      }>;
                    }
                  ).__testGeoCalls?.push({
                    enableHighAccuracy: options?.enableHighAccuracy === true,
                    type: "getCurrentPosition",
                  });
                  if (state.mode === "unavailable") {
                    error?.({
                      code: 2,
                      message: "unavailable",
                      PERMISSION_DENIED: 1,
                      POSITION_UNAVAILABLE: 2,
                      TIMEOUT: 3,
                    } as GeolocationPositionError);
                    return;
                  }
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
            world.latestLat = requestUrl.searchParams.get("lat");
            world.latestLon = requestUrl.searchParams.get("lon");
            await route.fulfill({
              body: JSON.stringify(buildDeparturesPayload()),
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
        pattern: /^Then the station title is Kamppi$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForFunction(() => {
            const element = document.querySelector("[data-station-title]");
            return element?.textContent === "Kamppi";
          });
          assert.equal(await page.locator("[data-station-title]").textContent(), "Kamppi");
        },
      },
      {
        pattern: /^When geolocation becomes unavailable$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.evaluate(() => {
            (window as typeof window & {
              __setTestGeolocationMode?: (mode: string) => void;
            }).__setTestGeolocationMode?.("unavailable");
          });
        },
      },
      {
        pattern: /^When the user taps refresh location$/,
        run: async ({ fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          world.refreshGetCurrentPositionCallCountStart = await page.evaluate(() => {
            const calls =
              (
                window as typeof window & {
                  __testGeoCalls?: Array<{ type: string }>;
                }
              ).__testGeoCalls || [];
            return calls.filter((call) => call?.type === "getCurrentPosition").length;
          });
          await page.locator("[data-refresh]").click();
        },
      },
      {
        pattern: /^Then geolocation refresh retries once with high accuracy$/,
        run: async ({ assert, fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const refreshCalls = await page.evaluate(
            (refreshStartCount) => {
              const calls =
                (
                  window as typeof window & {
                    __testGeoCalls?: Array<{
                      enableHighAccuracy: boolean;
                      type: string;
                    }>;
                  }
                ).__testGeoCalls || [];
              return calls
                .filter((call) => call?.type === "getCurrentPosition")
                .slice(Number(refreshStartCount || 0));
            },
            world.refreshGetCurrentPositionCallCountStart || 0
          );

          assert.equal(refreshCalls.length, 2);
          assert.equal(refreshCalls[0]?.enableHighAccuracy, false);
          assert.equal(refreshCalls[1]?.enableHighAccuracy, true);
        },
      },
      {
        pattern: /^Then the latest departures request latitude is 60\.17$/,
        run: ({ assert, world }) => {
          assert.equal(world.latestLat, "60.17");
        },
      },
      {
        pattern: /^Then the latest departures request longitude is 24\.94$/,
        run: ({ assert, world }) => {
          assert.equal(world.latestLon, "24.94");
        },
      },
    ],
  }
);
