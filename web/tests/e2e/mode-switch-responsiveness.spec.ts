import { test } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";

interface TimingMetrics {
  activationFrame: number | null;
  activationMs: number | null;
}

interface World {
  timing?: TimingMetrics;
}

function buildDeparturesPayload(input: {
  destination: string;
  line: string;
  mode: "BUS" | "RAIL";
  stationName: string;
}): Record<string, unknown> {
  const isStopMode = input.mode === "BUS";

  return {
    filterOptions: {
      destinations: [{ count: 1, value: input.destination }],
      lines: [{ count: 1, value: input.line }],
    },
    mode: input.mode,
    selectedStopId: isStopMode ? "HSL:STOP_A" : "HSL:STATION_A",
    station: {
      departures: [
        {
          departureIso: new Date(Date.now() + 5 * 60_000).toISOString(),
          destination: input.destination,
          line: input.line,
        },
      ],
      distanceMeters: 80,
      stopCode: isStopMode ? "A1" : "1",
      stopCodes: [isStopMode ? "A1" : "1"],
      stopName: input.stationName,
      type: "stop",
    },
    stops: [
      {
        code: isStopMode ? "A1" : "1",
        distanceMeters: 80,
        id: isStopMode ? "HSL:STOP_A" : "HSL:STATION_A",
        memberStopIds: [isStopMode ? "HSL:STOP_A" : "HSL:STATION_A"],
        name: input.stationName,
        stopCodes: [isStopMode ? "A1" : "1"],
      },
    ],
  };
}

definePlaywrightFeature<World>(
  test,
  `
Feature: Mode switch responsiveness

  Scenario: Active mode feedback updates before the slow departures reload finishes
    Given departures are mocked for responsiveness measurements
    And browser geolocation is pre-granted
    When responsiveness is sampled while switching from rail to bus mode
    Then the BUS mode button becomes active within 4 animation frames
    And the BUS mode button becomes active within 120 milliseconds
    And the station title eventually becomes Kamppi Terminal
  `,
  {
    createWorld: async () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given departures are mocked for responsiveness measurements$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/departures**", async (route) => {
            const url = new URL(route.request().url());
            const mode = String(url.searchParams.get("mode") || "RAIL").toUpperCase();

            if (mode === "BUS") {
              await new Promise((resolve) => setTimeout(resolve, 260));
              await route.fulfill({
                body: JSON.stringify(
                  buildDeparturesPayload({
                    destination: "Kamppi",
                    line: "550",
                    mode: "BUS",
                    stationName: "Kamppi Terminal",
                  })
                ),
                contentType: "application/json",
                status: 200,
              });
              return;
            }

            await route.fulfill({
              body: JSON.stringify(
                buildDeparturesPayload({
                  destination: "Central",
                  line: "I",
                  mode: "RAIL",
                  stationName: "Central Station",
                })
              ),
              contentType: "application/json",
              status: 200,
            });
          });
        },
      },
      {
        pattern: /^(?:Given|And) browser geolocation is pre-granted$/,
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
                    },
                    timestamp: Date.now(),
                  } as GeolocationPosition);
                },
              },
            });
          });
        },
      },
      {
        pattern: /^When responsiveness is sampled while switching from rail to bus mode$/,
        run: async ({ fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.goto("/");
          await page.waitForFunction(() => {
            const station = document.querySelector("[data-station-title]");
            return station?.textContent === "Central Station";
          });

          world.timing = await page.evaluate(async () => {
            const busButton = document.querySelector('[data-mode="BUS"]');
            if (!(busButton instanceof HTMLElement)) {
              return {
                activationFrame: null,
                activationMs: null,
              };
            }
            const activeButton = busButton;

            const startMs = performance.now();
            let activationFrame: number | null = null;
            let activationMs: number | null = null;
            activeButton.click();

            await new Promise<void>((resolve) => {
              function sample(frameMs: number) {
                const isActive = activeButton.getAttribute("aria-checked") === "true";
                if (isActive && activationFrame == null) {
                  activationFrame = Math.max(1, Math.round((frameMs - startMs) / 16.7));
                  activationMs = Math.max(0, frameMs - startMs);
                  resolve();
                  return;
                }
                if (frameMs - startMs > 260) {
                  resolve();
                  return;
                }
                requestAnimationFrame(sample);
              }

              requestAnimationFrame(sample);
            });

            return {
              activationFrame,
              activationMs,
            };
          });
        },
      },
      {
        pattern: /^Then the BUS mode button becomes active within 4 animation frames$/,
        run: ({ assert, world }) => {
          assert.equal(Boolean(world.timing), true);
          assert.equal(Boolean(world.timing?.activationFrame != null), true);
          assert.equal((world.timing?.activationFrame || 0) <= 4, true);
        },
      },
      {
        pattern: /^(?:Then|And) the BUS mode button becomes active within 120 milliseconds$/,
        run: ({ assert, world }) => {
          assert.equal(Boolean(world.timing), true);
          assert.equal(Boolean(world.timing?.activationMs != null), true);
          assert.equal((world.timing?.activationMs || 0) <= 120, true);
        },
      },
      {
        pattern: /^(?:Then|And) the station title eventually becomes Kamppi Terminal$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForFunction(() => {
            const station = document.querySelector("[data-station-title]");
            return station?.textContent === "Kamppi Terminal";
          });
          assert.equal(
            await page.locator("[data-station-title]").textContent(),
            "Kamppi Terminal"
          );
        },
      },
    ],
  }
);
