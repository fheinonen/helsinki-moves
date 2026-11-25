import { afterEach, test, vi } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore, type AppStore } from "@client/app/app-store";
import { createAppController, type AppController } from "@client/app/app-controller";
import { renderAppShell } from "@client/app/app-shell";
import type { DeparturesClient } from "@client/services/departures-client";
import type { RideSnapshot } from "@shared/domain/ride";

type DeparturesRequestInput = Parameters<DeparturesClient["getDepartures"]>[0];

const NOW_MS = Date.parse("2026-03-07T12:30:00.000Z");

interface World {
  cleanup?: () => void;
  controller?: AppController;
  departureRequests?: DeparturesRequestInput[];
  root?: HTMLDivElement;
  snapshot?: RideSnapshot | null;
  store?: AppStore;
}

afterEach(() => {
  vi.useRealTimers();
});

function createActiveSnapshot(options: { arrived?: boolean; live?: boolean } = {}): RideSnapshot {
  const offset = options.arrived ? -20 : 0;
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
        arrivalIso: new Date(NOW_MS + (offset - 2) * 60_000).toISOString(),
        code: "H0101",
        lat: 60.19,
        lon: 24.91,
        name: "Munkkiniemi",
        platform: null,
        realtime: true,
        stopId: "HSL:1",
      },
      {
        arrivalIso: new Date(NOW_MS + (offset + 2) * 60_000).toISOString(),
        code: "H0102",
        lat: 60.185,
        lon: 24.92,
        name: "Meilahti",
        platform: null,
        realtime: true,
        stopId: "HSL:2",
      },
      {
        arrivalIso: new Date(NOW_MS + (offset + 5) * 60_000).toISOString(),
        code: "H0103",
        lat: 60.18,
        lon: 24.93,
        name: "Toolo",
        platform: null,
        realtime: true,
        stopId: "HSL:3",
      },
      {
        arrivalIso: new Date(NOW_MS + (offset + 8) * 60_000).toISOString(),
        code: "H0104",
        lat: 60.175,
        lon: 24.935,
        name: "Lasipalatsi",
        platform: null,
        realtime: true,
        stopId: "HSL:4",
      },
      {
        arrivalIso: new Date(NOW_MS + (offset + 11) * 60_000).toISOString(),
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
    vehicle: options.live === false ? null : { lat: 60.187, lon: 24.916 },
  };
}

function mountShell(world: World, snapshot: RideSnapshot | null): void {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  const store = createAppStore({ activeMode: "TRAM" });
  const requests: DeparturesRequestInput[] = [];
  const controller = createAppController({
    departuresClient: {
      async getDepartures(input) {
        requests.push(input);
        return {
          filterOptions: { destinations: [], lines: [] },
          mode: input.mode,
          selectedStopId: input.stopId || "HSL:2",
          station: {
            departures: [
              {
                departureIso: new Date(NOW_MS + 2 * 60_000).toISOString(),
                destination: "Kamppi",
                line: "4",
                stopCode: "H0102",
                stopId: "HSL:2",
                tripId: "HSL:TRIP_4",
              },
            ],
            distanceMeters: 60,
            stopCode: "H0102",
            stopCodes: ["H0102"],
            stopName: "Meilahti",
            type: "stop",
          },
          stops: [
            {
              code: "H0102",
              distanceMeters: 60,
              id: "HSL:2",
              memberStopIds: ["HSL:2"],
              name: "Meilahti",
              stopCodes: ["H0102"],
            },
          ],
        };
      },
      async getLaterDepartures() {
        return { departures: [] };
      },
    },
    locationService: {
      async getCurrentPosition() {
        return { ok: true, value: { lat: 60.185, lon: 24.92 } };
      },
    },
    store,
  });

  store.applyDeparturesResponse({
    filterOptions: {
      destinations: [{ count: 1, value: "Kamppi" }],
      lines: [{ count: 1, value: "4" }],
    },
    mode: "TRAM",
    selectedStopId: "HSL:2",
    station: {
      departures: [
        {
          departureIso: new Date(NOW_MS + 2 * 60_000).toISOString(),
          destination: "Kamppi",
          line: "4",
          stopCode: "H0102",
          stopId: "HSL:2",
          tripId: "HSL:TRIP_4",
        },
      ],
      distanceMeters: 60,
      stopCode: "H0102",
      stopCodes: ["H0102"],
      stopName: "Meilahti",
      type: "stop",
    },
    stops: [
      {
        code: "H0102",
        distanceMeters: 60,
        id: "HSL:2",
        memberStopIds: ["HSL:2"],
        name: "Meilahti",
        stopCodes: ["H0102"],
      },
    ],
  });

  const root = document.createElement("div");
  document.body.appendChild(root);
  world.snapshot = snapshot;
  world.cleanup = renderAppShell({
    controller,
    documentRef: document,
    fetchRide: async () => world.snapshot ?? null,
    openVehicleSpan: ({ onEvent }) => {
      onEvent({
        stop: { lat: 60.185, lon: 24.92 },
        type: "place",
      });
      return () => undefined;
    },
    root,
  });
  world.controller = controller;
  world.departureRequests = requests;
  world.root = root;
  world.store = store;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

defineFeature<World>(
  test,
  `
Feature: Wait and Ride view user flows

  Scenario: Switching to Ride without a trip shows imminent departures and lets the rider pick one
    Given the app shell is loaded with Tram 4 to Kamppi
    When the rider switches to the Ride view via the Liquid Glass pill
    Then the Ride quick-pick list offers Tram 4 to Kamppi
    When the rider picks Tram 4 from the Ride quick-pick list
    Then the Ride hero shows next stop Meilahti

  Scenario: Tapping Ride from an open departure vehicle map boards that trip
    Given the app shell is loaded with Tram 4 to Kamppi
    When the rider opens the departure map for Tram 4 and taps Ride
    Then the active view panel is ride
    And the Ride hero shows next stop Meilahti

  Scenario: Pinning an exit stop shows countdown, dims later stops, and omits Wait here
    Given the app shell is riding Tram 4 to Kamppi with live telemetry
    When the rider taps Toolo on the Ride stop ribbon
    Then the exit summary shows Toolo with approaching urgency
    And Kamppi is dimmed beyond the exit
    And the active exit card omits Wait here

  Scenario: Toggling the collapsible route map shows only the active vehicle-to-stop span and reframes on exit pin
    Given the app shell is riding Tram 4 to Kamppi with live telemetry
    When the rider toggles the Ride route map
    Then the Ride route map is visible with a live vehicle marker
    And the Ride route map frames only up to target stop Meilahti without Munkkiniemi or Kamppi
    When the rider taps Toolo on the Ride stop ribbon
    Then the Ride route map frames only up to target stop Toolo without Munkkiniemi or Kamppi
    And the Ride route map sits directly below the Ride header and above the exit card
    When the rider toggles the Ride route map
    Then the Ride route map is hidden

  Scenario: An arrived trip displays the calm Arrived card with See departures here
    Given the app shell is riding an already arrived Tram 4 trip
    Then the Ride view shows the Arrived card for Kamppi
    When the rider taps See departures here on the Arrived card
    Then the active view panel is wait
    And Wait requested departures for stop HSL:5

  Scenario: Rider can expand passed stops, clear a pinned exit, and end the ride
    Given the app shell is riding Tram 4 to Kamppi with live telemetry
    When the rider taps Toolo on the Ride stop ribbon
    And the rider expands passed stops and clears the exit pin
    Then passed stop Munkkiniemi is visible and no exit summary is shown
    When the rider ends the active ride
    Then the Ride quick-pick list offers Tram 4 to Kamppi

  Scenario: Missing trip snapshot falls back to calm Arrived state and timetable map omits vehicle dot
    Given the app shell is riding Tram 4 with timetable-only telemetry
    When the rider toggles the Ride route map
    Then the Ride route map is visible without a live vehicle marker
    When the trip snapshot disappears on the next poll
    Then the Ride view shows the Arrived card for Kamppi
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app shell is loaded with Tram 4 to Kamppi$/,
        run: ({ world }) => {
          mountShell(world, createActiveSnapshot({ live: true }));
        },
      },
      {
        pattern: /^Given the app shell is riding Tram 4 to Kamppi with live telemetry$/,
        run: async ({ world }) => {
          mountShell(world, createActiveSnapshot({ live: true }));
          world.controller?.startRide({
            boardedStopId: "HSL:2",
            destination: "Kamppi",
            line: "4",
            tripId: "HSL:TRIP_4",
          });
          await flushMicrotasks();
        },
      },
      {
        pattern: /^Given the app shell is riding Tram 4 with timetable-only telemetry$/,
        run: async ({ world }) => {
          mountShell(world, createActiveSnapshot({ live: false }));
          world.controller?.startRide({
            boardedStopId: "HSL:2",
            destination: "Kamppi",
            line: "4",
            tripId: "HSL:TRIP_4",
          });
          await flushMicrotasks();
        },
      },
      {
        pattern: /^Given the app shell is riding an already arrived Tram 4 trip$/,
        run: async ({ world }) => {
          mountShell(world, createActiveSnapshot({ arrived: true, live: false }));
          world.controller?.startRide({
            boardedStopId: "HSL:2",
            destination: "Kamppi",
            line: "4",
            tripId: "HSL:TRIP_4",
          });
          await flushMicrotasks();
        },
      },
      {
        pattern: /^When the rider switches to the Ride view via the Liquid Glass pill$/,
        run: async ({ world }) => {
          world.root?.querySelector<HTMLButtonElement>('[data-view-tab="ride"]')?.click();
          await flushMicrotasks();
        },
      },
      {
        pattern: /^When the rider picks Tram 4 from the Ride quick-pick list$/,
        run: async ({ world }) => {
          world.root?.querySelector<HTMLButtonElement>("[data-ride-pick]")?.click();
          await flushMicrotasks();
        },
      },
      {
        pattern: /^When the rider opens the departure map for Tram 4 and taps Ride$/,
        run: async ({ world }) => {
          world.root?.querySelector<HTMLButtonElement>(".departure-card__open")?.click();
          world.root?.querySelector<HTMLButtonElement>('[data-map-ride="true"]')?.click();
          await flushMicrotasks();
        },
      },
      {
        pattern: /^When the rider taps (.+) on the Ride stop ribbon$/,
        run: async ({ args, world }) => {
          const buttons = [...(world.root?.querySelectorAll<HTMLButtonElement>("[data-ride-stop]") ?? [])];
          const target = buttons.find((button) => button.textContent?.includes(args[0]));
          target?.click();
          await flushMicrotasks();
        },
      },
      {
        pattern: /^When the rider taps See departures here on the Arrived card$/,
        run: async ({ world }) => {
          world.root
            ?.querySelector<HTMLButtonElement>('[data-ride-arrived="true"] [data-ride-wait-here="true"]')
            ?.click();
          await flushMicrotasks();
        },
      },
      {
        pattern: /^When the rider toggles the Ride route map$/,
        run: async ({ world }) => {
          world.root?.querySelector<HTMLButtonElement>('[data-ride-map-toggle="true"]')?.click();
          await flushMicrotasks();
        },
      },
      {
        pattern: /^Then the Ride quick-pick list offers Tram 4 to Kamppi$/,
        run: ({ assert, world }) => {
          const text = world.root?.querySelector("[data-ride-quick-pick]")?.textContent || "";
          assert.match(text, /4/);
          assert.match(text, /Kamppi/);
        },
      },
      {
        pattern: /^Then the Ride hero shows next stop (.+)$/,
        run: ({ args, assert, world }) => {
          const hero = world.root?.querySelector("[data-ride-next-stop]")?.textContent || "";
          assert.match(hero, new RegExp(args[0]));
        },
      },
      {
        pattern: /^Then the active view panel is (wait|ride)$/,
        run: ({ args, assert, world }) => {
          const waitPanel = world.root?.querySelector<HTMLElement>('[data-view-panel="wait"]');
          const ridePanel = world.root?.querySelector<HTMLElement>('[data-view-panel="ride"]');
          assert.equal(waitPanel?.hidden, args[0] !== "wait");
          assert.equal(ridePanel?.hidden, args[0] !== "ride");
        },
      },
      {
        pattern: /^Then the exit summary shows (.+) with (.+) urgency$/,
        run: ({ args, assert, world }) => {
          const exitCard = world.root?.querySelector<HTMLElement>("[data-ride-exit-summary]");
          assert.match(exitCard?.textContent || "", new RegExp(args[0]));
          assert.equal(exitCard?.dataset.exitUrgency, args[1]);
        },
      },
      {
        pattern: /^Then the active exit card omits Wait here$/,
        run: ({ assert, world }) => {
          const exitCard = world.root?.querySelector<HTMLElement>("[data-ride-exit-summary]");
          assert.equal(exitCard?.querySelector('[data-ride-wait-here="true"]'), null);
        },
      },
      {
        pattern: /^Then (.+) is dimmed beyond the exit$/,
        run: ({ args, assert, world }) => {
          const stops = [...(world.root?.querySelectorAll<HTMLElement>("[data-ride-stop]") ?? [])];
          const target = stops.find((node) => node.textContent?.includes(args[0]));
          assert.equal(target?.dataset.stopState, "beyond-exit");
        },
      },
      {
        pattern: /^Then Wait requested departures for stop (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.departureRequests?.[0]?.stopId, args[0]);
        },
      },
      {
        pattern: /^Then the Ride route map is visible with a live vehicle marker$/,
        run: ({ assert, world }) => {
          const map = world.root?.querySelector<HTMLElement>('[data-ride-map="true"]');
          const marker = map?.querySelector<HTMLElement>('[data-ride-vehicle-marker="true"]');
          assert.equal(Boolean(map && !map.hidden), true);
          assert.equal(Boolean(marker && marker.dataset.lat), true);
        },
      },
      {
        pattern: /^Then the Ride route map frames only up to target stop (.+) without (.+) or (.+)$/,
        run: ({ args, assert, world }) => {
          const map = world.root?.querySelector<HTMLElement>('[data-ride-map="true"]');
          const stopMarker = map?.querySelector<HTMLElement>('[data-stop-marker="true"]');
          assert.equal(stopMarker?.getAttribute("aria-label"), args[0]);
          const stopIds = [...(map?.querySelectorAll<HTMLElement>("[data-ride-stop-dot]") ?? [])].map(
            (dot) => dot.dataset.rideStopDot,
          );
          const idByName: Record<string, string> = {
            Kamppi: "HSL:5",
            Lasipalatsi: "HSL:4",
            Meilahti: "HSL:2",
            Munkkiniemi: "HSL:1",
            Toolo: "HSL:3",
          };
          assert.equal(stopIds.includes(idByName[args[1]]), false);
          assert.equal(stopIds.includes(idByName[args[2]]), false);
        },
      },
      {
        pattern: /^Then the Ride route map sits directly below the Ride header and above the exit card$/,
        run: ({ assert, world }) => {
          const head = world.root?.querySelector<HTMLElement>(".ride-head");
          const map = world.root?.querySelector<HTMLElement>('[data-ride-map="true"]');
          const exitCard = world.root?.querySelector<HTMLElement>("[data-ride-exit-summary]");
          assert.equal(head?.nextElementSibling, map);
          assert.equal(
            Boolean(
              map &&
                exitCard &&
                (map.compareDocumentPosition(exitCard) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
            ),
            true,
          );
        },
      },
      {
        pattern: /^Then the Ride route map is hidden$/,
        run: ({ assert, world }) => {
          const map = world.root?.querySelector<HTMLElement>('[data-ride-map="true"]');
          assert.equal(map?.hidden ?? true, true);
        },
      },
      {
        pattern: /^When the rider expands passed stops and clears the exit pin$/,
        run: async ({ world }) => {
          world.root?.querySelector<HTMLButtonElement>('[data-ride-past-toggle="true"]')?.click();
          world.root?.querySelector<HTMLButtonElement>('[data-ride-unpin-exit="true"]')?.click();
          await flushMicrotasks();
        },
      },
      {
        pattern: /^When the rider ends the active ride$/,
        run: async ({ world }) => {
          world.root?.querySelector<HTMLButtonElement>('[data-ride-end="true"]')?.click();
          await flushMicrotasks();
        },
      },
      {
        pattern: /^When the trip snapshot disappears on the next poll$/,
        run: async ({ world }) => {
          world.snapshot = null;
          vi.advanceTimersByTime(5000);
          await flushMicrotasks();
        },
      },
      {
        pattern: /^Then passed stop (.+) is visible and no exit summary is shown$/,
        run: ({ args, assert, world }) => {
          const stops = [...(world.root?.querySelectorAll<HTMLElement>("[data-ride-stop]") ?? [])];
          const found = stops.some((node) => node.textContent?.includes(args[0]));
          assert.equal(found, true);
          assert.equal(world.root?.querySelector("[data-ride-exit-summary]"), null);
        },
      },
      {
        pattern: /^Then the Ride route map is visible without a live vehicle marker$/,
        run: ({ assert, world }) => {
          const map = world.root?.querySelector<HTMLElement>('[data-ride-map="true"]');
          const marker = map?.querySelector<HTMLElement>('[data-ride-vehicle-marker="true"]');
          assert.equal(Boolean(map && !map.hidden), true);
          assert.equal(marker?.hidden, true);
        },
      },
      {
        pattern: /^Then the Ride view shows the Arrived card for (.+)$/,
        run: ({ args, assert, world }) => {
          const arrived = world.root?.querySelector<HTMLElement>('[data-ride-arrived="true"]');
          assert.equal(Boolean(arrived), true);
          assert.match(arrived?.textContent || "", new RegExp(args[0]));
        },
      },
    ],
  },
);
