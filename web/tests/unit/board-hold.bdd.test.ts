import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore } from "@client/app/app-store";
import { renderAppShell } from "@client/app/app-shell";
import { createAppController, type AppController } from "@client/app/app-controller";
import type { LocationService } from "@client/services/location-service";
import type { Departure } from "@shared/domain/departure";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";

const CLOCK_MS = Date.parse("2026-03-07T10:00:00.000Z");
const LOADING_STATUS = "Loading nearby departures...";
const END_SCROLL_TOP = 40;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

interface ScrollBox {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}

interface World {
  box: ScrollBox;
  bus: Deferred<DeparturesSuccessResponse>;
  container?: HTMLElement;
  controller?: AppController;
  documentRef?: Document;
  holdLater: boolean;
  later: Deferred<{ departures: Departure[] }>;
  laterCalls: number;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function atMinute(minutes: number): string {
  return new Date(CLOCK_MS + minutes * 60_000).toISOString();
}

function railDeparture(line: string, minutes: number): Departure {
  return {
    departureIso: atMinute(minutes),
    destination: "Helsinki",
    line,
    stopId: "HSL:GLANCE",
  };
}

function railResponse(): DeparturesSuccessResponse {
  return {
    filterOptions: {
      destinations: [{ count: 5, value: "Helsinki" }],
      lines: [
        { count: 4, value: "A" },
        { count: 1, value: "Z" },
      ],
    },
    mode: "RAIL",
    selectedStopId: "HSL:GLANCE",
    station: {
      departures: [
        railDeparture("A", 5),
        railDeparture("A", 10),
        railDeparture("A", 15),
        railDeparture("A", 20),
      ],
      distanceMeters: 40,
      stopCode: "1",
      stopCodes: ["1"],
      stopName: "Pasila",
      type: "stop",
    },
    stops: [
      {
        code: "1",
        distanceMeters: 40,
        id: "HSL:GLANCE",
        memberStopIds: ["HSL:GLANCE"],
        name: "Pasila",
        stopCodes: ["1"],
      },
    ],
  };
}

function busResponse(): DeparturesSuccessResponse {
  return {
    filterOptions: {
      destinations: [{ count: 1, value: "Kamppi" }],
      lines: [{ count: 1, value: "550" }],
    },
    mode: "BUS",
    selectedStopId: "HSL:BUS",
    station: {
      departures: [
        {
          departureIso: atMinute(6),
          destination: "Kamppi",
          line: "550",
          stopId: "HSL:BUS",
        },
      ],
      distanceMeters: 80,
      stopCode: "B1",
      stopCodes: ["B1"],
      stopName: "Kamppi",
      type: "stop",
    },
    stops: [
      {
        code: "B1",
        distanceMeters: 80,
        id: "HSL:BUS",
        memberStopIds: ["HSL:BUS"],
        name: "Kamppi",
        stopCodes: ["B1"],
      },
    ],
  };
}

function hiddenSuffix(): Departure[] {
  return [railDeparture("Z", 41)];
}

function installScroll(documentRef: Document, box: ScrollBox): void {
  const scrolling = documentRef.documentElement;
  Object.defineProperty(documentRef, "scrollingElement", {
    configurable: true,
    get: () => scrolling,
  });
  Object.defineProperty(scrolling, "scrollHeight", {
    configurable: true,
    get: () => box.scrollHeight,
  });
  Object.defineProperty(scrolling, "clientHeight", {
    configurable: true,
    get: () => box.clientHeight,
  });
  Object.defineProperty(scrolling, "scrollTop", {
    configurable: true,
    get: () => box.scrollTop,
    set: (value: number) => {
      box.scrollTop = value;
    },
  });
}

function scrollToEnd(box: ScrollBox): void {
  box.clientHeight = 200;
  box.scrollHeight = 241;
  box.scrollTop = END_SCROLL_TOP;
}

function scrollAway(box: ScrollBox): void {
  box.clientHeight = 200;
  box.scrollHeight = 800;
  box.scrollTop = END_SCROLL_TOP;
}

function boardLines(world: World): string {
  const lines = world.container?.querySelectorAll(".departure-card__line");
  if (!lines) {
    return "";
  }
  return [...lines].map((cell) => cell.textContent ?? "").join(", ");
}

function pushWheel(world: World, deltaY: number): void {
  const documentRef = world.documentRef;
  if (!documentRef) {
    throw new Error("Expected the departure board document");
  }
  const view = documentRef.defaultView ?? window;
  documentRef.dispatchEvent(
    new view.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY,
    })
  );
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

defineFeature<World>(
  test,
  `
Feature: Held scroll at the end of the departure board

  Scenario: One downward wheel at the end does not load later departures
    Given a rail board hides Z at 41 minutes past the glance page
    And the document is scrolled to the end
    When the person pushes the scroll downward once
    Then later departures are not requested
    And the board lines are A, A, A, A
    When the person pushes the scroll downward once more
    Then later departures are requested once

  Scenario: The next downward wheel at the end appends the hidden departure
    Given a rail board hides Z at 41 minutes past the glance page
    And the document is scrolled to the end
    When the person pushes the scroll downward once
    And the person pushes the scroll downward once more
    Then the board lines are A, A, A, A, Z
    And the departure board stays visible
    And the status is not Loading nearby departures...
    And the scroll offset stays where it was
    And the shell class stays app-shell

  Scenario: Down then up then down does not request later departures
    Given a rail board hides Z at 41 minutes past the glance page
    And the document is scrolled to the end
    When the person pushes the scroll downward once
    And the person pushes the scroll upward once
    And the person pushes the scroll downward once
    Then later departures are not requested
    When the person pushes the scroll downward once more
    Then later departures are requested once

  Scenario: A downward wheel away from the end does not request later departures
    Given a rail board hides Z at 41 minutes past the glance page
    And the document is scrolled to the end
    When the person pushes the scroll downward once
    And the document is scrolled away from the end
    And the person pushes the scroll downward once
    Then later departures are not requested
    When the document is scrolled to the end
    And the person pushes the scroll downward once
    Then later departures are still not requested
    When the person pushes the scroll downward once more
    Then later departures are requested once

  Scenario: Applying the same suffix twice leaves one copy of the new row
    Given a rail board hides Z at 41 minutes past the glance page
    And the document is scrolled to the end
    When the person pushes the scroll downward twice and the later departures arrive
    And the person pushes the scroll downward twice again and the later departures arrive
    Then the board lines are A, A, A, A, Z

  Scenario: A mode change while later departures are in flight keeps the new mode
    Given a rail board hides Z at 41 minutes past the glance page
    And the document is scrolled to the end
    And a bus board is waiting
    When the person pushes the scroll downward twice and the later request stays open
    Then a later departure request is in flight
    When the person switches to bus and the bus departures arrive
    And the in-flight rail suffix arrives
    Then the board lines are 550
    And the board does not include Z
  `,
  {
    createWorld: () => ({
      box: { clientHeight: 0, scrollHeight: 0, scrollTop: 0 },
      bus: createDeferred(),
      holdLater: false,
      later: createDeferred(),
      laterCalls: 0,
    }),
    stepDefinitions: [
      {
        pattern: /^Given a rail board hides Z at 41 minutes past the glance page$/,
        run: ({ world }) => {
          const store = createAppStore({
            coords: { lat: 60.17, lon: 24.94 },
          });
          store.applyDeparturesResponse(railResponse());
          const locationService: LocationService = {
            async getCurrentPosition() {
              return { code: "unavailable", ok: false };
            },
          };
          const departuresClient = {
            async getDepartures() {
              return world.bus.promise;
            },
            async getLaterDepartures() {
              world.laterCalls += 1;
              if (world.holdLater) {
                return world.later.promise;
              }
              return { departures: hiddenSuffix() };
            },
          };
          const controller = createAppController({
            departuresClient,
            locationService,
            store,
          });
          const documentRef = document.implementation.createHTMLDocument("board-hold");
          installScroll(documentRef, world.box);
          documentRef.body.innerHTML = "<div id='root'></div>";
          const root = documentRef.querySelector<HTMLElement>("#root");
          if (!root) {
            throw new Error("Expected app shell root");
          }
          renderAppShell({
            controller,
            documentRef,
            root,
          });
          world.container = root;
          world.controller = controller;
          world.documentRef = documentRef;
        },
      },
      {
        pattern: /^(Given|When) the document is scrolled to the end$/,
        run: ({ world }) => {
          scrollToEnd(world.box);
        },
      },
      {
        pattern: /^When the document is scrolled away from the end$/,
        run: ({ world }) => {
          scrollAway(world.box);
        },
      },
      {
        pattern: /^Given a bus board is waiting$/,
        run: ({ world }) => {
          world.holdLater = true;
        },
      },
      {
        pattern: /^When the person pushes the scroll downward once$/,
        run: async ({ world }) => {
          pushWheel(world, 120);
          await flush();
        },
      },
      {
        pattern: /^When the person pushes the scroll downward once more$/,
        run: async ({ world }) => {
          pushWheel(world, 120);
          await flush();
        },
      },
      {
        pattern: /^When the person pushes the scroll upward once$/,
        run: async ({ world }) => {
          pushWheel(world, -120);
          await flush();
        },
      },
      {
        pattern: /^When the person pushes the scroll downward twice and the later departures arrive$/,
        run: async ({ world }) => {
          pushWheel(world, 120);
          await flush();
          pushWheel(world, 120);
          await flush();
        },
      },
      {
        pattern: /^When the person pushes the scroll downward twice again and the later departures arrive$/,
        run: async ({ world }) => {
          pushWheel(world, 120);
          await flush();
          pushWheel(world, 120);
          await flush();
        },
      },
      {
        pattern: /^When the person pushes the scroll downward twice and the later request stays open$/,
        run: async ({ world }) => {
          pushWheel(world, 120);
          await flush();
          pushWheel(world, 120);
          await flush();
        },
      },
      {
        pattern: /^When the person switches to bus and the bus departures arrive$/,
        run: async ({ world }) => {
          const button = world.container?.querySelector<HTMLButtonElement>('[data-mode="BUS"]');
          if (!button) {
            throw new Error("Expected the bus mode button");
          }
          button.click();
          world.bus.resolve(busResponse());
          await world.bus.promise;
          await flush();
        },
      },
      {
        pattern: /^When the in-flight rail suffix arrives$/,
        run: async ({ world }) => {
          world.later.resolve({ departures: hiddenSuffix() });
          await world.later.promise;
          await flush();
        },
      },
      {
        pattern: /^Then later departures are not requested$/,
        run: ({ assert, world }) => {
          assert.equal(world.laterCalls, 0, "one arrival at the end requested later departures");
        },
      },
      {
        pattern: /^Then later departures are still not requested$/,
        run: ({ assert, world }) => {
          assert.equal(world.laterCalls, 0, "a push that is not a held end requested later departures");
        },
      },
      {
        pattern: /^Then later departures are requested once$/,
        run: ({ assert, world }) => {
          assert.equal(world.laterCalls, 1, "the held scroll did not request later departures");
        },
      },
      {
        pattern: /^Then a later departure request is in flight$/,
        run: ({ assert, world }) => {
          assert.equal(world.laterCalls, 1, "the held scroll did not start a later departure request");
        },
      },
      {
        pattern: /^Then the board lines are (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(boardLines(world), args[0], "the departure board did not show the expected rows");
        },
      },
      {
        pattern: /^Then the departure board stays visible$/,
        run: ({ assert, world }) => {
          const table = world.container?.querySelector<HTMLTableElement>(".app-shell__departures-table");
          assert.equal(table?.hidden, false, "the departure board was hidden");
        },
      },
      {
        pattern: /^Then the status is not Loading nearby departures\.\.\.$/,
        run: ({ assert, world }) => {
          const status = world.container?.querySelector<HTMLElement>("[data-status]");
          assert.equal(status?.textContent, "", "the status changed while later departures appended");
          assert.equal(status?.textContent === LOADING_STATUS, false);
        },
      },
      {
        pattern: /^Then the scroll offset stays where it was$/,
        run: ({ assert, world }) => {
          assert.equal(world.box.scrollTop, END_SCROLL_TOP, "the scroll offset moved when rows appended");
        },
      },
      {
        pattern: /^Then the shell class stays app-shell$/,
        run: ({ assert, world }) => {
          assert.equal(world.container?.className, "app-shell", "the shell class changed");
        },
      },
      {
        pattern: /^Then the board does not include Z$/,
        run: ({ assert, world }) => {
          assert.equal(boardLines(world).includes("Z"), false, "the old rail suffix was appended");
        },
      },
    ],
  }
);
