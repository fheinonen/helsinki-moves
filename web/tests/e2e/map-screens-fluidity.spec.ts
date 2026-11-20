import { test } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";
import { installFixedNow } from "@tests/helpers/install-fixed-now";

const FIXED_NOW_MS = Date.parse("2026-03-07T12:32:07.000Z");

const MOCK_TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" fill="#ebe5d8"/>
  <rect x="16" y="16" width="96" height="72" rx="4" fill="#dfd7c6"/>
  <rect x="136" y="24" width="104" height="64" rx="4" fill="#d9e3cf"/>
  <rect x="20" y="114" width="92" height="118" rx="4" fill="#dfd7c6"/>
  <rect x="136" y="116" width="100" height="112" rx="4" fill="#e2dac9"/>
  <path d="M0 100 H256 M124 0 V256 M0 242 H256" stroke="#ffffff" stroke-width="10"/>
  <path d="M0 100 H256 M124 0 V256" stroke="#d1c8b6" stroke-width="1"/>
  <path d="M64 0 V256 M188 0 V256 M0 52 H256 M0 176 H256" stroke="#f7f3ea" stroke-width="5"/>
</svg>`;

function buildDeparturesPayload() {
  return {
    filterOptions: {
      destinations: [
        { count: 1, value: "Kamppi" },
        { count: 1, value: "Ruoholahti" },
        { count: 1, value: "Eira" },
      ],
      lines: [
        { count: 1, value: "550" },
        { count: 1, value: "560" },
        { count: 1, value: "18" },
      ],
    },
    mode: "BUS",
    selectedStopId: "HSL:1020601",
    station: {
      departures: [
        {
          departureIso: new Date(FIXED_NOW_MS + 10 * 60_000).toISOString(),
          destination: "Kamppi",
          line: "550",
          stopCode: "A1",
          stopId: "HSL:1020601",
          tripId: "HSL:TRIP_550",
        },
        {
          departureIso: new Date(FIXED_NOW_MS + 14 * 60_000).toISOString(),
          destination: "Ruoholahti",
          line: "560",
          stopCode: "A1",
          stopId: "HSL:1020601",
          tripId: "HSL:TRIP_560",
        },
        {
          departureIso: new Date(FIXED_NOW_MS + 3 * 60_000).toISOString(),
          destination: "Eira",
          line: "18",
          stopCode: "A2",
          stopId: "HSL:1020601",
          tripId: "HSL:TRIP_18",
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
        id: "HSL:1020601",
        memberStopIds: ["HSL:1020601"],
        name: "Kamppi",
        stopCodes: ["A1"],
      },
    ],
  };
}

function buildVehicleSpanSse(): string {
  const openedVehicle = { lat: 60.1726, lon: 24.9485 };
  const stop = { lat: 60.1692, lon: 24.9337 };
  const route = [
    openedVehicle,
    { lat: 60.1718, lon: 24.9442 },
    { lat: 60.1707, lon: 24.9395 },
    { lat: 60.1699, lon: 24.9362 },
    stop,
  ];
  const payload = {
    frame: {
      east: 24.9485,
      north: 60.1726,
      openedVehicle,
      route,
      south: 60.1692,
      stop,
      west: 24.9337,
    },
    type: "span",
    vehicle: openedVehicle,
  };
  return `event: span\ndata: ${JSON.stringify(payload)}\n\n`;
}

function buildWalkPayload() {
  return {
    points: [
      { lat: 60.1706, lon: 24.9414 },
      { lat: 60.1702, lon: 24.9392 },
      { lat: 60.1698, lon: 24.9364 },
      { lat: 60.1692, lon: 24.9337 },
    ],
    seconds: 6 * 60,
  };
}

interface World {
  initialGlassHeight?: number;
  expandedGlassHeight?: number;
  panBefore?: string;
}

definePlaywrightFeature<World>(
  test,
  `
Feature: Fluid vehicle map and walking route screens in browser

  Scenario: Desktop vehicle map and walking route screens support smooth zoom, pan, expand, direct switching, and Escape dismiss
    Given deterministic map and route mocks are installed
    And deterministic clock is installed for map fluidity checks
    When the app is opened in desktop viewport for map fluidity
    And the user opens the first departure vehicle map
    Then the vehicle map stays framed inside the shell with loaded tiles and controls
    When the user zooms in, drags to pan, expands, and resets the map
    Then the map zoom, pan, expand height, and reset all respond smoothly
    When the user switches directly from the vehicle map to the walking route
    Then the walking route screen renders origin, stop, route, and on-time badge inside the shell
    When the user switches directly back to the vehicle map and presses Escape
    Then both map screens close and focus returns to the departure button

  Scenario: Mobile vehicle map and walking route screens stay framed and interactive
    Given deterministic map and route mocks are installed
    And deterministic clock is installed for map fluidity checks
    When the app is opened in mobile viewport for map fluidity
    And the user opens the first departure vehicle map
    Then the vehicle map stays framed inside the shell with loaded tiles and controls
    When the user switches directly from the vehicle map to the walking route
    Then the walking route screen renders origin, stop, route, and on-time badge inside the shell
  `,
  {
    createWorld: async () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given deterministic map and route mocks are installed$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/departures**", async (route) => {
            await route.fulfill({
              body: JSON.stringify(buildDeparturesPayload()),
              contentType: "application/json",
              status: 200,
            });
          });
          await page.route("**/api/v1/vehicle-span**", async (route) => {
            await route.fulfill({
              body: buildVehicleSpanSse(),
              contentType: "text/event-stream",
              status: 200,
            });
          });
          await page.route("**/api/v1/walk**", async (route) => {
            await route.fulfill({
              body: JSON.stringify(buildWalkPayload()),
              contentType: "application/json",
              status: 200,
            });
          });
          await page.route("**/api/v1/map-tile**", async (route) => {
            await route.fulfill({
              body: MOCK_TILE_SVG,
              contentType: "image/svg+xml",
              status: 200,
            });
          });
        },
      },
      {
        pattern: /^Given deterministic clock is installed for map fluidity checks$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await installFixedNow(page, FIXED_NOW_MS);
        },
      },
      {
        pattern: /^When the app is opened in desktop viewport for map fluidity$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.setViewportSize({ width: 1280, height: 960 });
          await page.goto("/");
          await page.waitForSelector(".departure-card");
        },
      },
      {
        pattern: /^When the app is opened in mobile viewport for map fluidity$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.setViewportSize({ width: 390, height: 844 });
          await page.goto("/");
          await page.waitForSelector(".departure-card");
        },
      },
      {
        pattern: /^When the user opens the first departure vehicle map$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.locator(".departure-card").first().click();
          await page.locator("[data-vehicle-map='true']").waitFor({ state: "visible" });
          await page.locator("[data-vehicle-glass][data-vehicle-live='true']").waitFor({ state: "visible" });
          await page.locator("[data-street-tile][data-tile-loaded='true']").first().waitFor({ state: "visible" });
        },
      },
      {
        pattern: /^Then the vehicle map stays framed inside the shell with loaded tiles and controls$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const shellBox = await page.locator(".app-shell").boundingBox();
          const mapBox = await page.locator("[data-vehicle-map='true']").boundingBox();
          const glassBox = await page.locator("[data-vehicle-glass]").boundingBox();
          const controlsBox = await page.locator("[data-map-controls]").boundingBox();
          assert.equal(Boolean(shellBox && mapBox && glassBox && controlsBox), true);
          assert.equal((mapBox?.x ?? 0) >= (shellBox?.x ?? 0), true);
          assert.equal((mapBox?.x ?? 0) + (mapBox?.width ?? 0) <= (shellBox?.x ?? 0) + (shellBox?.width ?? 0), true);
          assert.equal((controlsBox?.x ?? 0) >= (glassBox?.x ?? 0), true);
          assert.equal(
            (controlsBox?.x ?? 0) + (controlsBox?.width ?? 0) <= (glassBox?.x ?? 0) + (glassBox?.width ?? 0) + 1,
            true,
          );
          assert.equal(await page.locator(".departure-card").first().getAttribute("data-map-active"), "true");
        },
      },
      {
        pattern: /^When the user zooms in, drags to pan, expands, and resets the map$/,
        run: async ({ fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const glass = page.locator("[data-vehicle-glass]");
          const initialBox = await glass.boundingBox();
          world.initialGlassHeight = initialBox?.height ?? 0;

          await page.locator("[data-map-zoom-in]").click();
          await page.waitForFunction(() => {
            const el = document.querySelector<HTMLElement>("[data-vehicle-glass]");
            return Number(el?.dataset.mapZoom || "1") > 1.2;
          });

          const box = await glass.boundingBox();
          if (box) {
            const startX = box.x + box.width * 0.45;
            const startY = box.y + box.height * 0.5;
            await page.mouse.move(startX, startY);
            await page.mouse.down();
            await page.mouse.move(startX + 45, startY + 25, { steps: 5 });
            await page.mouse.up();
          }
          world.panBefore = await page
            .locator(".vehicle-span__canvas")
            .evaluate((el) => (el as HTMLElement).style.getPropertyValue("--map-pan-x"));

          await page.locator("[data-map-expand]").click();
          await page.waitForTimeout(320);
          world.expandedGlassHeight = (await glass.boundingBox())?.height ?? 0;

          await page.locator("[data-map-reset]").click();
        },
      },
      {
        pattern: /^Then the map zoom, pan, expand height, and reset all respond smoothly$/,
        run: async ({ assert, fixtures, world }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          assert.equal(Number.parseFloat(world.panBefore || "0") !== 0, true);
          assert.equal((world.expandedGlassHeight ?? 0) > (world.initialGlassHeight ?? 0) + 40, true);
          assert.equal(await page.locator("[data-vehicle-glass]").getAttribute("data-map-zoom"), "1.00");
          assert.equal(await page.locator("[data-map-reset]").isDisabled(), true);
        },
      },
      {
        pattern: /^When the user switches directly from the vehicle map to the walking route$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.locator("[data-map-switch='walk']").click();
          await page.locator("[data-walk-map='true']").waitFor({ state: "visible" });
          await page.locator("[data-walk-map='true'] [data-street-tile][data-tile-loaded='true']").first().waitFor({
            state: "visible",
          });
        },
      },
      {
        pattern: /^Then the walking route screen renders origin, stop, route, and on-time badge inside the shell$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          const shellBox = await page.locator(".app-shell").boundingBox();
          const walkBox = await page.locator("[data-walk-map='true']").boundingBox();
          assert.equal(Boolean(shellBox && walkBox), true);
          assert.equal((walkBox?.x ?? 0) >= (shellBox?.x ?? 0), true);
          assert.equal((walkBox?.x ?? 0) + (walkBox?.width ?? 0) <= (shellBox?.x ?? 0) + (shellBox?.width ?? 0), true);
          assert.equal(await page.locator("[data-walk-origin='true']").isVisible(), true);
          assert.equal(await page.locator("[data-walk-map='true'] [data-stop-marker='true']").isVisible(), true);
          assert.equal(await page.locator("[data-walk-time='true']").textContent(), "✓ 6 min");
          assert.equal(await page.locator("[data-map-switch='vehicle']").isVisible(), true);
        },
      },
      {
        pattern: /^When the user switches directly back to the vehicle map and presses Escape$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.locator("[data-map-switch='vehicle']").click();
          await page.locator("[data-vehicle-map='true']").waitFor({ state: "visible" });
          await page.keyboard.press("Escape");
        },
      },
      {
        pattern: /^Then both map screens close and focus returns to the departure button$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          assert.equal(await page.locator("[data-vehicle-map='true']").count(), 0);
          assert.equal(await page.locator("[data-walk-map='true']").count(), 0);
          const focusedLabel = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || "");
          assert.equal(focusedLabel.includes("550 to Kamppi"), true);
        },
      },
    ],
  },
);
