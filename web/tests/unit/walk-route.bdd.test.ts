import { afterEach, test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore, type AppStore } from "@client/app/app-store";
import { renderAppShell } from "@client/app/app-shell";
import { createAppController } from "@client/app/app-controller";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";
import { createApp } from "@server/app";
import { createDigitransitService } from "@server/services/digitransit/client";
import type { Stop } from "@shared/domain/stop";
import type { WalkRoute } from "@shared/domain/walk-route";

const API_KEY = "server-only-digitransit-key";
const STOP_ID = "HSL:1020601";
const PERSON = { lat: 60.1706, lon: 24.9414 };
const PLATFORM = { lat: 60.1692, lon: 24.9337 };
const GROUPED_CENTROID = { lat: 60.18, lon: 25.01 };
const SHOWN_ROUTE: WalkRoute["points"] = [PERSON, { lat: 60.1701, lon: 24.9381 }, PLATFORM];
const ENCODED_WALK = "c~fnJcvewCz@zJ";
const ENCODED_BUS = "_vjvJ_nszC";
const ROUTE_SPAN = "60.170600 24.941400 60.170100 24.938100 60.169200 24.933700";
const originalFetch = globalThis.fetch;
const originalScroll = HTMLElement.prototype.scrollIntoView;

interface GeoPoint {
  lat: number;
  lon: number;
}

interface WalkFetch {
  request: { lat: number; lon: number; stopId: string };
  resolve(route: WalkRoute | null): void;
}

interface HungWalk {
  resolve(response: Response): void;
  signal: AbortSignal | null;
  url: string;
}

type FetchMode = "hang" | "inject" | "json" | "string";
type PlannerMode = "empty" | "nostop" | "walk";

interface World {
  cleanup?: () => void;
  coords: GeoPoint | null;
  documentRef?: Document;
  fetchMode: FetchMode;
  fetches: WalkFetch[];
  fireHold: (() => void) | null;
  holdDelay: number | null;
  hung: HungWalk[];
  nearbyStops?: Stop[];
  planBodies: string[];
  planner: PlannerMode;
  root?: HTMLElement;
  scrolls: number;
  serverApp?: ReturnType<typeof createApp>;
  serverBody: string;
  serverStatus: number;
  store?: AppStore;
  leavesInMinutes: number | null;
  tripId: string;
  walkSeconds: number;
  upstreamKeys: string[];
  vehicleOpens: number;
  calloutCancelled: boolean;
  selectedText: string;
  selectionCancelled: boolean;
  walkHeaders: Array<string | null>;
  walkUrls: string[];
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  HTMLElement.prototype.scrollIntoView = originalScroll;
});

function createWorld(): World {
  return {
    coords: null,
    fetchMode: "inject",
    fetches: [],
    fireHold: null,
    holdDelay: null,
    hung: [],
    leavesInMinutes: null,
    planBodies: [],
    planner: "walk",
    scrolls: 0,
    serverBody: "",
    serverStatus: 0,
    tripId: "HSL:TRIP1",
    walkSeconds: 8 * 60,
    upstreamKeys: [],
    vehicleOpens: 0,
    calloutCancelled: false,
    selectedText: "",
    selectionCancelled: false,
    walkHeaders: [],
    walkUrls: [],
  };
}

function coord(value: number): string {
  return value.toFixed(6);
}

function installScrollSpy(world: World): void {
  HTMLElement.prototype.scrollIntoView = function spy(this: HTMLElement) {
    if (this.dataset.walkMap === "true") {
      world.scrolls += 1;
    }
  };
}

function dispatchPointer(target: EventTarget, type: string, x: number, y: number): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      clientX: x,
      clientY: y,
      pointerId: 1,
    }),
  );
}

function departureRow(world: World): HTMLTableRowElement {
  const row = world.root?.querySelector("tbody tr");
  if (!(row instanceof HTMLTableRowElement)) {
    throw new Error("Expected a departure card");
  }
  return row;
}

function holdCard(world: World): void {
  const row = departureRow(world);
  dispatchPointer(row, "pointerdown", 8, 8);
  world.fireHold?.();
  if (world.documentRef) {
    dispatchPointer(world.documentRef, "pointerup", 8, 8);
  }
}

function clickCard(world: World): void {
  departureRow(world).dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function cardText(world: World): HTMLElement {
  const text = departureRow(world).querySelector(".departure-card__destination-text");
  if (!(text instanceof HTMLElement)) {
    throw new Error("Expected the departure text");
  }
  return text;
}

interface HeldSelection {
  readonly anchorNode: Node | null;
  addRange(range: Range): void;
  removeAllRanges(): void;
  toString(): string;
}

function installSelection(documentRef: Document, node: Node): HeldSelection {
  let ranges: Range[] = [];
  let anchor: Node | null = node;
  const selection: HeldSelection = {
    get anchorNode() {
      return anchor;
    },
    addRange(range: Range) {
      ranges = [range];
      anchor = range.startContainer;
    },
    removeAllRanges() {
      ranges = [];
      anchor = null;
    },
    toString() {
      return ranges.map((range) => range.toString()).join("");
    },
  };
  Object.defineProperty(documentRef, "getSelection", {
    configurable: true,
    value: () => selection,
  });
  return selection;
}

function selectCardText(world: World): void {
  const documentRef = world.documentRef;
  const text = cardText(world);
  const node = text.firstChild;
  if (!documentRef || !node) {
    throw new Error("Expected the departure text");
  }
  const selection = installSelection(documentRef, node);
  const range = documentRef.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
  documentRef.dispatchEvent(new Event("selectionchange"));
}

function stubNetwork(world: World): void {
  globalThis.fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    const url = String(input);
    world.walkUrls.push(url);
    world.walkHeaders.push(headers.get("digitransit-subscription-key"));
    if (world.fetchMode === "string") {
      return Promise.resolve(new Response(JSON.stringify({ points: ENCODED_WALK }), { status: 200 }));
    }
    if (world.fetchMode === "json") {
      return Promise.resolve(
        new Response(JSON.stringify({ points: SHOWN_ROUTE, seconds: world.walkSeconds }), { status: 200 }),
      );
    }
    return new Promise((resolve) => {
      world.hung.push({
        resolve,
        signal: init?.signal ?? null,
        url,
      });
    });
  };
}

function renderBoard(world: World): void {
  const store = createAppStore();
  if (world.coords) {
    store.setCoordinates(world.coords);
  }
  store.applyDeparturesResponse({
    filterOptions: {
      destinations: [{ count: 1, value: "Kamppi" }],
      lines: [{ count: 1, value: "550" }],
    },
    mode: "BUS",
    selectedStopId: STOP_ID,
    station: {
      departures: [
        {
          departureIso:
            world.leavesInMinutes == null
              ? "2026-03-07T10:10:00.000Z"
              : new Date(Date.now() + world.leavesInMinutes * 60_000).toISOString(),
          destination: "Kamppi",
          line: "550",
          stopId: STOP_ID,
          tripId: world.tripId,
        },
      ],
      distanceMeters: 80,
      stopCode: "A1",
      stopCodes: ["A1"],
      stopName: "Kamppi",
      type: "stop",
    },
    stops: world.nearbyStops ?? [
      {
        code: "A1",
        distanceMeters: 80,
        id: STOP_ID,
        memberStopIds: [],
        name: "Kamppi",
        stopCodes: ["A1"],
      },
    ],
  });
  const documentRef = document.implementation.createHTMLDocument("walk");
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
    async getLaterDepartures() {
      throw new Error("later departures are not part of this scenario");
    },
    async getDepartures() {
      throw new Error("Departures client should not be called");
    },
  };
  const controller = createAppController({
    departuresClient,
    locationService,
    store,
  });
  installScrollSpy(world);
  if (world.fetchMode !== "inject") {
    stubNetwork(world);
  }
  world.cleanup = renderAppShell({
    controller,
    documentRef,
    fetchWalk:
      world.fetchMode === "inject"
        ? (request) =>
            new Promise((resolve) => {
              world.fetches.push({ request, resolve });
            })
        : undefined,
    openVehicleSpan() {
      world.vehicleOpens += 1;
      return () => undefined;
    },
    root,
    scheduleHold(delayMs, fire) {
      world.holdDelay = delayMs;
      world.fireHold = fire;
      return () => {
        if (world.fireHold === fire) {
          world.fireHold = null;
        }
      };
    },
  });
  world.documentRef = documentRef;
  world.root = root;
  world.store = store;
}

async function flush(): Promise<void> {
  for (let step = 0; step < 8; step += 1) {
    await Promise.resolve();
  }
}

function resolveShown(world: World): void {
  const pending = world.fetches.shift();
  pending?.resolve({ points: SHOWN_ROUTE, seconds: world.walkSeconds });
}

function walkMap(world: World): HTMLElement | null {
  return world.root?.querySelector<HTMLElement>('[data-walk-map="true"]') ?? null;
}

function assertShownRoute(assert: { equal(actual: unknown, expected: unknown, message?: string): void }, world: World): void {
  const map = walkMap(world);
  const table = world.root?.querySelector<HTMLElement>(".app-shell__departures-table");
  const row = world.root?.querySelector<HTMLElement>("tbody tr");
  const color = row?.style.getPropertyValue("--destination-color") ?? "";
  const probe = world.documentRef?.createElement("span");
  if (probe) {
    probe.style.color = color;
  }
  const glass = map?.querySelector<HTMLElement>(".vehicle-span__glass");
  const origin = map?.querySelector<HTMLElement>("[data-walk-origin]");
  const stop = map?.querySelector<HTMLElement>("[data-stop-marker]");
  assert.equal(map instanceof HTMLElement, true);
  assert.equal(map?.getAttribute("data-vehicle-map"), null);
  assert.equal(map?.getAttribute("aria-label"), "550 walk to Kamppi");
  assert.equal(map?.querySelector(".vehicle-span__line")?.textContent, "550");
  assert.equal(map?.querySelector(".vehicle-span__destination")?.textContent, "Kamppi");
  assert.equal(map?.querySelector(".vehicle-span__head") instanceof HTMLElement, true);
  assert.equal(map?.querySelector("[data-walk-close]") instanceof HTMLButtonElement, true);
  assert.equal(table?.hidden, false);
  assert.equal(map?.nextElementSibling, table);
  assert.equal(map?.querySelector("[data-route-span]")?.getAttribute("data-route-span"), ROUTE_SPAN);
  assert.equal(origin?.dataset.lat, coord(PERSON.lat));
  assert.equal(origin?.dataset.lon, coord(PERSON.lon));
  assert.equal(stop?.dataset.lat, coord(PLATFORM.lat));
  assert.equal(stop?.dataset.lon, coord(PLATFORM.lon));
  assert.equal(glass?.dataset.north, coord(PERSON.lat));
  assert.equal(glass?.dataset.south, coord(PLATFORM.lat));
  assert.equal(glass?.dataset.east, coord(PERSON.lon));
  assert.equal(glass?.dataset.west, coord(PLATFORM.lon));
  assert.equal(map?.querySelector("[data-street-tile]") instanceof HTMLElement, true);
  assert.equal(color.length > 0, true);
  assert.equal(map?.querySelector<SVGElement>("[data-route-span]")?.style.stroke, probe?.style.color);
  assert.equal(world.scrolls, 1);
  assert.equal(world.root?.querySelector("[data-vehicle-map]"), null);
}

function installPlanner(world: World): void {
  const service = createDigitransitService({
    fetchImpl: async (_url, init) => {
      const headers = new Headers(init?.headers);
      world.upstreamKeys.push(headers.get("digitransit-subscription-key") || "");
      const body = JSON.parse(String(init?.body)) as { query?: string; variables?: { id?: string } };
      const query = body.query ?? "";
      if (!query.includes("plan(")) {
        if (world.planner === "nostop") {
          return new Response(JSON.stringify({ data: { stop: null } }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: { stop: PLATFORM } }), { status: 200 });
      }
      const text = JSON.stringify(body);
      world.planBodies.push(text);
      const toPlatform = text.includes(String(PLATFORM.lat)) && text.includes(String(PLATFORM.lon));
      if (world.planner === "empty" || !toPlatform) {
        return new Response(JSON.stringify({ data: { plan: { itineraries: [] } } }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          data: {
            plan: {
              itineraries: [
                {
                  duration: 8 * 60,
                  legs: [
                    { legGeometry: { points: ENCODED_BUS }, mode: "BUS" },
                    { legGeometry: { points: ENCODED_WALK }, mode: "WALK" },
                  ],
                },
              ],
            },
          },
        }),
        { status: 200 },
      );
    },
    getApiKey: () => API_KEY,
  });
  world.serverApp = createApp({ digitransitService: service });
}

async function requestWalk(world: World, path: string): Promise<void> {
  if (!world.serverApp) {
    throw new Error("Expected the walk server");
  }
  const response = await world.serverApp.request(`http://localhost${path}`);
  world.serverStatus = response.status;
  world.serverBody = await response.text();
}

defineFeature<World>(
  test,
  `
Feature: Walking route from a held departure

  Scenario: Holding a departure card with coordinates keeps the departure table in place until the route arrives, then shows the walk map and the route points, and the following click does not open the vehicle map.
    Given a departure card for line 550 to Kamppi at stop HSL:1020601
    And the person is at latitude 60.1706 and longitude 24.9414
    When the card is held
    Then the departure table stays until the route arrives
    When the route arrives
    Then the walk map shows the route points
    When the following click lands
    Then the vehicle map stays closed

  Scenario: A press shorter than the hold opens the vehicle map and does not request a walk.
    Given a departure card for line 550 to Kamppi at stop HSL:1020601
    And the person is at latitude 60.1706 and longitude 24.9414
    When the card is pressed briefly
    Then the vehicle map is open
    And no walk was requested

  Scenario: Changing mode removes the walk map.
    Given a departure card for line 550 to Kamppi at stop HSL:1020601
    And the person is at latitude 60.1706 and longitude 24.9414
    When the card is held
    And the route arrives
    Then the walk map shows the route points
    When the user changes mode to RAIL
    Then the walk map is gone

  Scenario: Changing the active stop removes the walk map.
    Given another nearby stop HSL:STOP2 named Sörnäinen
    And a departure card for line 550 to Kamppi at stop HSL:1020601
    And the person is at latitude 60.1706 and longitude 24.9414
    When the card is held
    And the route arrives
    Then the walk map shows the route points
    When the user chooses stop HSL:STOP2
    Then the walk map is gone

  Scenario: A response for a closed or replaced hold does not show that route.
    Given the walk response waits
    And a departure card for line 550 to Kamppi at stop HSL:1020601
    And the person is at latitude 60.1706 and longitude 24.9414
    When the card is held
    And the card is held again before the first route arrives
    Then the replaced route stays off the board
    When the shell closes before the second route arrives
    Then the closed route stays off the board

  Scenario: Missing coordinates leave the board as it is and do not open the vehicle map from the trailing click.
    Given a departure card for line 550 to Kamppi at stop HSL:1020601
    When the card is pressed briefly
    Then the vehicle map is open
    When the held click follows with no coordinates
    Then the open vehicle map stays up
    And no walk was requested

  Scenario: The walk request URL has lat, lon, and stopId, and it has no Digitransit key.
    Given the browser will call the walk API
    And a departure card for line 550 to Kamppi at stop HSL:1020601
    And the person is at latitude 60.1706 and longitude 24.9414
    When the card is held
    Then the walk request has lat, lon, and stopId and no Digitransit key
    And the walk map shows the route points

  Scenario: A string of points does not become a walking route.
    Given the browser will receive walk points as text
    And a departure card for line 550 to Kamppi at stop HSL:1020601
    And the person is at latitude 60.1706 and longitude 24.9414
    When the card is held
    Then the board says no walking route

  Scenario: The server returns the platform point from getStopPoint, not a grouped-stop centroid, and the JSON has no encoded polyline.
    Given the platform for stop HSL:1020601 is at latitude 60.1692 and longitude 24.9337
    When the server plans a walk from latitude 60.1706 and longitude 24.9414
    Then the walk JSON ends at the platform and has no encoded polyline
    And the walking time is 8 minutes
    When the server plans a walk from the same platform point
    Then the walk JSON is the platform twice
    And the walking time is 0 minutes
    When the planner has no walk between two different points
    Then the walk response says no walking route
    When the server is asked for a walk without a stop
    Then the walk response says the request is bad
    When the platform cannot be found
    Then the walk response says no walking route

  Scenario: A walk map shows the OpenStreetMap credit. The footer still shows only the Digitransit data credit.
    Given a departure card for line 550 to Kamppi at stop HSL:1020601
    And the person is at latitude 60.1706 and longitude 24.9414
    When the card is held
    And the route arrives
    Then the walk map shows the OpenStreetMap credit
    And the footer shows only the Digitransit data credit

  Scenario: Moving past 12 pixels cancels the walk.
    Given a departure card for line 550 to Kamppi at stop HSL:1020601
    And the person is at latitude 60.1706 and longitude 24.9414
    When the pointer moves 13 pixels before the hold completes
    Then the vehicle map is open
    And no walk was requested

  Scenario: A departure card with a stop and no trip shows the walk.
    Given a departure card for line 550 to Kamppi at stop HSL:1020601 with no trip
    And the person is at latitude 60.1706 and longitude 24.9414
    When the card is held
    And the route arrives
    Then the walk map shows the route points
    And the vehicle map stays closed

  Scenario: An unavailable walk leaves the departure table and says there is no route.
    Given a departure card for line 550 to Kamppi at stop HSL:1020601
    And the person is at latitude 60.1706 and longitude 24.9414
    When the walk is unavailable
    Then the board says no walking route
    And the departure table stays in place

  Scenario: A pale walking line keeps a dark edge and the walking time sits in a frame.
    Given a departure card for line 550 to Kamppi at stop HSL:1020601 leaving in 20 minutes
    And the person is at latitude 60.1706 and longitude 24.9414
    And the walk takes 8 minutes
    When the card is held
    And the route arrives
    Then the walking line keeps its color inside a dark edge
    And the walking time sits in a dark frame

  Scenario: A walk you can finish before the departure shows its time in green with a check on the middle of the line.
    Given a departure card for line 550 to Kamppi at stop HSL:1020601 leaving in 20 minutes
    And the person is at latitude 60.1706 and longitude 24.9414
    And the walk takes 8 minutes
    When the card is held
    And the route arrives
    Then the walking time is 8 min in green with a check on the middle of the line

  Scenario: A walk that outlasts the departure shows its time in amber with a cross on the middle of the line.
    Given a departure card for line 550 to Kamppi at stop HSL:1020601 leaving in 5 minutes
    And the person is at latitude 60.1706 and longitude 24.9414
    And the walk takes 12 minutes
    When the card is held
    And the route arrives
    Then the walking time is 12 min in amber with a cross on the middle of the line

  Scenario: Holding a departure card does not select its text.
    Given a departure card for line 550 to Kamppi at stop HSL:1020601
    And the person is at latitude 60.1706 and longitude 24.9414
    When the card is held and the browser tries to select its text
    Then the card text stays unselected
  `,
  {
    createWorld,
    stepDefinitions: [
      {
        pattern: /^Given another nearby stop HSL:STOP2 named Sörnäinen$/,
        run({ world }) {
          world.nearbyStops = [
            {
              code: "A1",
              distanceMeters: 80,
              id: STOP_ID,
              memberStopIds: [],
              name: "Kamppi",
              stopCodes: ["A1"],
            },
            {
              code: "B2",
              distanceMeters: 240,
              id: "HSL:STOP2",
              memberStopIds: [],
              name: "Sörnäinen",
              stopCodes: ["B2"],
            },
          ];
        },
      },
      {
        pattern: /^Given a departure card for line 550 to Kamppi at stop HSL:1020601$/,
        run({ world }) {
          renderBoard(world);
        },
      },
      {
        pattern: /^Given a departure card for line 550 to Kamppi at stop HSL:1020601 leaving in (\d+) minutes$/,
        run({ args, world }) {
          world.leavesInMinutes = Number(args[0]);
          renderBoard(world);
        },
      },
      {
        pattern: /^(?:Given|When|Then) the walk takes (\d+) minutes$/,
        run({ args, world }) {
          world.walkSeconds = Number(args[0]) * 60;
        },
      },
      {
        pattern: /^Given a departure card for line 550 to Kamppi at stop HSL:1020601 with no trip$/,
        run({ world }) {
          world.tripId = "";
          renderBoard(world);
        },
      },
      {
        pattern: /^Given the person is at latitude (-?\d+\.\d+) and longitude (-?\d+\.\d+)$/,
        run({ args, world }) {
          const coords = { lat: Number(args[0]), lon: Number(args[1]) };
          world.coords = coords;
          world.store?.setCoordinates(coords);
        },
      },
      {
        pattern: /^Given the walk response waits$/,
        run({ world }) {
          world.fetchMode = "hang";
        },
      },
      {
        pattern: /^Given the browser will call the walk API$/,
        run({ world }) {
          world.fetchMode = "json";
        },
      },
      {
        pattern: /^Given the browser will receive walk points as text$/,
        run({ world }) {
          world.fetchMode = "string";
        },
      },
      {
        pattern: /^Given the platform for stop HSL:1020601 is at latitude 60\.1692 and longitude 24\.9337$/,
        run({ world }) {
          installPlanner(world);
        },
      },
      {
        pattern: /^When the card is held$/,
        run({ world }) {
          holdCard(world);
        },
      },
      {
        pattern: /^When the card is held and the browser tries to select its text$/,
        run({ world }) {
          const text = cardText(world);
          dispatchPointer(text, "pointerdown", 8, 8);
          const selection = new Event("selectstart", { bubbles: true, cancelable: true });
          const callout = new Event("contextmenu", { bubbles: true, cancelable: true });
          text.dispatchEvent(selection);
          text.dispatchEvent(callout);
          world.selectionCancelled = selection.defaultPrevented;
          world.calloutCancelled = callout.defaultPrevented;
          selectCardText(world);
          world.fireHold?.();
          if (world.documentRef) {
            dispatchPointer(world.documentRef, "pointerup", 8, 8);
          }
          world.selectedText = world.documentRef?.getSelection()?.toString() ?? "";
        },
      },
      {
        pattern: /^When the card is held again before the first route arrives$/,
        run({ world }) {
          holdCard(world);
        },
      },
      {
        pattern: /^When the route arrives$/,
        run: async ({ world }) => {
          resolveShown(world);
          await flush();
        },
      },
      {
        pattern: /^When the following click lands$/,
        run({ world }) {
          clickCard(world);
        },
      },
      {
        pattern: /^When the card is pressed briefly$/,
        run({ world }) {
          const row = departureRow(world);
          dispatchPointer(row, "pointerdown", 3, 3);
          if (world.documentRef) {
            dispatchPointer(world.documentRef, "pointerup", 3, 3);
          }
          clickCard(world);
        },
      },
      {
        pattern: /^When the held click follows with no coordinates$/,
        run({ world }) {
          holdCard(world);
          clickCard(world);
        },
      },
      {
        pattern: /^When the user changes mode to RAIL$/,
        run({ world }) {
          const button = world.root?.querySelector<HTMLButtonElement>('[data-mode="RAIL"]');
          if (!button) {
            throw new Error("Expected RAIL mode button");
          }
          button.click();
        },
      },
      {
        pattern: /^When the user chooses stop HSL:STOP2$/,
        run({ world }) {
          const option = world.root?.querySelector<HTMLButtonElement>("[data-stop-option='HSL:STOP2']");
          if (!option) {
            throw new Error("Expected stop HSL:STOP2");
          }
          option.click();
        },
      },
      {
        pattern: /^When the shell closes before the second route arrives$/,
        run: async ({ world }) => {
          world.cleanup?.();
          const second = world.hung[1];
          second?.resolve(new Response(JSON.stringify({ points: [{ lat: 62.222, lon: 24.222 }, { lat: 62.223, lon: 24.223 }] }), { status: 200 }));
          await flush();
        },
      },
      {
        pattern: /^When the pointer moves 13 pixels before the hold completes$/,
        run({ world }) {
          const row = departureRow(world);
          dispatchPointer(row, "pointerdown", 10, 20);
          if (!world.documentRef) {
            throw new Error("Expected a document");
          }
          dispatchPointer(world.documentRef, "pointermove", 23, 20);
          world.fireHold?.();
          dispatchPointer(world.documentRef, "pointerup", 23, 20);
          clickCard(world);
        },
      },
      {
        pattern: /^When the walk is unavailable$/,
        run: async ({ world }) => {
          holdCard(world);
          world.fetches.shift()?.resolve(null);
          await flush();
        },
      },
      {
        pattern: /^When the server plans a walk from latitude 60\.1706 and longitude 24\.9414$/,
        run: async ({ world }) => {
          await requestWalk(world, `/api/v1/walk?lat=60.1706&lon=24.9414&stopId=${encodeURIComponent(STOP_ID)}`);
        },
      },
      {
        pattern: /^When the server plans a walk from the same platform point$/,
        run: async ({ world }) => {
          await requestWalk(world, `/api/v1/walk?lat=60.1692&lon=24.9337&stopId=${encodeURIComponent(STOP_ID)}`);
        },
      },
      {
        pattern: /^When the planner has no walk between two different points$/,
        run: async ({ world }) => {
          world.planner = "empty";
          await requestWalk(world, `/api/v1/walk?lat=60.2&lon=24.9&stopId=${encodeURIComponent(STOP_ID)}`);
        },
      },
      {
        pattern: /^When the server is asked for a walk without a stop$/,
        run: async ({ world }) => {
          await requestWalk(world, "/api/v1/walk?lat=60.1706&lon=24.9414");
        },
      },
      {
        pattern: /^When the platform cannot be found$/,
        run: async ({ world }) => {
          world.planner = "nostop";
          await requestWalk(world, `/api/v1/walk?lat=60.1706&lon=24.9414&stopId=${encodeURIComponent(STOP_ID)}`);
        },
      },
      {
        pattern: /^Then the card text stays unselected$/,
        run({ assert, world }) {
          assert.equal(world.selectionCancelled, true);
          assert.equal(world.calloutCancelled, true);
          assert.equal(world.selectedText, "");
          assert.equal(walkMap(world), null);
        },
      },
      {
        pattern: /^Then the departure table stays until the route arrives$/,
        run({ assert, world }) {
          const table = world.root?.querySelector<HTMLElement>(".app-shell__departures-table");
          const request = world.fetches[0]?.request;
          assert.equal(world.holdDelay, 500);
          assert.equal(table?.hidden, false);
          assert.equal(walkMap(world), null);
          assert.equal(world.root?.querySelector("[data-vehicle-map]"), null);
          assert.equal(world.scrolls, 0);
          assert.equal(world.fetches.length, 1);
          assert.equal(request?.lat, PERSON.lat);
          assert.equal(request?.lon, PERSON.lon);
          assert.equal(request?.stopId, STOP_ID);
        },
      },
      {
        pattern: /^Then the walking line keeps its color inside a dark edge$/,
        run({ assert, world }) {
          const map = walkMap(world);
          const span = map?.querySelector<SVGPolylineElement>("[data-route-span]");
          const edge = map?.querySelector<SVGPolylineElement>("[data-route-casing]");
          const card = world.root?.querySelector<HTMLElement>(".departure-card");
          const color = card?.style.getPropertyValue("--destination-color") ?? "";
          const ink = world.documentRef?.createElement("span");
          const edgeProbe = world.documentRef?.createElement("span");
          if (ink) {
            ink.style.color = color;
          }
          if (edgeProbe) {
            edgeProbe.style.color = "#161616";
          }
          assert.equal(span?.style.stroke, ink?.style.color);
          assert.equal(edge?.style.stroke, edgeProbe?.style.color);
          assert.equal(edge?.getAttribute("points"), span?.getAttribute("points") ?? null);
          assert.equal(edge?.nextElementSibling, span ?? null);
          assert.equal(edge?.getAttribute("vector-effect"), "non-scaling-stroke");
          assert.equal(span?.getAttribute("vector-effect"), "non-scaling-stroke");
          assert.equal(edge?.getAttribute("stroke-width"), "6");
          assert.equal(span?.getAttribute("stroke-width"), "4");
          assert.equal(edge?.style.strokeWidth, "");
        },
      },
      {
        pattern: /^Then the walking time sits in a dark frame$/,
        run({ assert, world }) {
          const label = walkMap(world)?.querySelector<HTMLElement>("[data-walk-time]");
          const fill = world.documentRef?.createElement("span");
          const edge = world.documentRef?.createElement("span");
          if (fill) {
            fill.style.background = "#f7f1e4";
          }
          if (edge) {
            edge.style.color = "#161616";
          }
          assert.equal(label?.textContent, "✓ 8 min");
          assert.equal(label?.style.backgroundColor, fill?.style.backgroundColor);
          assert.equal(label?.style.borderTopColor, edge?.style.color);
        },
      },
      {
        pattern: /^Then the walking time is (\d+) min in (green|amber) with a (check|cross) on the middle of the line$/,
        run({ args, assert, world }) {
          const label = walkMap(world)?.querySelector<HTMLElement>("[data-walk-time]");
          const probe = world.documentRef?.createElement("span");
          const onTime = args[1] === "green";
          const color = onTime ? "#1b7f3a" : "#9a4e00";
          const mark = args[2] === "check" ? "✓" : "✕";
          if (probe) {
            probe.style.color = color;
          }
          assert.equal(label?.textContent, `${mark} ${args[0]} min`);
          assert.equal(label?.getAttribute("aria-label"), `${args[0]} min, ${onTime ? "on time" : "too late"}`);
          assert.equal(label?.dataset.onTime, onTime ? "true" : "false");
          assert.equal(label?.style.color, probe?.style.color);
          assert.equal(label?.dataset.lat, "60.169976");
          assert.equal(label?.dataset.lon, "24.937495");
        },
      },
      {
        pattern: /^Then the walk map shows the route points$/,
        run({ assert, world }) {
          assertShownRoute(assert, world);
        },
      },
      {
        pattern: /^Then the vehicle map stays closed$/,
        run({ assert, world }) {
          assert.equal(world.root?.querySelector("[data-vehicle-map]"), null);
          assert.equal(world.vehicleOpens, 0);
        },
      },
      {
        pattern: /^Then the vehicle map is open$/,
        run({ assert, world }) {
          assert.equal(world.root?.querySelector("[data-vehicle-map='true']") instanceof HTMLElement, true);
          assert.equal(walkMap(world), null);
        },
      },
      {
        pattern: /^Then no walk was requested$/,
        run({ assert, world }) {
          assert.equal(world.fetches.length, 0);
          assert.equal(world.walkUrls.length, 0);
          assert.equal(world.root?.querySelector("[data-walk-status]"), null);
        },
      },
      {
        pattern: /^Then the walk map is gone$/,
        run({ assert, world }) {
          assert.equal(walkMap(world), null);
          assert.equal(world.root?.querySelector("[data-route-span]"), null);
        },
      },
      {
        pattern: /^Then the replaced route stays off the board$/,
        run: async ({ assert, world }) => {
          const first = world.hung[0];
          const second = world.hung[1];
          assert.equal(first?.signal?.aborted, true);
          assert.equal(second?.signal?.aborted, false);
          first?.resolve(
            new Response(JSON.stringify({ points: [{ lat: 61.111, lon: 24.111 }, { lat: 61.112, lon: 24.112 }] }), {
              status: 200,
            }),
          );
          await flush();
          assert.equal(walkMap(world), null);
          assert.equal(world.root?.querySelector("[data-walk-status]"), null);
          assert.equal(world.root?.innerHTML.includes("61.111"), false);
        },
      },
      {
        pattern: /^Then the closed route stays off the board$/,
        run({ assert, world }) {
          assert.equal(world.hung[1]?.signal?.aborted, true);
          assert.equal(walkMap(world), null);
          assert.equal(world.root?.querySelector("[data-walk-status]"), null);
          assert.equal(world.root?.innerHTML.includes("62.222"), false);
        },
      },
      {
        pattern: /^Then the open vehicle map stays up$/,
        run({ assert, world }) {
          const table = world.root?.querySelector<HTMLElement>(".app-shell__departures-table");
          const status = world.root?.querySelector<HTMLElement>('[data-status="true"]');
          assert.equal(world.root?.querySelector("[data-vehicle-map='true']") instanceof HTMLElement, true);
          assert.equal(world.vehicleOpens, 1);
          assert.equal(walkMap(world), null);
          assert.equal(world.root?.querySelector("[data-walk-status]"), null);
          assert.equal(table?.hidden, false);
          assert.equal(status?.textContent, "");
        },
      },
      {
        pattern: /^Then the walk request has lat, lon, and stopId and no Digitransit key$/,
        run: async ({ assert, world }) => {
          await flush();
          const url = new URL(world.walkUrls[0] || "http://localhost/missing", "http://localhost");
          const names = [...url.searchParams.keys()].sort().join(",");
          assert.equal(url.pathname, "/api/v1/walk");
          assert.equal(names, "lat,lon,stopId");
          assert.equal(url.searchParams.get("lat"), "60.1706");
          assert.equal(url.searchParams.get("lon"), "24.9414");
          assert.equal(url.searchParams.get("stopId"), STOP_ID);
          assert.equal(url.search.includes(API_KEY), false);
          assert.equal(url.search.includes("digitransit-subscription-key"), false);
          assert.equal(world.walkHeaders[0], null);
        },
      },
      {
        pattern: /^Then the board says no walking route$/,
        run: async ({ assert, world }) => {
          await flush();
          const note = world.root?.querySelector<HTMLElement>('[data-walk-status="true"]');
          const table = world.root?.querySelector<HTMLElement>(".app-shell__departures-table");
          const status = world.root?.querySelector<HTMLElement>('[data-status="true"]');
          const footer = world.root?.querySelector<HTMLElement>(".app-shell__footer");
          assert.equal(note?.textContent, "No walking route.");
          assert.equal(note?.getAttribute("role"), "status");
          assert.equal(note?.nextElementSibling, table);
          assert.equal(walkMap(world), null);
          assert.equal(world.scrolls, 0);
          assert.equal(status?.textContent, "");
          assert.equal(footer?.textContent?.includes("OpenStreetMap"), false);
          assert.equal(world.root?.innerHTML.includes(ENCODED_WALK), false);
        },
      },
      {
        pattern: /^Then the departure table stays in place$/,
        run({ assert, world }) {
          const table = world.root?.querySelector<HTMLElement>(".app-shell__departures-table");
          assert.equal(table?.hidden, false);
          assert.equal(table?.querySelector("tbody tr") instanceof HTMLElement, true);
        },
      },
      {
        pattern: /^Then the walk JSON ends at the platform and has no encoded polyline$/,
        run({ assert, world }) {
          const body = JSON.parse(world.serverBody) as { points?: GeoPoint[] };
          const points = body.points ?? [];
          const last = points[points.length - 1];
          assert.equal(world.serverStatus, 200);
          assert.equal(points.length, 4);
          assert.equal(points[0]?.lat, PERSON.lat);
          assert.equal(points[0]?.lon, PERSON.lon);
          assert.equal(points[1]?.lat, 60.1701);
          assert.equal(points[1]?.lon, 24.9381);
          assert.equal(points[2]?.lat, 60.1698);
          assert.equal(points[2]?.lon, 24.9362);
          assert.equal(last?.lat, PLATFORM.lat);
          assert.equal(last?.lon, PLATFORM.lon);
          assert.equal(world.serverBody.includes(ENCODED_WALK), false);
          assert.equal(world.serverBody.includes(ENCODED_BUS), false);
          assert.equal(world.serverBody.includes("61.5"), false);
          assert.equal(world.serverBody.includes("25.5"), false);
          assert.equal(world.serverBody.includes(String(GROUPED_CENTROID.lat)), false);
          assert.equal(world.serverBody.includes(String(GROUPED_CENTROID.lon)), false);
          assert.equal(world.planBodies.some((plan) => plan.includes(String(PLATFORM.lat)) && plan.includes(String(PLATFORM.lon))), true);
          assert.equal(world.upstreamKeys.length > 0, true);
          assert.equal(world.upstreamKeys.every((key) => key === API_KEY), true);
          assert.equal(world.serverBody.includes(API_KEY), false);
        },
      },
      {
        pattern: /^Then the walking time is (\d+) minutes$/,
        run({ args, assert, world }) {
          const body = JSON.parse(world.serverBody) as { seconds?: number };
          assert.equal(body.seconds, Number(args[0]) * 60);
        },
      },
      {
        pattern: /^Then the walk JSON is the platform twice$/,
        run({ assert, world }) {
          const body = JSON.parse(world.serverBody) as { points?: GeoPoint[] };
          assert.equal(world.serverStatus, 200);
          assert.equal(body.points?.length, 2);
          assert.equal(body.points?.[0]?.lat, PLATFORM.lat);
          assert.equal(body.points?.[0]?.lon, PLATFORM.lon);
          assert.equal(body.points?.[1]?.lat, PLATFORM.lat);
          assert.equal(body.points?.[1]?.lon, PLATFORM.lon);
        },
      },
      {
        pattern: /^Then the walk response says no walking route$/,
        run({ assert, world }) {
          const body = JSON.parse(world.serverBody) as { error?: string };
          assert.equal(world.serverStatus, 404);
          assert.equal(body.error, "No walking route.");
          assert.equal(world.serverBody.includes(ENCODED_WALK), false);
        },
      },
      {
        pattern: /^Then the walk response says the request is bad$/,
        run({ assert, world }) {
          const body = JSON.parse(world.serverBody) as { error?: string };
          assert.equal(world.serverStatus, 400);
          assert.equal(body.error, "No walking route.");
        },
      },
      {
        pattern: /^Then the walk map shows the OpenStreetMap credit$/,
        run({ assert, world }) {
          const map = walkMap(world);
          const credit = map?.querySelector(".vehicle-span__credit")?.textContent ?? "";
          assert.equal(credit, "© OpenStreetMap contributors, HSL, ODbL");
          assert.match(credit, /OpenStreetMap/);
          assert.equal(map?.textContent?.includes("Digitransit"), false);
        },
      },
      {
        pattern: /^Then the footer shows only the Digitransit data credit$/,
        run({ assert, world }) {
          const footer = world.root?.querySelector(".app-shell__footer")?.textContent ?? "";
          assert.match(footer, /^Data © Digitransit \d{4}, received \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.$/);
          assert.equal(footer.includes("OpenStreetMap"), false);
        },
      },
    ],
  },
);
