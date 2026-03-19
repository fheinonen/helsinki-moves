import { test } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";
import { installFixedNow } from "@tests/helpers/install-fixed-now";

interface World {}

definePlaywrightFeature<World>(
  test,
  `
Feature: Create route

  Scenario: The create route renders departure data from the departures API
    Given the create route departures API returns 2 departures
    When the user opens the create route
    Then the create route shows 1 mode group header
    And the create route shows the mode group title Tram
    Then the create route shows the departure meta Rautatientori
    And the create route shows the departure meta Stop H0401
    And the create route shows 2 departure rows

  Scenario: The create route progressively rebuilds the board from a streamed generated spec
    Given the create route departures API returns 2 departures
    And the create route generation API streams a new board in chunks
    When the user opens the create route
    And the user enters a board prompt in the create route
    And the user enters a Google API key in the create route
    And the user starts create route generation
    Then the create route shows the generation overlay
    And the create route eventually shows 1 mode group header
    And the create route eventually shows the mode group title Tram
    And the create route eventually shows the departure meta Rautatientori
    And the create route shows 2 departure rows
  `,
  {
    createWorld: async () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the create route departures API returns 2 departures$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await installFixedNow(page, Date.parse("2026-03-21T10:00:00.000Z"));
          await page.route("**/api/v1/departures**", async (route) => {
            await route.fulfill({
              body: JSON.stringify({
                filterOptions: {
                  destinations: [],
                  lines: [],
                },
                mode: "TRAM",
                selectedStopId: "HSL:STOP_TRAM",
                station: {
                  departures: [
                    {
                      departureIso: "2026-03-21T10:05:00.000Z",
                      destination: "Lasipalatsi",
                      line: "7",
                    },
                    {
                      departureIso: "2026-03-21T10:09:00.000Z",
                      destination: "Lansi-Pasila",
                      line: "9",
                    },
                  ],
                  distanceMeters: 25,
                  stopCode: "H0401",
                  stopCodes: ["H0401"],
                  stopName: "Rautatientori",
                  type: "stop",
                },
                stops: [],
              }),
              contentType: "application/json",
              status: 200,
            });
          });
        },
      },
      {
        pattern: /^When the user opens the create route$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.goto("/create");
        },
      },
      {
        pattern: /^Given the create route generation API streams a new board in chunks$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.addInitScript(() => {
            const originalFetch = window.fetch.bind(window);
            const encoder = new TextEncoder();
            const chunks = [
              '{"op":"replace","path":"/elements/board/props/title","value":"Compact Tram Board"}\n',
              '{"op":"replace","path":"/elements/board/props/maxWidth","value":"md"}\n',
            ];

            window.fetch = async (input, init) => {
              const url =
                typeof input === "string"
                  ? input
                  : input instanceof Request
                    ? input.url
                    : String(input);

              if (!url.includes("/api/v1/generate-ui")) {
                return originalFetch(input, init);
              }

              return new Response(
                new ReadableStream({
                  start(controller) {
                    chunks.forEach((chunk, index) => {
                      window.setTimeout(() => {
                        controller.enqueue(encoder.encode(chunk));
                        if (index === chunks.length - 1) {
                          controller.close();
                        }
                      }, 250 + index * 120);
                    });
                  },
                }),
                {
                  headers: {
                    "content-type": "text/plain; charset=utf-8",
                  },
                  status: 200,
                }
              );
            };
          });
        },
      },
      {
        pattern: /^When the user enters a board prompt in the create route$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.getByTestId("create-prompt").fill("Build a compact live tram board.");
        },
      },
      {
        pattern: /^When the user enters a Google API key in the create route$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.getByTestId("create-api-key").fill("google-key");
        },
      },
      {
        pattern: /^When the user starts create route generation$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.getByTestId("create-generate").click();
        },
      },
      {
        pattern: /^Then the create route shows the generation overlay$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForSelector('[data-testid="create-generation-overlay"]');
          assert.equal(await page.getByTestId("create-generation-overlay").isVisible(), true);
        },
      },
      {
        pattern: /^Then the create route (?:eventually )?shows the departure meta (.+)$/,
        run: async ({ args, assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForFunction(
            (value) => document.body.textContent?.includes(value) ?? false,
            args[0]
          );
          assert.equal((await page.textContent("body"))?.includes(args[0]), true);
        },
      },
      {
        pattern: /^Then the create route (?:eventually )?shows (\d+) mode group header$/,
        run: async ({ args, assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForFunction(
            (count) => document.querySelectorAll('[data-testid="mode-group-header"]').length === Number(count),
            args[0]
          );
          assert.equal(await page.locator('[data-testid="mode-group-header"]').count(), Number(args[0]));
        },
      },
      {
        pattern: /^(Then|And) the create route (?:eventually )?shows the mode group title (.+)$/,
        run: async ({ args, assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForFunction(
            (value) => document.body.textContent?.includes(value) ?? false,
            args[1]
          );
          assert.equal((await page.textContent("body"))?.includes(args[1]), true);
        },
      },
      {
        pattern: /^Then the create route shows 2 departure rows$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          assert.equal(await page.getByTestId("departure-row").count(), 2);
        },
      },
    ],
  }
);
