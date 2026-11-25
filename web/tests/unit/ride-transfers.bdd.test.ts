import { afterEach, test, vi } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore, type AppStore } from "@client/app/app-store";
import { createAppController, type AppController } from "@client/app/app-controller";
import { renderAppShell } from "@client/app/app-shell";
import { bootstrapApp } from "@client/app/bootstrap";
import { buildSearchFromState } from "@client/lib/persistence/query-state";
import { fetchTransfers, transfersUrl } from "@client/services/transfers-client";
import type { RideSnapshot } from "@shared/domain/ride";
import type { TransfersResponse } from "@shared/domain/transfer";

const NOW_MS = Date.parse("2026-03-07T12:10:00.000Z");

interface World {
  busArrivalOffsetMin?: number;
  busArrived?: boolean;
  cleanup?: () => void;
  controller?: AppController;
  emptyTransfers?: "no-stops" | "no-departures" | null;
  fetchedClientTransfers?: TransfersResponse | null;
  fetchedClientTransfersOk?: TransfersResponse | null;
  fetchedRideTripIds?: string[];
  root?: HTMLDivElement;
  search?: string;
  store?: AppStore;
  transferClientUrl?: string;
  walkCalls?: number;
}

afterEach(() => {
  vi.useRealTimers();
});

function createBusSnapshot(arrivalOffsetMin: number, arrived = false): RideSnapshot {
  const offset = arrived ? -20 : 0;
  return {
    destination: "Pasila",
    line: "500",
    mode: "BUS",
    route: [
      { lat: 60.19, lon: 24.91 },
      { lat: 60.198, lon: 24.933 },
    ],
    stops: [
      {
        arrivalIso: new Date(NOW_MS + (offset - 2) * 60_000).toISOString(),
        code: "H1001",
        lat: 60.19,
        lon: 24.91,
        name: "Meilahti",
        platform: null,
        realtime: true,
        stopId: "HSL:MEILAHTI",
      },
      {
        arrivalIso: new Date(NOW_MS + (arrived ? -5 : arrivalOffsetMin) * 60_000).toISOString(),
        code: "H2101",
        lat: 60.198,
        lon: 24.933,
        name: "Pasila",
        platform: null,
        realtime: true,
        stopId: "HSL:PASILA_BUS",
      },
    ],
    tripId: "HSL:BUS_500",
    vehicle: arrived ? null : { lat: 60.193, lon: 24.92 },
  };
}

function createTrainSnapshot(): RideSnapshot {
  return {
    destination: "Lentoasema",
    line: "I",
    mode: "RAIL",
    route: [
      { lat: 60.1988, lon: 24.9338 },
      { lat: 60.294, lon: 24.967 },
    ],
    stops: [
      {
        arrivalIso: new Date(NOW_MS + 16 * 60_000).toISOString(),
        code: "PSL",
        lat: 60.1988,
        lon: 24.9338,
        name: "Pasila",
        platform: "4",
        realtime: true,
        stopId: "HSL:PASILA_RAIL",
      },
      {
        arrivalIso: new Date(NOW_MS + 40 * 60_000).toISOString(),
        code: "LEN",
        lat: 60.294,
        lon: 24.967,
        name: "Lentoasema",
        platform: "1",
        realtime: true,
        stopId: "HSL:AIRPORT",
      },
    ],
    tripId: "HSL:I_1426",
    vehicle: { lat: 60.195, lon: 24.934 },
  };
}

function createPasilaTransfers(): TransfersResponse {
  return {
    availableModes: ["RAIL", "TRAM", "BUS"],
    mode: "RAIL",
    options: [
      {
        departureIso: new Date(NOW_MS + 16 * 60_000).toISOString(),
        destination: "Lentoasema",
        distanceMeters: 120,
        line: "I",
        mode: "RAIL",
        platform: "4",
        stopId: "HSL:PASILA_RAIL",
        stopName: "Pasila",
        tripId: "HSL:I_1426",
      },
      {
        departureIso: new Date(NOW_MS + 22 * 60_000).toISOString(),
        destination: "Lentoasema",
        distanceMeters: 120,
        line: "P",
        mode: "RAIL",
        platform: "4",
        stopId: "HSL:PASILA_RAIL",
        stopName: "Pasila",
        tripId: "HSL:P_1432",
      },
    ],
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
}

function mountBusRide(world: World): void {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_MS);
  world.busArrivalOffsetMin = 10;
  world.busArrived = false;
  world.walkCalls = 0;
  world.fetchedRideTripIds = [];

  const store = createAppStore({ activeMode: "BUS" });
  const controller = createAppController({
    departuresClient: {
      async getDepartures() {
        return {
          filterOptions: { destinations: [], lines: [] },
          mode: "BUS",
          selectedStopId: "HSL:PASILA_BUS",
          station: null,
          stops: [],
        };
      },
      async getLaterDepartures() {
        return { departures: [] };
      },
    },
    locationService: {
      async getCurrentPosition() {
        return { code: "unavailable", ok: false };
      },
    },
    store,
  });

  const root = document.createElement("div");
  document.body.appendChild(root);
  world.cleanup = renderAppShell({
    controller,
    documentRef: document,
    fetchRide: async ({ tripId }) => {
      world.fetchedRideTripIds?.push(tripId);
      if (tripId === "HSL:I_1426") {
        return createTrainSnapshot();
      }
      return createBusSnapshot(world.busArrivalOffsetMin ?? 10, world.busArrived);
    },
    fetchTransfers: async ({ mode }) => {
      if (world.emptyTransfers === "no-stops") {
        return { availableModes: [], mode: "BUS", options: [] };
      }
      if (world.emptyTransfers === "no-departures") {
        return { availableModes: ["RAIL"], mode: "RAIL", options: [] };
      }
      if (mode === "TRAM") {
        return {
          availableModes: ["RAIL", "TRAM", "BUS"],
          mode: "TRAM",
          options: [
            {
              departureIso: new Date(NOW_MS + 14 * 60_000).toISOString(),
              destination: "Lansiterminaali",
              distanceMeters: 90,
              line: "9",
              mode: "TRAM",
              platform: null,
              stopId: "HSL:PASILA_TRAM",
              stopName: "Pasilan asema",
              tripId: "HSL:TRAM_9",
            },
          ],
        };
      }
      return createPasilaTransfers();
    },
    fetchWalk: async () => {
      world.walkCalls = (world.walkCalls ?? 0) + 1;
      return {
        points: [
          { lat: 60.198, lon: 24.933 },
          { lat: 60.1988, lon: 24.9338 },
        ],
        seconds: 120,
      };
    },
    root,
  });

  controller.startRide({
    boardedStopId: "HSL:MEILAHTI",
    destination: "Pasila",
    exitStopId: "HSL:PASILA_BUS",
    line: "500",
    tripId: "HSL:BUS_500",
  });

  world.controller = controller;
  world.root = root;
  world.store = store;
}

defineFeature<World>(
  test,
  `
Feature: Real-time transfer feasibility inside Ride view

  Scenario: Opening Transfers shows onward Rail departures with live catchability and pins a Live Transfer Watch
    Given the rider is on Bus 500 with Pasila pinned as exit
    When the rider opens Transfers and pins the I-train to Lentoasema
    Then the Live Transfer Watch shows line I with make-it status
    And walking route refinement was requested once for the pinned transfer
    And the synced URL includes transferMode rail and transferTrip HSL:I_1426

  Scenario: Switching transfer modes updates the list and Unwatch clears the Live Transfer Watch
    Given the rider is on Bus 500 with Pasila pinned as exit
    When the rider opens Transfers and switches to the TRAM tab
    Then the Transfers drawer lists line 9 to Lansiterminaali
    When the rider pins transfer option HSL:TRAM_9 and taps Unwatch
    Then the watched transfer is cleared

  Scenario: Empty transfer responses explain when no onward stops or departures are nearby
    Given the rider is on Bus 500 at an exit with no onward stops
    When the rider toggles the Transfers drawer open
    Then the Transfers drawer shows "No onward stops within 350 m of this exit."
    Given the rider is on Bus 500 at an exit with no onward departures
    When the rider toggles the Transfers drawer open
    Then the Transfers drawer shows "No upcoming departures around your arrival."

  Scenario: Bus delay flips the watched transfer to Missed and surfaces Watch next recovery
    Given the rider is on Bus 500 watching the I-train at Pasila
    When Bus 500 slips by 6 minutes on the next live poll
    Then the Live Transfer Watch shows line I with missed status
    And recovery suggests line P with a Watch next action
    When the rider taps Watch next
    Then the Live Transfer Watch shows line P with make-it status

  Scenario: Tapping Board transfer chains Ride directly onto the connecting train
    Given the rider is on Bus 500 watching the I-train at Pasila
    When the rider taps Board transfer
    Then the active Ride switches to trip HSL:I_1426 for Lentoasema

  Scenario: Arriving at Pasila while watching a transfer shows Board transfer on the Arrived card
    Given the rider is on Bus 500 watching the I-train at Pasila
    When Bus 500 finishes at Pasila on the next poll
    Then the Arrived card offers Board transfer for line I

  Scenario: Changing or clearing the Exit stop clears any watched transfer and bootstrap restores transfer params
    Given the app boots from a Ride URL with transferMode rail and transferTrip HSL:I_1426
    Then the restored watched transfer is HSL:I_1426 on mode RAIL
    When the rider clears the exit stop
    Then the watched transfer is cleared

  Scenario: Browser transfers client encodes query parameters and handles OK and non-OK responses
    When the transfers client builds a URL and handles both 200 and 500 responses
    Then the transfers URL targets /api/v1/transfers with mode RAIL
    And the successful transfers fetch returns mode RAIL and the failed fetch returns null
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the rider is on Bus 500 with Pasila pinned as exit$/,
        run: async ({ world }) => {
          mountBusRide(world);
          await flush();
        },
      },
      {
        pattern: /^Given the rider is on Bus 500 watching the I-train at Pasila$/,
        run: async ({ world }) => {
          mountBusRide(world);
          await flush();
          world.root?.querySelector<HTMLButtonElement>('[data-ride-transfers-toggle="true"]')?.click();
          await flush();
          world.root?.querySelector<HTMLButtonElement>('[data-transfer-option="HSL:I_1426"]')?.click();
          await flush();
        },
      },
      {
        pattern: /^Given the app boots from a Ride URL with transferMode rail and transferTrip HSL:I_1426$/,
        run: ({ world }) => {
          const store = createAppStore();
          const controller = createAppController({
            departuresClient: {
              async getDepartures() {
                return {
                  filterOptions: { destinations: [], lines: [] },
                  mode: "BUS",
                  selectedStopId: null,
                  station: null,
                  stops: [],
                };
              },
              async getLaterDepartures() {
                return { departures: [] };
              },
            },
            locationService: {
              async getCurrentPosition() {
                return { code: "unavailable", ok: false };
              },
            },
            store,
          });
          bootstrapApp({
            controller,
            documentRef: document,
            locationRef: {
              pathname: "/",
              search:
                "?mode=bus&view=ride&trip=HSL%3ABUS_500&exit=HSL%3APASILA_BUS&transferMode=rail&transferTrip=HSL%3AI_1426",
            },
            root: document.createElement("div"),
          });
          world.store = store;
          world.controller = controller;
        },
      },
      {
        pattern: /^When the rider opens Transfers and pins the I-train to Lentoasema$/,
        run: async ({ world }) => {
          world.root?.querySelector<HTMLButtonElement>('[data-ride-transfers-toggle="true"]')?.click();
          await flush();
          world.root?.querySelector<HTMLButtonElement>('[data-transfer-option="HSL:I_1426"]')?.click();
          await flush();
          world.search = buildSearchFromState(world.store!.getState());
        },
      },
      {
        pattern: /^When Bus 500 slips by 6 minutes on the next live poll$/,
        run: async ({ world }) => {
          world.busArrivalOffsetMin = 16;
          vi.advanceTimersByTime(5000);
          await flush();
        },
      },
      {
        pattern: /^When the rider taps Watch next$/,
        run: async ({ world }) => {
          world.root?.querySelector<HTMLButtonElement>('[data-transfer-watch-next="true"]')?.click();
          await flush();
        },
      },
      {
        pattern: /^When the rider taps Board transfer$/,
        run: async ({ world }) => {
          world.root?.querySelector<HTMLButtonElement>('[data-transfer-board="true"]')?.click();
          await flush();
        },
      },
      {
        pattern: /^When Bus 500 finishes at Pasila on the next poll$/,
        run: async ({ world }) => {
          world.busArrived = true;
          vi.advanceTimersByTime(5000);
          await flush();
        },
      },
      {
        pattern: /^Given the rider is on Bus 500 at an exit with no onward (stops|departures)$/,
        run: async ({ args, world }) => {
          world.cleanup?.();
          world.root?.remove();
          world.emptyTransfers = args[0] === "stops" ? "no-stops" : "no-departures";
          mountBusRide(world);
          await flush();
        },
      },
      {
        pattern: /^When the rider toggles the Transfers drawer open$/,
        run: async ({ world }) => {
          world.root?.querySelector<HTMLButtonElement>('[data-ride-transfers-toggle="true"]')?.click();
          await flush();
        },
      },
      {
        pattern: /^When the rider opens Transfers and switches to the (RAIL|TRAM|METRO|BUS) tab$/,
        run: async ({ args, world }) => {
          world.root?.querySelector<HTMLButtonElement>('[data-ride-transfers-toggle="true"]')?.click();
          await flush();
          world.root?.querySelector<HTMLButtonElement>(`[data-transfer-mode-tab="${args[0]}"]`)?.click();
          await flush();
        },
      },
      {
        pattern: /^When the rider pins transfer option (.+) and taps Unwatch$/,
        run: async ({ args, world }) => {
          world.root?.querySelector<HTMLButtonElement>(`[data-transfer-option="${args[0]}"]`)?.click();
          await flush();
          world.root?.querySelector<HTMLButtonElement>('[data-transfer-unwatch="true"]')?.click();
          await flush();
        },
      },
      {
        pattern: /^When the rider clears the exit stop$/,
        run: ({ world }) => {
          world.controller?.setRideExitStop(null);
        },
      },
      {
        pattern: /^When the transfers client builds a URL and handles both 200 and 500 responses$/,
        run: async ({ world }) => {
          world.transferClientUrl = transfersUrl({
            arrivalIso: "2026-03-07T12:20:00.000Z",
            lat: 60.198,
            lon: 24.933,
            mode: "RAIL",
            rideMode: "BUS",
          });
          world.fetchedClientTransfersOk = await fetchTransfers({
            arrivalIso: "2026-03-07T12:20:00.000Z",
            fetchImpl: async () =>
              new Response(JSON.stringify(createPasilaTransfers()), {
                headers: { "content-type": "application/json" },
                status: 200,
              }),
            lat: 60.198,
            lon: 24.933,
            rideMode: "BUS",
          });
          world.fetchedClientTransfers = await fetchTransfers({
            arrivalIso: "2026-03-07T12:20:00.000Z",
            fetchImpl: async () => new Response("err", { status: 500 }),
            lat: 60.198,
            lon: 24.933,
            mode: "RAIL",
            rideMode: "BUS",
          });
        },
      },
      {
        pattern: /^Then the Live Transfer Watch shows line (.+) with (make-it|tight|missed) status$/,
        run: ({ args, assert, world }) => {
          const watch = world.root?.querySelector<HTMLElement>('[data-transfer-watch="true"]');
          assert.equal(watch?.dataset.feasibility, args[1]);
          assert.equal(watch?.querySelector(".ride-transfer-watch__line")?.textContent, args[0]);
        },
      },
      {
        pattern: /^Then walking route refinement was requested once for the pinned transfer$/,
        run: ({ assert, world }) => {
          assert.equal(world.walkCalls, 1);
        },
      },
      {
        pattern: /^Then the synced URL includes transferMode (.+) and transferTrip (.+)$/,
        run: ({ args, assert, world }) => {
          const params = new URLSearchParams(world.search || "");
          assert.equal(params.get("transferMode"), args[0]);
          assert.equal(params.get("transferTrip"), args[1]);
        },
      },
      {
        pattern: /^Then recovery suggests line (.+) with a Watch next action$/,
        run: ({ args, assert, world }) => {
          const recovery = world.root?.querySelector<HTMLElement>('[data-transfer-recovery="true"]');
          const button = world.root?.querySelector<HTMLButtonElement>('[data-transfer-watch-next="true"]');
          assert.match(recovery?.textContent || "", new RegExp(`\\b${args[0]}\\b`));
          assert.equal(Boolean(button), true);
        },
      },
      {
        pattern: /^Then the active Ride switches to trip (.+) for (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.store?.getState().ride.tripId, args[0]);
          const head = world.root?.querySelector(".ride-head")?.textContent || "";
          assert.match(head, new RegExp(args[1]));
        },
      },
      {
        pattern: /^Then the Arrived card offers Board transfer for line (.+)$/,
        run: ({ args, assert, world }) => {
          const arrived = world.root?.querySelector<HTMLElement>('[data-ride-arrived="true"]');
          const boardBtn = arrived?.querySelector<HTMLButtonElement>('[data-transfer-board="true"]');
          assert.equal(Boolean(boardBtn), true);
          assert.match(boardBtn?.textContent || "", new RegExp(`\\b${args[0]}\\b`));
        },
      },
      {
        pattern: /^Then the restored watched transfer is (.+) on mode (RAIL|TRAM|METRO|BUS)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.store?.getState().ride.transferTripId, args[0]);
          assert.equal(world.store?.getState().ride.transferMode, args[1]);
        },
      },
      {
        pattern: /^Then the watched transfer is cleared$/,
        run: ({ assert, world }) => {
          assert.equal(world.store?.getState().ride.transferTripId, null);
          assert.equal(world.store?.getState().ride.transferMode, null);
        },
      },
      {
        pattern: /^Then the Transfers drawer lists line (.+) to (.+)$/,
        run: ({ args, assert, world }) => {
          const drawer = world.root?.querySelector<HTMLElement>('[data-transfers-drawer="true"]');
          assert.equal(drawer?.querySelector(".ride-transfers__line")?.textContent, args[0]);
          assert.equal(drawer?.querySelector(".ride-transfers__destination")?.textContent, args[1]);
        },
      },
      {
        pattern: /^Then the Transfers drawer shows "(.+)"$/,
        run: ({ args, assert, world }) => {
          const status = world.root?.querySelector<HTMLElement>(".ride-transfers__status");
          assert.equal(status?.textContent, args[0]);
        },
      },
      {
        pattern: /^Then the transfers URL targets \/api\/v1\/transfers with mode (RAIL|TRAM|METRO|BUS)$/,
        run: ({ args, assert, world }) => {
          assert.match(world.transferClientUrl || "", /^\/api\/v1\/transfers\?/);
          assert.match(world.transferClientUrl || "", new RegExp(`mode=${args[0]}`));
        },
      },
      {
        pattern: /^Then the successful transfers fetch returns mode (RAIL|TRAM|METRO|BUS) and the failed fetch returns null$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.fetchedClientTransfersOk?.mode, args[0]);
          assert.equal(world.fetchedClientTransfers, null);
        },
      },
    ],
  },
);
