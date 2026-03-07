import { test } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";
import { installFixedNow } from "@tests/helpers/install-fixed-now";

const FIXED_NOW_MS = Date.parse("2026-03-07T10:00:00.000Z");

interface ProbeResult {
  lowOpacityVisibleFrames: number;
  solidWhiteFrames: number;
  visibleSamples: number;
}

interface World {
  probe?: ProbeResult;
}

function buildPayload(): Record<string, unknown> {
  return {
    filterOptions: {
      destinations: [
        { count: 1, value: "Kamppi" },
        { count: 1, value: "Ruoholahti" },
      ],
      lines: [
        { count: 1, value: "550" },
        { count: 1, value: "560" },
      ],
    },
    mode: "BUS",
    selectedStopId: "HSL:STOP_A",
    station: {
      departures: [
        {
          departureIso: new Date(FIXED_NOW_MS + 5 * 60_000).toISOString(),
          destination: "Kamppi",
          line: "550",
        },
        {
          departureIso: new Date(FIXED_NOW_MS + 8 * 60_000).toISOString(),
          destination: "Ruoholahti",
          line: "560",
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
Feature: Light theme controls stability

  Scenario: Light-theme controls avoid washed frames during filter interaction
    Given deterministic controls stability mocks are installed
    And deterministic time is configured for controls stability
    And the app opens in light-theme bus mode
    When light-theme controls are sampled during a line-filter toggle
    Then the controls probe reports 0 low-opacity visible frames
    And the controls probe reports 0 solid white frames
  `,
  {
    createWorld: async () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given deterministic controls stability mocks are installed$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/departures**", async (route) => {
            await route.fulfill({
              body: JSON.stringify(buildPayload()),
              contentType: "application/json",
              status: 200,
            });
          });
        },
      },
      {
        pattern: /^(?:Given|And) deterministic time is configured for controls stability$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await installFixedNow(page, FIXED_NOW_MS);
        },
      },
      {
        pattern: /^(?:Given|And) the app opens in light-theme bus mode$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.addInitScript(() => {
            window.localStorage.setItem("theme", "light");
          });
          await page.setViewportSize({ width: 1280, height: 960 });
          await page.goto("/?mode=bus");
          await page.waitForSelector("[data-controls-panel]");
          await page.waitForSelector("[data-line-filter='550']");
        },
      },
      {
        pattern: /^When light-theme controls are sampled during a line-filter toggle$/,
        run: async ({ fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          world.probe = await page.evaluate(async () => {
            function parseCssColor(value: string | null) {
              const match = String(value || "")
                .trim()
                .match(/^rgba?\(([^)]+)\)$/i);
              if (!match) {
                return null;
              }

              const parts = match[1].split(",").map((part) => Number(part.trim()));
              if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) {
                return null;
              }

              return {
                a: Number.isFinite(parts[3]) ? parts[3] : 1,
                b: parts[2],
                g: parts[1],
                r: parts[0],
              };
            }

            const controls = document.querySelector("[data-controls-panel]");
            const lineFilter = document.querySelector("[data-line-filter='550']");
            if (!(controls instanceof HTMLElement) || !(lineFilter instanceof HTMLElement)) {
              return {
                lowOpacityVisibleFrames: 0,
                solidWhiteFrames: 0,
                visibleSamples: 0,
              };
            }
            const controlsElement = controls;
            const lineFilterElement = lineFilter;

            const samples: Array<{
              isLowOpacityWhileVisible: boolean;
              isSolidWhite: boolean;
              isVisible: boolean;
            }> = [];

            const startMs = performance.now();
            lineFilterElement.click();

            await new Promise<void>((resolve) => {
              function sample(now: number) {
                const elapsedMs = now - startMs;
                const computed = getComputedStyle(controlsElement);
                const rect = controlsElement.getBoundingClientRect();
                const opacity = Number.parseFloat(computed.opacity) || 0;
                const color = parseCssColor(computed.backgroundColor);
                const isVisible = opacity > 0.08 && rect.height > 8;
                const isLowOpacityWhileVisible = isVisible && opacity < 0.95;
                const isSolidWhite =
                  isVisible &&
                  Boolean(color) &&
                  (color?.r || 0) >= 248 &&
                  (color?.g || 0) >= 248 &&
                  (color?.b || 0) >= 248 &&
                  (color?.a || 0) >= 0.92;

                samples.push({
                  isLowOpacityWhileVisible,
                  isSolidWhite,
                  isVisible,
                });

                if (elapsedMs >= 320) {
                  resolve();
                  return;
                }

                requestAnimationFrame(sample);
              }

              requestAnimationFrame(sample);
            });

            return {
              lowOpacityVisibleFrames: samples.filter((sample) => sample.isLowOpacityWhileVisible)
                .length,
              solidWhiteFrames: samples.filter((sample) => sample.isSolidWhite).length,
              visibleSamples: samples.filter((sample) => sample.isVisible).length,
            };
          });
        },
      },
      {
        pattern: /^Then the controls probe reports (\d+) low-opacity visible frames$/,
        run: ({ assert, args, world }) => {
          assert.equal(world.probe?.lowOpacityVisibleFrames, Number(args[0]));
        },
      },
      {
        pattern: /^(?:Then|And) the controls probe reports (\d+) solid white frames$/,
        run: ({ assert, args, world }) => {
          assert.equal(world.probe?.solidWhiteFrames, Number(args[0]));
        },
      },
    ],
  }
);
