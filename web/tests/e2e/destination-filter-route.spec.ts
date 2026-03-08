import { test } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";
import { installFixedNow } from "@tests/helpers/install-fixed-now";
import { createApp } from "@server/app";
import type { Departure } from "@shared/domain/departure";

const FIXED_NOW_MS = Date.parse("2026-03-07T12:32:07.000Z");

definePlaywrightFeature(
  test,
  `
Feature: Destination filter route integration

  Scenario: Multiword destination filter survives the real route flow
    Given the departures route uses a Talontie-style multiword service fixture
    And deterministic time is configured for route filtering
    When the app opens in bus mode for route filtering
    And the user opens the filters for route filtering
    And the user selects destination filter Kamppi via Töölö
    Then the route-backed destination filter keeps two departures visible
  `,
  {
    createWorld: async () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the departures route uses a Talontie-style multiword service fixture$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const service = {
            async getNearbyStops() {
              return [
                {
                  distance: 140,
                  stop: {
                    code: "1234",
                    gtfsId: "HSL:TALONTIE_A",
                    name: "Talontie",
                    vehicleMode: "BUS",
                  },
                },
                {
                  distance: 160,
                  stop: {
                    code: "1235",
                    gtfsId: "HSL:TALONTIE_B",
                    name: "Talontie",
                    vehicleMode: "BUS",
                  },
                },
              ];
            },
            async getDeparturesForStopIds(stopIds: string[]) {
              const departuresByStopId = new Map<string, Departure[]>();
              for (const stopId of stopIds) {
                if (stopId === "HSL:TALONTIE_A") {
                  departuresByStopId.set(stopId, [
                    {
                      departureIso: "2026-03-07T12:36:07.000Z",
                      destination: "Kamppi via Töölö",
                      line: "18",
                      stopId,
                    },
                    {
                      departureIso: "2026-03-07T12:41:07.000Z",
                      destination: "Pasila",
                      line: "18",
                      stopId,
                    },
                  ]);
                }
                if (stopId === "HSL:TALONTIE_B") {
                  departuresByStopId.set(stopId, [
                    {
                      departureIso: "2026-03-07T12:39:07.000Z",
                      destination: "Kamppi via Töölö",
                      line: "18",
                      stopId,
                    },
                  ]);
                }
              }
              return departuresByStopId;
            },
          };
          const app = createApp({ digitransitService: service });
          await page.route("**/api/v1/departures**", async (route) => {
            const request = route.request();
            const response = await app.request(request.url());
            await route.fulfill({
              body: await response.text(),
              contentType: "application/json",
              status: response.status,
            });
          });
        },
      },
      {
        pattern: /^(?:Given|And) deterministic time is configured for route filtering$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await installFixedNow(page, FIXED_NOW_MS);
          await page.addInitScript(() => {
            Object.defineProperty(navigator, "geolocation", {
              configurable: true,
              value: {
                getCurrentPosition(success: PositionCallback) {
                  success({
                    coords: {
                      accuracy: 1,
                      altitude: null,
                      altitudeAccuracy: null,
                      heading: null,
                      latitude: 60.205,
                      longitude: 24.896,
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
        pattern: /^When the app opens in bus mode for route filtering$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.setViewportSize({ width: 390, height: 844 });
          await page.goto("/?mode=bus");
          await page.waitForSelector(".departure-card");
        },
      },
      {
        pattern: /^(?:When|And) the user opens the filters for route filtering$/,
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
        pattern: /^Then the route-backed destination filter keeps two departures visible$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const destinations = await page.locator(".departure-card__destination").evaluateAll((elements) =>
            elements.map((element) => element.textContent?.trim() || "")
          );
          assert.equal(destinations.join("|"), "Kamppi via Töölö|Kamppi via Töölö");
        },
      },
    ],
  }
);
