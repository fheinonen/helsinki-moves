import { test } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";
import { installFixedNow } from "@tests/helpers/install-fixed-now";
import { averagePngColor, colorsStay, formatRgb, type Rgb } from "@tests/helpers/png-color";

const FIXED_NOW_MS = Date.parse("2026-03-07T10:00:00.000Z");
const RELOAD_DELAY_MS = 180;

interface BackgroundProbe {
  backgroundFrames: number;
  hiddenBoardFrames: number;
  samples: number;
}

interface ChipFillProbe {
  highlight: string;
  sameFill: boolean;
  sameShell: boolean;
}

interface GutterProbe {
  after: Rgb;
  before: Rgb;
  heightAfter: number;
  heightBefore: number;
}

interface ToggleFillProbe {
  sameFill: boolean;
}

interface World {
  fill?: ChipFillProbe;
  gutter?: GutterProbe;
  probe?: BackgroundProbe;
  toggleFill?: ToggleFillProbe;
}

const TALL_LINES = ["550", "510", "14", "18", "21", "63", "65A", "8", "560", "55"];
const GUTTER_CLIP = { height: 6, width: 6, x: 6, y: 156 };

function buildPayload(selection?: { destination?: string; line?: string }): Record<string, unknown> {
  const departures = [
    {
      departureIso: new Date(FIXED_NOW_MS + 5 * 60_000).toISOString(),
      destination: "Kamppi",
      line: "550",
    },
    {
      departureIso: new Date(FIXED_NOW_MS + 8 * 60_000).toISOString(),
      destination: "Pasila",
      line: "510",
    },
  ].filter((departure) => {
    if (selection?.line && departure.line !== selection.line) {
      return false;
    }
    if (selection?.destination && departure.destination !== selection.destination) {
      return false;
    }
    return true;
  });

  return {
    filterOptions: {
      destinations: [
        { count: 1, value: "Kamppi" },
        { count: 1, value: "Pasila" },
      ],
      lines: [
        { count: 1, value: "550" },
        { count: 1, value: "510" },
      ],
    },
    mode: "BUS",
    selectedStopId: "HSL:STOP_A",
    station: {
      departures,
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

function buildTallPayload(selection?: { line?: string }): Record<string, unknown> {
  const departures = TALL_LINES.map((line, index) => ({
    departureIso: new Date(FIXED_NOW_MS + (index + 2) * 60_000).toISOString(),
    destination: index % 2 === 0 ? "Kamppi" : "Pasila",
    line,
  })).filter((departure) => !selection?.line || departure.line === selection.line);

  return {
    filterOptions: {
      destinations: [
        { count: 5, value: "Kamppi" },
        { count: 5, value: "Pasila" },
      ],
      lines: TALL_LINES.map((value) => ({ count: 1, value })),
    },
    mode: "BUS",
    selectedStopId: "HSL:STOP_A",
    station: {
      departures,
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
Feature: Filter background stability

  Scenario: Filtering by line does not flash the departure background
    Given departure fixtures are ready for background sampling
    And the departure board is open for background sampling
    When the line filter is sampled for background flashes
    Then the departure background stays visible for every sample

  Scenario: Filtering by destination does not flash the departure background
    Given departure fixtures are ready for background sampling
    And the departure board is open for background sampling
    When the destination filter is sampled for background flashes
    Then the departure background stays visible for every sample

  Scenario: Pressing a line filter keeps the chip fill color
    Given departure fixtures are ready for background sampling
    And the departure board is open for background sampling
    When the line filter fill is sampled
    Then the filter chip keeps its fill
    And the filter chip has no tap highlight

  Scenario: Pressing a destination filter keeps the chip fill color
    Given departure fixtures are ready for background sampling
    And the departure board is open for background sampling
    When the destination filter fill is sampled
    Then the filter chip keeps its fill

  Scenario: Opening filters keeps the shell color
    Given a tall departure board is ready for color sampling
    When the shell gutter is sampled while filters open
    Then the shell keeps its color while its height changes

  Scenario: Filtering a tall board keeps the shell color
    Given a tall departure board is ready for color sampling
    And filters are open on the tall board
    When the shell gutter is sampled while a line filter is pressed
    Then the shell keeps its color while its height changes

  Scenario: Opening filters keeps the toggle fill
    Given a tall departure board is ready for color sampling
    When the filter toggle fill is sampled
    Then the filter toggle keeps its fill
  `,
  {
    createWorld: async () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given departure fixtures are ready for background sampling$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await installFixedNow(page, FIXED_NOW_MS);
          await page.route("**/api/v1/departures**", async (route) => {
            const url = new URL(route.request().url());
            const line = url.searchParams.get("line") || undefined;
            const destination = url.searchParams.get("dest") || undefined;
            if (line || destination) {
              await new Promise((resolve) => setTimeout(resolve, RELOAD_DELAY_MS));
            }
            await route.fulfill({
              body: JSON.stringify(buildPayload({ destination, line })),
              contentType: "application/json",
              status: 200,
            });
          });
        },
      },
      {
        pattern: /^(?:Given|And) the departure board is open for background sampling$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.setViewportSize({ width: 390, height: 844 });
          await page.goto("/?mode=bus");
          await page.waitForSelector(".departure-card");
          await page.locator("[data-filter-toggle]").click();
          await page.waitForSelector("[data-line-filter='550']");
        },
      },
      {
        pattern: /^When the (line|destination) filter is sampled for background flashes$/,
        run: async ({ args, fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const selector =
            args[0] === "line" ? "[data-line-filter='550']" : "[data-destination-filter='Kamppi']";
          world.probe = await page.evaluate(
            async ({ targetSelector, windowMs }) => {
              const card = document.querySelector(".departure-card");
              const table = document.querySelector(".app-shell__departures-table");
              const target = document.querySelector(targetSelector);
              if (
                !(card instanceof HTMLElement) ||
                !(table instanceof HTMLElement) ||
                !(target instanceof HTMLElement)
              ) {
                return { backgroundFrames: 1, hiddenBoardFrames: 1, samples: 0 };
              }
              const departureTable: HTMLElement = table;
              const rect = card.getBoundingClientRect();
              const x = Math.round(rect.left + rect.width / 2);
              const y = Math.round(rect.top + Math.min(20, rect.height / 2));
              let backgroundFrames = 0;
              let hiddenBoardFrames = 0;
              let samples = 0;
              const start = performance.now();
              target.click();
              await new Promise<void>((resolve) => {
                function sample(now: number) {
                  const hit = document.elementFromPoint(x, y);
                  const showsShell = hit instanceof HTMLElement && hit.classList.contains("app-shell");
                  const showsBody = hit instanceof HTMLBodyElement;
                  if (departureTable.hidden || showsShell || showsBody) {
                    backgroundFrames += 1;
                  }
                  if (departureTable.hidden) {
                    hiddenBoardFrames += 1;
                  }
                  samples += 1;
                  if (now - start >= windowMs) {
                    resolve();
                    return;
                  }
                  requestAnimationFrame(sample);
                }
                requestAnimationFrame(sample);
              });
              return { backgroundFrames, hiddenBoardFrames, samples };
            },
            { targetSelector: selector, windowMs: RELOAD_DELAY_MS + 80 }
          );
        },
      },
      {
        pattern: /^When the (line|destination) filter fill is sampled$/,
        run: async ({ args, fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const selector =
            args[0] === "line" ? "[data-line-filter='550']" : "[data-destination-filter='Kamppi']";
          world.fill = await page.evaluate((targetSelector) => {
            const chip = document.querySelector(targetSelector);
            const shell = document.querySelector(".app-shell");
            if (!(chip instanceof HTMLElement) || !(shell instanceof HTMLElement)) {
              return { highlight: "", sameFill: false, sameShell: false };
            }
            const chipFill = getComputedStyle(chip).backgroundImage;
            const shellFill = getComputedStyle(shell).backgroundImage;
            chip.click();
            const chipStyle = getComputedStyle(chip);
            return {
              highlight: chipStyle.getPropertyValue("-webkit-tap-highlight-color"),
              sameFill: chipStyle.backgroundImage === chipFill,
              sameShell: getComputedStyle(shell).backgroundImage === shellFill,
            };
          }, selector);
        },
      },
      {
        pattern: /^Then the filter chip keeps its fill$/,
        run: ({ assert, world }) => {
          assert.equal(world.fill?.sameShell, true, "the panel background changed when a filter was pressed");
          assert.equal(world.fill?.sameFill, true, "the filter chip fill changed color when it was pressed");
        },
      },
      {
        pattern: /^Then the filter chip has no tap highlight$/,
        run: ({ assert, world }) => {
          assert.match(
            world.fill?.highlight || "",
            /^(transparent|rgba\(0,\s*0,\s*0,\s*0\))$/i,
            "a pressed filter still paints a tap highlight"
          );
        },
      },
      {
        pattern: /^Given a tall departure board is ready for color sampling$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await installFixedNow(page, FIXED_NOW_MS);
          await page.route("**/api/v1/departures**", async (route) => {
            const url = new URL(route.request().url());
            const line = url.searchParams.get("line") || undefined;
            await route.fulfill({
              body: JSON.stringify(buildTallPayload({ line })),
              contentType: "application/json",
              status: 200,
            });
          });
          await page.setViewportSize({ width: 390, height: 844 });
          await page.goto("/?mode=bus");
          await page.waitForSelector(".departure-card");
        },
      },
      {
        pattern: /^(?:Given|And) filters are open on the tall board$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.locator("[data-filter-toggle]").click();
          await page.waitForSelector("[data-line-filter='550']");
        },
      },
      {
        pattern: /^When the shell gutter is sampled while filters open$/,
        run: async ({ fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const before = await page.screenshot({ clip: GUTTER_CLIP });
          const heightBefore = await page.evaluate(() => {
            const shell = document.querySelector(".app-shell");
            return shell instanceof HTMLElement ? shell.getBoundingClientRect().height : 0;
          });
          await page.locator("[data-filter-toggle]").click();
          await page.waitForSelector("[data-line-filter='550']");
          const after = await page.screenshot({ clip: GUTTER_CLIP });
          const heightAfter = await page.evaluate(() => {
            const shell = document.querySelector(".app-shell");
            return shell instanceof HTMLElement ? shell.getBoundingClientRect().height : 0;
          });
          world.gutter = {
            after: averagePngColor(after),
            before: averagePngColor(before),
            heightAfter,
            heightBefore,
          };
        },
      },
      {
        pattern: /^When the shell gutter is sampled while a line filter is pressed$/,
        run: async ({ fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const before = await page.screenshot({ clip: GUTTER_CLIP });
          const heightBefore = await page.evaluate(() => {
            const shell = document.querySelector(".app-shell");
            return shell instanceof HTMLElement ? shell.getBoundingClientRect().height : 0;
          });
          await page.locator("[data-line-filter='550']").click();
          await page.waitForFunction(() => document.querySelectorAll(".departure-card").length === 1);
          const after = await page.screenshot({ clip: GUTTER_CLIP });
          const heightAfter = await page.evaluate(() => {
            const shell = document.querySelector(".app-shell");
            return shell instanceof HTMLElement ? shell.getBoundingClientRect().height : 0;
          });
          world.gutter = {
            after: averagePngColor(after),
            before: averagePngColor(before),
            heightAfter,
            heightBefore,
          };
        },
      },
      {
        pattern: /^Then the shell keeps its color while its height changes$/,
        run: ({ assert, world }) => {
          const gutter = world.gutter;
          assert.equal(Boolean(gutter && gutter.heightBefore !== gutter.heightAfter), true, "the shell height did not change, so the color check missed the resize");
          assert.equal(
            gutter ? colorsStay(gutter.before, gutter.after) : false,
            true,
            `the shell color changed from ${gutter ? formatRgb(gutter.before) : ""} to ${gutter ? formatRgb(gutter.after) : ""}`
          );
        },
      },
      {
        pattern: /^When the filter toggle fill is sampled$/,
        run: async ({ fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          world.toggleFill = await page.evaluate(() => {
            const toggle = document.querySelector("[data-filter-toggle]");
            if (!(toggle instanceof HTMLElement)) {
              return { sameFill: false };
            }
            const fill = getComputedStyle(toggle).backgroundImage;
            toggle.click();
            return { sameFill: getComputedStyle(toggle).backgroundImage === fill };
          });
        },
      },
      {
        pattern: /^Then the filter toggle keeps its fill$/,
        run: ({ assert, world }) => {
          assert.equal(world.toggleFill?.sameFill, true, "the filter control fill changed color when it was pressed");
        },
      },
      {
        pattern: /^Then the departure background stays visible for every sample$/,
        run: ({ assert, world }) => {
          assert.equal(world.probe?.samples ? world.probe.samples > 0 : false, true);
          assert.equal(world.probe?.backgroundFrames, 0);
          assert.equal(world.probe?.hiddenBoardFrames, 0);
        },
      },
    ],
  }
);
