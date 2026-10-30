import { afterAll, test, vi } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppController } from "@client/app/app-controller";
import { createAppStore, type AppStore } from "@client/app/app-store";
import { renderAppShell } from "@client/app/app-shell";
import type { Departure } from "@shared/domain/departure";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";

const FIXED_NOW_MS = Date.parse("2026-03-07T10:00:00.000Z");

interface World {
  cleanup?: () => void;
  container?: HTMLElement;
  departedRow?: HTMLTableRowElement | null;
  laterRow?: HTMLTableRowElement | null;
  store?: AppStore;
}

function isoAfter(ms: number): string {
  return new Date(FIXED_NOW_MS + ms).toISOString();
}

function createDeparturesResponse(departures: Departure[]): DeparturesSuccessResponse {
  return {
    filterOptions: {
      destinations: [
        { count: 1, value: "Eira" },
        { count: 1, value: "Kamppi" },
        { count: 1, value: "Pasila" },
      ],
      lines: [
        { count: 1, value: "18" },
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

function rowByLine(container: HTMLElement | undefined, line: string): HTMLTableRowElement | null {
  const rows = container?.querySelectorAll<HTMLTableRowElement>("tr.departure-card");
  if (!rows) {
    return null;
  }
  for (const row of rows) {
    if (row.querySelector(".departure-card__line")?.textContent === line) {
      return row;
    }
  }
  return null;
}

function timeText(row: HTMLTableRowElement | null | undefined): string {
  return row?.querySelector("time")?.textContent ?? "";
}

afterAll(() => {
  vi.useRealTimers();
});

defineFeature<World>(
  test,
  `
Feature: Departed lines leave the board

  Scenario: A departure that has left plays a leave animation
    Given the clock is frozen with a departure that is about to leave
    When a second passes after that departure time
    Then that departure row plays the leave animation
    And the later departures stay on the board in ascending order

  Scenario: The leave animation removes the departed row
    Given the clock is frozen with a departure that is about to leave
    When a second passes after that departure time
    And the leave animation finishes
    Then the departed row is gone
    And the later departures stay on the board in ascending order

  Scenario: A minute passing updates the shown time without removing the row
    Given the clock is frozen with a departure two minutes away
    When one minute passes
    Then the same row shows one minute
    And that row is not leaving

  Scenario: A future departure dropped from the board does not play the leave animation
    Given the clock is frozen with a departure that is about to leave
    When the board updates without that future departure
    Then that row is gone without the leave animation
    And the later departures stay on the board in ascending order
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the clock is frozen with a departure that is about to leave$/,
        run: ({ world }) => {
          world.cleanup?.();
          vi.useFakeTimers();
          vi.setSystemTime(FIXED_NOW_MS);
          const store = createAppStore();
          store.applyDeparturesResponse(
            createDeparturesResponse([
              {
                departureIso: isoAfter(15_000),
                destination: "Eira",
                line: "18",
                stopId: "HSL:STOP_A",
                tripId: "trip-eira",
              },
              {
                departureIso: isoAfter(10 * 60_000),
                destination: "Kamppi",
                line: "550",
                stopId: "HSL:STOP_A",
                tripId: "trip-kamppi",
              },
              {
                departureIso: isoAfter(20 * 60_000),
                destination: "Pasila",
                line: "510",
                stopId: "HSL:STOP_A",
                tripId: "trip-pasila",
              },
            ]),
          );
          world.store = store;
          mountShell(world);
          world.departedRow = rowByLine(world.container, "18");
          world.laterRow = rowByLine(world.container, "550");
        },
      },
      {
        pattern: /^Given the clock is frozen with a departure two minutes away$/,
        run: ({ world }) => {
          world.cleanup?.();
          vi.useFakeTimers();
          vi.setSystemTime(FIXED_NOW_MS);
          const store = createAppStore();
          store.applyDeparturesResponse(
            createDeparturesResponse([
              {
                departureIso: isoAfter(125_000),
                destination: "Kamppi",
                line: "550",
                stopId: "HSL:STOP_A",
                tripId: "trip-kamppi",
              },
            ]),
          );
          world.store = store;
          mountShell(world);
          world.laterRow = rowByLine(world.container, "550");
        },
      },
      {
        pattern: /^When a second passes after that departure time$/,
        run: () => {
          vi.setSystemTime(FIXED_NOW_MS + 16_000);
          vi.advanceTimersByTime(1000);
        },
      },
      {
        pattern: /^When one minute passes$/,
        run: () => {
          vi.setSystemTime(FIXED_NOW_MS + 60_000);
          vi.advanceTimersByTime(1000);
        },
      },
      {
        pattern: /^When the leave animation finishes$/,
        run: ({ world }) => {
          world.departedRow?.dispatchEvent(new Event("animationend", { bubbles: true }));
        },
      },
      {
        pattern: /^When the board updates without that future departure$/,
        run: ({ world }) => {
          const store = world.store;
          if (!store) {
            throw new Error("Expected app store");
          }
          const current = store.getState().station?.departures ?? [];
          store.applyDeparturesResponse(
            createDeparturesResponse(current.filter((departure) => departure.line !== "18")),
          );
        },
      },
      {
        pattern: /^Then that departure row plays the leave animation$/,
        run: ({ assert, world }) => {
          assert.equal(world.departedRow?.classList.contains("is-leaving"), true);
          assert.equal(world.departedRow?.isConnected, true);
          assert.equal(timeText(world.laterRow), "9m");
        },
      },
      {
        pattern: /^Then the departed row is gone$/,
        run: ({ assert, world }) => {
          assert.equal(world.departedRow?.isConnected, false);
        },
      },
      {
        pattern: /^Then the same row shows one minute$/,
        run: ({ assert, world }) => {
          assert.equal(timeText(world.laterRow), "1m");
          assert.equal(world.laterRow?.isConnected, true);
        },
      },
      {
        pattern: /^Then that row is not leaving$/,
        run: ({ assert, world }) => {
          assert.equal(world.laterRow?.classList.contains("is-leaving"), false);
          assert.equal(world.laterRow?.querySelector(".departure-card__time-previous"), null);
          assert.equal(
            world.laterRow?.querySelector(".departure-card__time")?.classList.contains("is-live"),
            false,
          );
        },
      },
      {
        pattern: /^Then that row is gone without the leave animation$/,
        run: ({ assert, world }) => {
          assert.equal(world.departedRow?.classList.contains("is-leaving"), false);
          assert.equal(world.departedRow?.isConnected, false);
        },
      },
      {
        pattern: /^Then the later departures stay on the board in ascending order$/,
        run: ({ assert, world }) => {
          const lines = [...(world.container?.querySelectorAll("tr.departure-card") ?? [])].map(
            (row) => row.querySelector(".departure-card__line")?.textContent,
          );
          const leaving = world.departedRow?.classList.contains("is-leaving") && world.departedRow.isConnected;
          const expected = leaving ? ["18", "550", "510"] : ["550", "510"];
          assert.equal(lines.join(","), expected.join(","));
          assert.equal(world.container?.querySelector(".app-shell__departures-table")?.hasAttribute("hidden"), false);
        },
      },
    ],
  },
);

function mountShell(world: World): void {
  if (!world.store) {
    throw new Error("Expected app store");
  }
  const documentRef = document.implementation.createHTMLDocument("departure-left");
  documentRef.body.innerHTML = "<div id='root'></div>";
  const root = documentRef.querySelector<HTMLElement>("#root");
  if (!root) {
    throw new Error("Expected root");
  }
  const locationService: LocationService = {
    async getCurrentPosition() {
      return { code: "unavailable", ok: false };
    },
  };
  const departuresClient: DeparturesClient = {
    async getDepartures() {
      throw new Error("Departures client should not be called");
    },
  };
  const controller = createAppController({
    departuresClient,
    locationService,
    store: world.store,
  });
  world.cleanup = renderAppShell({
    controller,
    documentRef,
    root,
  });
  world.container = root;
}
