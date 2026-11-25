import { test, type Page } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";
import { installFixedNow } from "@tests/helpers/install-fixed-now";

const FIXED_NOW_MS = Date.parse("2026-03-07T12:30:00.000Z");
const TILE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

interface World {
  delayMinutes: number;
  requestedStopIds: string[];
}

function departuresPayload(stopId = "HSL:2", stopName = "Meilahti") {
  return {
    filterOptions: {
      destinations: [{ count: 1, value: "Kamppi" }],
      lines: [{ count: 1, value: "4" }],
    },
    mode: "TRAM",
    selectedStopId: stopId,
    station: {
      departures: [
        {
          departureIso: new Date(FIXED_NOW_MS + 2 * 60_000).toISOString(),
          destination: "Kamppi",
          line: "4",
          stopCode: "H0102",
          stopId,
          tripId: "HSL:TRIP_4",
        },
      ],
      distanceMeters: 60,
      stopCode: "H0102",
      stopCodes: ["H0102"],
      stopName,
      type: "stop",
    },
    stops: [
      {
        code: "H0102",
        distanceMeters: 60,
        id: stopId,
        lat: 60.185,
        lon: 24.92,
        memberStopIds: [stopId],
        name: stopName,
        stopCodes: ["H0102"],
      },
    ],
  };
}

function ridePayload(delayMinutes = 0) {
  const shiftMs = delayMinutes * 60_000;
  return {
    destination: "Kamppi",
    line: "4",
    mode: "TRAM",
    route: [
      { lat: 60.19, lon: 24.91 },
      { lat: 60.185, lon: 24.92 },
      { lat: 60.18, lon: 24.93 },
      { lat: 60.175, lon: 24.935 },
      { lat: 60.17, lon: 24.94 },
    ],
    stops: [
      {
        arrivalIso: new Date(FIXED_NOW_MS - 3 * 60_000).toISOString(),
        code: "H0101",
        lat: 60.19,
        lon: 24.91,
        name: "Munkkiniemi",
        platform: null,
        realtime: true,
        stopId: "HSL:1",
      },
      {
        arrivalIso: new Date(FIXED_NOW_MS + 2 * 60_000 + shiftMs).toISOString(),
        code: "H0102",
        lat: 60.185,
        lon: 24.92,
        name: "Meilahti",
        platform: null,
        realtime: true,
        stopId: "HSL:2",
      },
      {
        arrivalIso: new Date(FIXED_NOW_MS + 5 * 60_000 + shiftMs).toISOString(),
        code: "H0103",
        lat: 60.18,
        lon: 24.93,
        name: "Toolo",
        platform: null,
        realtime: true,
        stopId: "HSL:3",
      },
      {
        arrivalIso: new Date(FIXED_NOW_MS + 8 * 60_000 + shiftMs).toISOString(),
        code: "H0104",
        lat: 60.175,
        lon: 24.935,
        name: "Lasipalatsi",
        platform: null,
        realtime: true,
        stopId: "HSL:4",
      },
      {
        arrivalIso: new Date(FIXED_NOW_MS + 11 * 60_000 + shiftMs).toISOString(),
        code: "H0105",
        lat: 60.17,
        lon: 24.94,
        name: "Kamppi",
        platform: "2",
        realtime: true,
        stopId: "HSL:5",
      },
    ],
    tripId: "HSL:TRIP_4",
    vehicle: { lat: 60.187, lon: 24.916 },
  };
}

function trainRidePayload(tripId: string, line: string) {
  return {
    destination: "Lentoasema",
    line,
    mode: "RAIL",
    route: [
      { lat: 60.1719, lon: 24.9414 },
      { lat: 60.294, lon: 24.967 },
    ],
    stops: [
      {
        arrivalIso: new Date(FIXED_NOW_MS + 20 * 60_000).toISOString(),
        code: "HKI",
        lat: 60.1719,
        lon: 24.9414,
        name: "Helsinki",
        platform: "16",
        realtime: true,
        stopId: "HSL:HKI_RAIL",
      },
      {
        arrivalIso: new Date(FIXED_NOW_MS + 48 * 60_000).toISOString(),
        code: "LEN",
        lat: 60.294,
        lon: 24.967,
        name: "Lentoasema",
        platform: "1",
        realtime: true,
        stopId: "HSL:LENTOASEMA",
      },
    ],
    tripId,
    vehicle: { lat: 60.1719, lon: 24.9414 },
  };
}

function transfersPayload() {
  return {
    availableModes: ["RAIL", "TRAM", "BUS"],
    mode: "RAIL",
    options: [
      {
        departureIso: new Date(FIXED_NOW_MS + 14 * 60_000).toISOString(),
        destination: "Lentoasema",
        distanceMeters: 150,
        line: "I",
        mode: "RAIL",
        platform: "16",
        stopId: "HSL:HKI_RAIL",
        stopName: "Helsinki",
        tripId: "HSL:I_1244",
      },
      {
        departureIso: new Date(FIXED_NOW_MS + 20 * 60_000).toISOString(),
        destination: "Lentoasema",
        distanceMeters: 150,
        line: "P",
        mode: "RAIL",
        platform: "18",
        stopId: "HSL:HKI_RAIL",
        stopName: "Helsinki",
        tripId: "HSL:P_1250",
      },
    ],
  };
}

async function installMocks(page: Page, world: World): Promise<void> {
  await installFixedNow(page, FIXED_NOW_MS);
  await page.route("**/api/v1/departures**", async (route) => {
    const url = new URL(route.request().url());
    const stopId = url.searchParams.get("stopId") || "HSL:2";
    world.requestedStopIds.push(stopId);
    const name = stopId === "HSL:3" ? "Toolo" : "Meilahti";
    await route.fulfill({
      body: JSON.stringify(departuresPayload(stopId, name)),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/v1/vehicle-span**", async (route) => {
    const event = {
      stop: { lat: 60.185, lon: 24.92 },
      type: "place",
    };
    await route.fulfill({
      body: `event: place\ndata: ${JSON.stringify(event)}\n\n`,
      contentType: "text/event-stream",
      status: 200,
    });
  });
  await page.route("**/api/v1/ride**", async (route) => {
    const url = new URL(route.request().url());
    const tripId = url.searchParams.get("tripId") || "HSL:TRIP_4";
    const body =
      tripId === "HSL:P_1250"
        ? trainRidePayload(tripId, "P")
        : tripId === "HSL:I_1244"
          ? trainRidePayload(tripId, "I")
          : ridePayload(world.delayMinutes);
    await route.fulfill({
      body: JSON.stringify(body),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/v1/transfers**", async (route) => {
    await route.fulfill({
      body: JSON.stringify(transfersPayload()),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/v1/walk**", async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        points: [
          { lat: 60.175, lon: 24.935 },
          { lat: 60.1719, lon: 24.9414 },
        ],
        seconds: 120,
      }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.route("**/api/v1/map-tile**", async (route) => {
    await route.fulfill({
      body: TILE_PNG,
      contentType: "image/png",
      status: 200,
    });
  });
}

definePlaywrightFeature<World>(
  test,
  `
Feature: Wait and Ride view switching with Apple Liquid Glass dock

  Scenario: Boarding a ride from Wait, pinning an exit, toggling the route map, and jumping to Wait here
    Given Wait and Ride API mocks are installed
    When the app opens on mobile viewport
    Then the floating Liquid Glass dock sits centered at the bottom inside the viewport
    When the rider opens Tram 4 and taps Ride
    Then the Ride view shows next stop Meilahti and the URL reflects ride view
    When the rider pins Toolo as their exit stop and opens the collapsible route map
    Then the Ride exit card shows Toolo and the live route map is visible
    When the rider taps Wait here for the pinned exit
    Then the Wait view opens anchored on stop HSL:3

  Scenario: Reloading a Ride URL restores the active Ride view and pinned exit
    Given Wait and Ride API mocks are installed
    When the rider opens the bookmarked Ride URL for trip HSL:TRIP_4 with exit HSL:4
    Then the Ride view is active with Lasipalatsi pinned as exit

  Scenario: Watching a live transfer detects a missed connection, recovers with Watch next, and boards the next leg
    Given Wait and Ride API mocks are installed
    When the rider opens the bookmarked Ride URL for trip HSL:TRIP_4 with exit HSL:4
    And the rider opens Transfers and pins transfer option HSL:I_1244
    Then the browser Live Transfer Watch shows line I with make-it status
    When the tram is delayed by 6 minutes on the next live poll
    Then the browser Live Transfer Watch shows line I with missed status
    When the rider taps Watch next and then Board transfer
    Then the Ride view chains onto Lentoasema on trip HSL:P_1250
  `,
  {
    createWorld: async () => ({ delayMinutes: 0, requestedStopIds: [] }),
    stepDefinitions: [
      {
        pattern: /^Given Wait and Ride API mocks are installed$/,
        run: async ({ fixtures, world }) => {
          await installMocks(fixtures.page as Page, world);
        },
      },
      {
        pattern: /^When the app opens on mobile viewport$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as Page;
          await page.setViewportSize({ width: 390, height: 844 });
          await page.goto("/?mode=tram");
          await page.waitForSelector(".departure-card");
        },
      },
      {
        pattern: /^Then the floating Liquid Glass dock sits centered at the bottom inside the viewport$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as Page;
          const viewport = page.viewportSize();
          const box = await page.locator("[data-glass-capsule]").boundingBox();
          assert.equal(Boolean(viewport && box), true);
          const centerX = (box?.x || 0) + (box?.width || 0) / 2;
          assert.equal(Math.abs(centerX - (viewport?.width || 0) / 2) <= 4, true);
          assert.equal((box?.y || 0) + (box?.height || 0) <= (viewport?.height || 0), true);
        },
      },
      {
        pattern: /^When the rider opens Tram 4 and taps Ride$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as Page;
          await page.locator(".departure-card__open").first().click();
          await page.locator('[data-map-ride="true"]').click();
          await page.locator("[data-ride-next-stop]").waitFor({ state: "visible" });
        },
      },
      {
        pattern: /^Then the Ride view shows next stop (.+) and the URL reflects ride view$/,
        run: async ({ args, assert, fixtures }) => {
          const page = fixtures.page as Page;
          const text = (await page.locator("[data-ride-next-stop]").textContent()) || "";
          assert.match(text, new RegExp(args[0]));
          assert.match(page.url(), /view=ride/);
          assert.match(page.url(), /trip=HSL%3ATRIP_4/);
        },
      },
      {
        pattern: /^When the rider pins (.+) as their exit stop and opens the collapsible route map$/,
        run: async ({ args, fixtures }) => {
          const page = fixtures.page as Page;
          await page.locator("[data-ride-stop]", { hasText: args[0] }).click();
          await page.locator('[data-ride-map-toggle="true"]').click();
          await page.locator('[data-ride-map="true"]').waitFor({ state: "visible" });
        },
      },
      {
        pattern: /^Then the Ride exit card shows (.+) and the live route map is visible$/,
        run: async ({ args, assert, fixtures }) => {
          const page = fixtures.page as Page;
          const exitText = (await page.locator("[data-ride-exit-summary]").textContent()) || "";
          assert.match(exitText, new RegExp(args[0]));
          const markerVisible = await page.locator('[data-ride-vehicle-marker="true"]').isVisible();
          assert.equal(markerVisible, true);
        },
      },
      {
        pattern: /^When the rider taps Wait here for the pinned exit$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as Page;
          await page.locator('[data-ride-wait-here="true"]').click();
          await page.locator('[data-view-panel="wait"]').waitFor({ state: "visible" });
        },
      },
      {
        pattern: /^Then the Wait view opens anchored on stop (.+)$/,
        run: async ({ args, assert, fixtures, world }) => {
          const page = fixtures.page as Page;
          const waitVisible = await page.locator('[data-view-panel="wait"]').isVisible();
          assert.equal(waitVisible, true);
          assert.equal(world.requestedStopIds.includes(args[0]), true);
        },
      },
      {
        pattern: /^When the rider opens the bookmarked Ride URL for trip (.+) with exit (.+)$/,
        run: async ({ args, fixtures }) => {
          const page = fixtures.page as Page;
          await page.setViewportSize({ width: 390, height: 844 });
          await page.goto(
            `/?mode=tram&view=ride&trip=${encodeURIComponent(args[0])}&exit=${encodeURIComponent(args[1])}`,
          );
          await page.locator("[data-ride-exit-summary]").waitFor({ state: "visible" });
        },
      },
      {
        pattern: /^Then the Ride view is active with (.+) pinned as exit$/,
        run: async ({ args, assert, fixtures }) => {
          const page = fixtures.page as Page;
          const rideVisible = await page.locator('[data-view-panel="ride"]').isVisible();
          const exitText = (await page.locator("[data-ride-exit-summary]").textContent()) || "";
          assert.equal(rideVisible, true);
          assert.match(exitText, new RegExp(args[0]));
        },
      },
      {
        pattern: /^When the rider opens Transfers and pins transfer option (.+)$/,
        run: async ({ args, fixtures }) => {
          const page = fixtures.page as Page;
          await page.locator('[data-ride-transfers-toggle="true"]').click();
          await page.locator(`[data-transfer-option="${args[0]}"]`).waitFor({ state: "visible" });
          await page.locator(`[data-transfer-option="${args[0]}"]`).click();
          await page.locator('[data-transfer-watch="true"]').waitFor({ state: "visible" });
        },
      },
      {
        pattern: /^Then the browser Live Transfer Watch shows line (.+) with (make-it|tight|missed) status$/,
        run: async ({ args, assert, fixtures }) => {
          const page = fixtures.page as Page;
          const watch = page.locator(`[data-transfer-watch="true"][data-feasibility="${args[1]}"]`);
          await watch.waitFor({ state: "visible", timeout: 8000 });
          const line = (await watch.locator(".ride-transfer-watch__line").textContent()) || "";
          assert.equal(line, args[0]);
        },
      },
      {
        pattern: /^When the tram is delayed by (\d+) minutes on the next live poll$/,
        run: async ({ args, world }) => {
          world.delayMinutes = Number(args[0]);
        },
      },
      {
        pattern: /^When the rider taps Watch next and then Board transfer$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as Page;
          await page.locator('[data-transfer-watch-next="true"]').click();
          await page
            .locator('[data-transfer-watch="true"][data-feasibility="make-it"]')
            .waitFor({ state: "visible" });
          await page.locator('[data-transfer-board="true"]').click();
          await page.locator(".ride-head", { hasText: "Lentoasema" }).waitFor({ state: "visible" });
        },
      },
      {
        pattern: /^Then the Ride view chains onto (.+) on trip (.+)$/,
        run: async ({ args, assert, fixtures }) => {
          const page = fixtures.page as Page;
          const head = (await page.locator(".ride-head").textContent()) || "";
          assert.match(head, new RegExp(args[0]));
          assert.match(page.url(), new RegExp(encodeURIComponent(args[1])));
        },
      },
    ],
  },
);
