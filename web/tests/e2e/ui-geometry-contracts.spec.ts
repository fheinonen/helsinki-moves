import { test } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";
import { installFixedNow } from "@tests/helpers/install-fixed-now";

const FIXED_NOW_MS = Date.parse("2026-03-07T12:32:07.000Z");

interface World {
  viewport?: "desktop" | "mobile";
}

function setWorldViewport(
  world: World,
  viewport: { height: number; width: number }
): void {
  (world as World & { currentViewport?: { height: number; width: number } }).currentViewport =
    viewport;
}

function buildPayload() {
  return {
    filterOptions: {
      destinations: [
        { count: 2, value: "Kamppi" },
        { count: 1, value: "Ruoholahti" },
        { count: 1, value: "Eira" },
      ],
      lines: [
        { count: 2, value: "14" },
        { count: 1, value: "18" },
        { count: 1, value: "21" },
        { count: 1, value: "63" },
        { count: 1, value: "65A" },
        { count: 1, value: "8" },
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
        {
          departureIso: new Date(FIXED_NOW_MS + 2 * 60_000).toISOString(),
          destination: "Eira",
          line: "18",
        },
        {
          departureIso: new Date(FIXED_NOW_MS + 14 * 60_000).toISOString(),
          destination: "Rautatientori",
          line: "65A",
        },
        {
          departureIso: new Date(FIXED_NOW_MS + 18 * 60_000).toISOString(),
          destination: "Lauttasaari",
          line: "14",
        },
        {
          departureIso: new Date(FIXED_NOW_MS + 22 * 60_000).toISOString(),
          destination: "Kamppi",
          line: "14",
        },
        {
          departureIso: new Date(FIXED_NOW_MS + 25 * 60_000).toISOString(),
          destination: "Herttoniemi",
          line: "21",
        },
        {
          departureIso: new Date(FIXED_NOW_MS + 30 * 60_000).toISOString(),
          destination: "Ruskeasuo",
          line: "63",
        },
        {
          departureIso: new Date(FIXED_NOW_MS + 35 * 60_000).toISOString(),
          destination: "Toolo",
          line: "8",
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
      {
        code: "B1",
        distanceMeters: 120,
        id: "HSL:STOP_B",
        memberStopIds: ["HSL:STOP_B"],
        name: "Ruoholahti",
        stopCodes: ["B1"],
      },
    ],
  };
}

definePlaywrightFeature<World>(
  test,
  `
Feature: UI geometry contracts

  Scenario: Desktop shell keeps a compact transit board layout
    Given deterministic UI mocks are installed
    And deterministic time is configured
    When the app is opened in desktop viewport
    Then the shell stays framed like a compact board
    And the title and clock share the header row
    And the mode chooser and quick actions share the control row
    And the stop picker and filter trigger share the selection row
    And departure rows keep line, destination, and departure columns aligned

  Scenario: Mobile shell keeps a compact transit board layout
    Given deterministic UI mocks are installed
    And deterministic time is configured
    When the app is opened in mobile viewport
    Then the title and clock share the header row
    And the mode chooser and quick actions share the control row
    And the stop picker and filter trigger share the selection row
    And departure rows keep line, destination, and departure columns aligned

  Scenario: Sparse departures stay anchored under the headers
    Given sparse departures mocks are installed
    And deterministic time is configured
    When the app is opened in mobile viewport
    Then the first departure row stays close to the column headers

  Scenario: Extra narrow mobile shell keeps critical content inside the frame
    Given narrow mobile departures mocks are installed
    And deterministic time is configured
    When the app is opened in extra narrow mobile viewport
    Then the shell stays inside the viewport
    And the clock stays inside the shell frame
    And the stop controls stay inside the shell frame
    And the departure headers stay inside the shell frame
    And departure times stay inside the shell frame

  Scenario: Extra narrow mobile stop menu stays inside the shell frame
    Given narrow mobile departures mocks are installed
    And deterministic time is configured
    When the app is opened in extra narrow mobile viewport
    And the stop menu is opened
    Then the stop menu stays inside the shell frame

  Scenario: Sub-compact mobile shell keeps critical content inside the frame
    Given narrow mobile departures mocks are installed
    And deterministic time is configured
    When the app is opened in sub-compact mobile viewport
    Then the shell stays inside the viewport
    And the clock stays inside the shell frame
    And the stop controls stay inside the shell frame
    And the departure headers stay inside the shell frame
    And departure times stay inside the shell frame
  `,
  {
    createWorld: async () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given deterministic UI mocks are installed$/,
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
        pattern: /^Given sparse departures mocks are installed$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/departures**", async (route) => {
            const payload = buildPayload();
            payload.station.departures = payload.station.departures.slice(0, 2);
            payload.filterOptions.destinations = [
              { count: 1, value: "Kamppi" },
              { count: 1, value: "Ruoholahti" },
            ];
            payload.filterOptions.lines = [
              { count: 1, value: "550" },
              { count: 1, value: "560" },
            ];
            await route.fulfill({
              body: JSON.stringify(payload),
              contentType: "application/json",
              status: 200,
            });
          });
        },
      },
      {
        pattern: /^Given narrow mobile departures mocks are installed$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/departures**", async (route) => {
            const payload = buildPayload();
            payload.mode = "RAIL";
            payload.station.stopName = "Huopalahti";
            payload.station.distanceMeters = 959;
            payload.stops = [
              {
                code: "HPL",
                distanceMeters: 959,
                id: "HSL:STOP_A",
                memberStopIds: ["HSL:STOP_A"],
                name: "Huopalahti",
                stopCodes: ["HPL"],
              },
            ];
            payload.filterOptions.destinations = [
              { count: 3, value: "Leppavaara via Pitajanmaki" },
              { count: 3, value: "Lentoasema-Tikkurila via Huopalahti" },
            ];
            payload.filterOptions.lines = [
              { count: 3, value: "A" },
              { count: 3, value: "P" },
            ];
            payload.station.departures = [
              {
                departureIso: new Date(FIXED_NOW_MS + 4 * 60_000).toISOString(),
                destination: "Leppavaara via Pitajanmaki",
                line: "A",
              },
              {
                departureIso: new Date(FIXED_NOW_MS + 8 * 60_000).toISOString(),
                destination: "Lentoasema-Tikkurila via Huopalahti",
                line: "P",
              },
              {
                departureIso: new Date(FIXED_NOW_MS + 18 * 60_000).toISOString(),
                destination: "Lentoasema-Tikkurila via Huopalahti",
                line: "P",
              },
            ];
            await route.fulfill({
              body: JSON.stringify(payload),
              contentType: "application/json",
              status: 200,
            });
          });
        },
      },
      {
        pattern: /^Given deterministic time is configured$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await installFixedNow(page, FIXED_NOW_MS);
        },
      },
      {
        pattern: /^When the app is opened in desktop viewport$/,
        run: async ({ fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.setViewportSize({ width: 1280, height: 960 });
          await page.goto("/");
          await page.waitForSelector(".departure-card");
          world.viewport = "desktop";
        },
      },
      {
        pattern: /^When the app is opened in mobile viewport$/,
        run: async ({ fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const viewport = { width: 390, height: 844 };
          await page.setViewportSize(viewport);
          await page.goto("/");
          await page.waitForSelector(".departure-card");
          world.viewport = "mobile";
          setWorldViewport(world, viewport);
        },
      },
      {
        pattern: /^When the app is opened in extra narrow mobile viewport$/,
        run: async ({ fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const viewport = { width: 340, height: 800 };
          await page.setViewportSize(viewport);
          await page.goto("/?mode=rail");
          await page.waitForSelector(".departure-card");
          world.viewport = "mobile";
          setWorldViewport(world, viewport);
        },
      },
      {
        pattern: /^When the app is opened in sub-compact mobile viewport$/,
        run: async ({ fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const viewport = { width: 377, height: 800 };
          await page.setViewportSize(viewport);
          await page.goto("/?mode=rail");
          await page.waitForSelector(".departure-card");
          world.viewport = "mobile";
          setWorldViewport(world, viewport);
        },
      },
      {
        pattern: /^Then the shell stays framed like a compact board$/,
        run: async ({ assert, fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const shell = page.locator(".app-shell");
          const box = await shell.boundingBox();
          assert.equal(Boolean(box), true);
          assert.equal((box?.width || 0) <= (world.viewport === "desktop" ? 760 : 420), true);
        },
      },
      {
        pattern: /^Then the title and clock share the header row$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const titleBox = await page.locator(".app-shell__title").boundingBox();
          const clockBox = await page.locator(".app-shell__clock").boundingBox();
          assert.equal(Boolean(titleBox && clockBox), true);
          assert.equal(Math.abs((titleBox?.y || 0) - (clockBox?.y || 0)) <= 10, true);
        },
      },
      {
        pattern: /^Then the mode chooser and quick actions share the control row$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const modeBox = await page.locator(".app-shell__mode").boundingBox();
          const actionsBox = await page.locator(".app-shell__actions").boundingBox();
          assert.equal(Boolean(modeBox && actionsBox), true);
          assert.equal(Math.abs((modeBox?.y || 0) - (actionsBox?.y || 0)) <= 10, true);
          assert.equal((await page.locator(".app-shell__actions button").count()) === 2, true);
        },
      },
      {
        pattern: /^Then the stop picker and filter trigger share the selection row$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const selectBox = await page.locator("[data-stop-select]").boundingBox();
          const filterBox = await page.locator("[data-filter-toggle]").boundingBox();
          assert.equal(Boolean(selectBox && filterBox), true);
          assert.equal(Math.abs((selectBox?.y || 0) - (filterBox?.y || 0)) <= 10, true);
          assert.equal((selectBox?.width || 0) > (filterBox?.width || 0), true);
        },
      },
      {
        pattern: /^Then departure rows keep line, destination, and departure columns aligned$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const headerLine = await page.locator(".app-shell__column-headers span").nth(0).boundingBox();
          const headerDestination = await page
            .locator(".app-shell__column-headers span")
            .nth(1)
            .boundingBox();
          const headerTime = await page.locator(".app-shell__column-headers span").nth(2).boundingBox();
          const rowLine = await page.locator(".departure-card__line").first().boundingBox();
          const rowDestination = await page.locator(".departure-card__destination").first().boundingBox();
          const rowTime = await page.locator(".departure-card__time").first().boundingBox();
          assert.equal(Boolean(headerLine && headerDestination && headerTime), true);
          assert.equal(Boolean(rowLine && rowDestination && rowTime), true);
          assert.equal(Math.abs((headerLine?.x || 0) - (rowLine?.x || 0)) <= 16, true);
          assert.equal(Math.abs((headerDestination?.x || 0) - (rowDestination?.x || 0)) <= 16, true);
          assert.equal(Math.abs((headerTime?.x || 0) - (rowTime?.x || 0)) <= 24, true);
        },
      },
      {
        pattern: /^Then the first departure row stays close to the column headers$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const headerBox = await page.locator(".app-shell__column-headers").boundingBox();
          const rowBox = await page.locator(".departure-card").first().boundingBox();
          assert.equal(Boolean(headerBox && rowBox), true);
          assert.equal(((rowBox?.y || 0) - ((headerBox?.y || 0) + (headerBox?.height || 0))) <= 28, true);
        },
      },
      {
        pattern: /^Then the shell stays inside the viewport$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const viewport = page.viewportSize();
          const shellBox = await page.locator(".app-shell").boundingBox();
          assert.equal(Boolean(viewport && shellBox), true);
          assert.equal((shellBox?.x || 0) >= 0, true);
          assert.equal((shellBox?.x || 0) + (shellBox?.width || 0) <= (viewport?.width || 0), true);
        },
      },
      {
        pattern: /^When the stop menu is opened$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.locator("[data-stop-select]").click();
          await page.locator("[data-stop-menu]").waitFor({ state: "visible" });
        },
      },
      {
        pattern: /^Then the stop menu stays inside the shell frame$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const shellBox = await page.locator(".app-shell").boundingBox();
          const menuBox = await page.locator("[data-stop-menu]").boundingBox();
          assert.equal(Boolean(shellBox && menuBox), true);
          assert.equal((menuBox?.x || 0) >= (shellBox?.x || 0), true);
          assert.equal((menuBox?.x || 0) + (menuBox?.width || 0) <= (shellBox?.x || 0) + (shellBox?.width || 0), true);
        },
      },
      {
        pattern: /^Then the clock stays inside the shell frame$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const shellBox = await page.locator(".app-shell").boundingBox();
          const clockBox = await page.locator(".app-shell__clock").boundingBox();
          assert.equal(Boolean(shellBox && clockBox), true);
          assert.equal((clockBox?.x || 0) + (clockBox?.width || 0) <= (shellBox?.x || 0) + (shellBox?.width || 0) - 8, true);
        },
      },
      {
        pattern: /^Then the stop controls stay inside the shell frame$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const shellBox = await page.locator(".app-shell").boundingBox();
          const stopRowBox = await page.locator(".app-shell__stop-row").boundingBox();
          assert.equal(Boolean(shellBox && stopRowBox), true);
          assert.equal((stopRowBox?.x || 0) >= (shellBox?.x || 0) + 4, true);
          assert.equal((stopRowBox?.x || 0) + (stopRowBox?.width || 0) <= (shellBox?.x || 0) + (shellBox?.width || 0) - 4, true);
        },
      },
      {
        pattern: /^Then departure times stay inside the shell frame$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const shellBox = await page.locator(".app-shell").boundingBox();
          const timeBoxes = await page.locator(".departure-card__time").evaluateAll((elements) =>
            elements.map((element) => {
              const rect = element.getBoundingClientRect();
              return { left: rect.left, right: rect.right };
            })
          );
          assert.equal(Boolean(shellBox), true);
          assert.equal(timeBoxes.every((box) => box.right <= (shellBox?.x || 0) + (shellBox?.width || 0) - 6), true);
        },
      },
      {
        pattern: /^Then the departure headers stay inside the shell frame$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const shellBox = await page.locator(".app-shell").boundingBox();
          const headerBoxes = await page.locator(".app-shell__column-headers span").evaluateAll((elements) =>
            elements.map((element) => {
              const rect = element.getBoundingClientRect();
              return { left: rect.left, right: rect.right };
            })
          );
          assert.equal(Boolean(shellBox), true);
          assert.equal(
            headerBoxes.every(
              (box) =>
                box.left >= (shellBox?.x || 0) + 2 &&
                box.right <= (shellBox?.x || 0) + (shellBox?.width || 0) - 6
            ),
            true
          );
        },
      },
    ],
  }
);
