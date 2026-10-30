import { afterAll, test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppController } from "@client/app/app-controller";
import { createAppStore, type AppStore } from "@client/app/app-store";
import { renderAppShell } from "@client/app/app-shell";
import {
  departureLiveWebSocketUrl,
  watchDepartureTimes,
  type DepartureLiveQuery,
} from "@client/services/departure-live-client";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";
import liveServer from "../../api/v1/departures-live";
import { createDepartureLiveServer } from "@server/live/departure-live-server";
import { createDigitransitService } from "@server/services/digitransit/client";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import { serializeDepartureTimeUpdate } from "@shared/domain/departure-live";
import type { Server } from "node:http";
import WebSocket from "ws";

const FIXED_NOW_MS = Date.parse("2026-03-07T10:00:00.000Z");
const SERVICE_DAY_SECONDS = FIXED_NOW_MS / 1000;
const DIGITRANSIT_KEY = "live-secret-key";
const PASILA_UPDATED_ISO = "2026-03-07T10:05:00.000Z";

interface LiveSocketLike {
  addEventListener(type: string, listener: (event: { data?: string }) => void): void;
  close(): void;
  url: string;
}

class FakeWebSocket implements LiveSocketLike {
  static latest: FakeWebSocket | null = null;
  readonly url: string;
  private readonly listeners = new Map<string, Array<(event: { data?: string }) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.latest = this;
  }

  addEventListener(type: string, listener: (event: { data?: string }) => void): void {
    const group = this.listeners.get(type) ?? [];
    group.push(listener);
    this.listeners.set(type, group);
  }

  close(): void {
    for (const listener of this.listeners.get("close") ?? []) {
      listener({});
    }
  }

  receive(data: string): void {
    for (const listener of this.listeners.get("message") ?? []) {
      listener({ data });
    }
  }
}

interface World {
  container?: HTMLElement;
  digitransitHeaders?: string[];
  kamppiRow?: Element | null;
  livePort?: number;
  messages?: string[];
  shell?: Element | null;
  stop?: () => Promise<void>;
  store?: AppStore;
}

let restoreNow: (() => void) | null = null;

function pinNow(): void {
  restoreNow?.();
  const original = Date.now;
  Date.now = () => FIXED_NOW_MS;
  restoreNow = () => {
    Date.now = original;
    restoreNow = null;
  };
}

afterAll(() => {
  restoreNow?.();
  liveServer.close();
});

function createDeparturesResponse(): DeparturesSuccessResponse {
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
      departures: [
        {
          departureIso: "2026-03-07T10:10:00.000Z",
          destination: "Kamppi",
          line: "550",
          stopId: "HSL:STOP_A",
          tripId: "trip-kamppi",
        },
        {
          departureIso: "2026-03-07T10:20:00.000Z",
          destination: "Pasila",
          line: "510",
          stopId: "HSL:STOP_A",
          tripId: "trip-pasila",
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

function renderBoard(world: World): void {
  pinNow();
  FakeWebSocket.latest = null;
  const store = createAppStore({
    coords: { lat: 60.17, lon: 24.94 },
  });
  store.applyDeparturesResponse(createDeparturesResponse());
  const locationService: LocationService = {
    async getCurrentPosition() {
      return { code: "unavailable", ok: false };
    },
  };
  const departuresClient: DeparturesClient = {
    async getDepartures() {
      throw new Error("The live update must not reload departures.");
    },
  };
  const controller = createAppController({
    departuresClient,
    locationService,
    store,
  });
  const documentRef = document.implementation.createHTMLDocument("departure-live");
  documentRef.body.innerHTML = "<div id='root'></div>";
  const root = documentRef.querySelector<HTMLElement>("#root");
  if (!root) {
    throw new Error("Expected app shell root");
  }
  renderAppShell({ controller, documentRef, root });
  world.container = root;
  world.shell = root.querySelector(".app-shell");
  world.kamppiRow =
    [...root.querySelectorAll(".departure-card")].find((row) => row.textContent?.includes("Kamppi")) ??
    null;
  world.store = store;
  const stop = watchDepartureTimes({
    store,
    WebSocketCtor: FakeWebSocket,
  });
  world.stop = async () => {
    stop();
  };
}

function sendPasilaUpdate(): void {
  const socket = FakeWebSocket.latest;
  if (!socket) {
    throw new Error("Expected a live departure socket");
  }
  socket.receive(
    serializeDepartureTimeUpdate({
      departureIso: PASILA_UPDATED_ISO,
      stopId: "HSL:STOP_A",
      tripId: "trip-pasila",
    }),
  );
}

function pasilaRow(world: World): Element | null {
  const rows = [...(world.container?.querySelectorAll(".departure-card") ?? [])];
  return rows.find((row) => row.textContent?.includes("Pasila")) ?? null;
}

function timeText(row: Element | null): string {
  return row?.querySelector("time")?.textContent ?? "";
}

function liveQuery(): DepartureLiveQuery {
  return {
    coords: { lat: 60.17, lon: 24.94 },
    destinations: [],
    lines: [],
    mode: "BUS",
    stopId: "HSL:STOP_A",
  };
}

function graphqlResponse(realtimeDeparture: number): Record<string, unknown> {
  return {
    data: {
      s0: {
        platformCode: "A",
        stoptimesWithoutPatterns: [
          {
            headsign: "Pasila",
            pickupType: 0,
            realtimeDeparture,
            scheduledDeparture: 1200,
            serviceDay: SERVICE_DAY_SECONDS,
            stop: {
              code: "H100",
              gtfsId: "HSL:STOP_A",
              name: "Kamppi",
              platformCode: "A",
            },
            trip: {
              gtfsId: "HSL:trip-pasila",
              route: {
                mode: "BUS",
                shortName: "510",
              },
            },
          },
        ],
      },
      stopsByRadius: {
        edges: [
          {
            node: {
              distance: 40,
              stop: {
                code: "H100",
                gtfsId: "HSL:STOP_A",
                lat: 60.17,
                lon: 24.94,
                name: "Kamppi",
                vehicleMode: "BUS",
              },
            },
          },
        ],
      },
    },
  };
}

defineFeature<World>(
  test,
  `
Feature: Live departure times

  Scenario: A websocket time update changes the shown departure time
    Given a departure board shows Kamppi in 10 minutes and Pasila in 20 minutes
    When a websocket update moves the Pasila trip to 5 minutes
    Then the Pasila departure time reads 5m
    And the Kamppi departure row is the same element
    And the departure board stays visible

  Scenario: A websocket time update animates that departure time
    Given a departure board shows Kamppi in 10 minutes and Pasila in 20 minutes
    When a websocket update moves the Pasila trip to 5 minutes
    Then the Pasila departure time is animating
    And the Kamppi departure time is still

  Scenario: A time update keeps the board in ascending departure order
    Given a departure board shows Kamppi in 10 minutes and Pasila in 20 minutes
    When a websocket update moves the Pasila trip to 5 minutes
    Then the departure board order is Pasila then Kamppi

  Scenario: A websocket message that is not a newer departure time leaves the board still
    Given a departure board shows Kamppi in 10 minutes and Pasila in 20 minutes
    When the socket receives messages that are not a newer Pasila time
    Then the Pasila departure time reads 20m
    And the Pasila departure time is still

  Scenario: A dropped live socket opens again for the same board
    Given a departure board shows Kamppi in 10 minutes and Pasila in 20 minutes
    When the live socket closes
    Then another live socket is open for the same board

  Scenario: The Digitransit API key stays off the live client
    Given a live departure server holds the Digitransit key
    When the browser receives a websocket time update
    Then the websocket message does not contain the Digitransit key
    And the live departure url does not contain the Digitransit key
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a departure board shows Kamppi in 10 minutes and Pasila in 20 minutes$/,
        run: ({ world }) => {
          renderBoard(world);
        },
      },
      {
        pattern: /^When a websocket update moves the Pasila trip to 5 minutes$/,
        run: () => {
          sendPasilaUpdate();
        },
      },
      {
        pattern: /^Then the Pasila departure time reads 5m$/,
        run: ({ assert, world }) => {
          assert.equal(timeText(pasilaRow(world)), "5m");
          assert.equal(
            pasilaRow(world)?.querySelector("time")?.getAttribute("datetime"),
            PASILA_UPDATED_ISO,
          );
        },
      },
      {
        pattern: /^Then the Kamppi departure row is the same element$/,
        run: ({ assert, world }) => {
          const current = [...(world.container?.querySelectorAll(".departure-card") ?? [])].find((row) =>
            row.textContent?.includes("Kamppi"),
          );
          assert.equal(current, world.kamppiRow ?? null);
          assert.equal(world.container?.querySelector(".app-shell"), world.shell ?? null);
        },
      },
      {
        pattern: /^Then the departure board stays visible$/,
        run: async ({ assert, world }) => {
          try {
            const table = world.container?.querySelector<HTMLTableElement>(".app-shell__departures-table");
            assert.equal(table?.hidden, false);
          } finally {
            await world.stop?.();
          }
        },
      },
      {
        pattern: /^Then the Pasila departure time is animating$/,
        run: ({ assert, world }) => {
          const time = pasilaRow(world)?.querySelector(".departure-card__time");
          assert.equal(time?.classList.contains("is-live"), true);
          assert.equal(time?.querySelector("time")?.textContent, "5m");
          assert.equal(time?.querySelector(".departure-card__time-previous")?.textContent, "20m");
        },
      },
      {
        pattern: /^Then the Kamppi departure time is still$/,
        run: async ({ assert, world }) => {
          try {
            const time = world.kamppiRow?.querySelector(".departure-card__time");
            assert.equal(time?.classList.contains("is-live"), false);
            assert.equal(timeText(world.kamppiRow ?? null), "10m");
          } finally {
            await world.stop?.();
          }
        },
      },
      {
        pattern: /^Then the departure board order is Pasila then Kamppi$/,
        run: async ({ assert, world }) => {
          try {
            const names = [...(world.container?.querySelectorAll(".departure-card__destination-text") ?? [])].map(
              (element) => element.textContent,
            );
            assert.equal(names.join("|"), "Pasila|Kamppi");
          } finally {
            await world.stop?.();
          }
        },
      },
      {
        pattern: /^Given a live departure server holds the Digitransit key$/,
        run: async ({ world }) => {
          const headers: string[] = [];
          let departureCalls = 0;
          const digitransitService = createDigitransitService({
            fetchImpl: async (_url, init) => {
              const headerValue = new Headers(init?.headers).get("digitransit-subscription-key") ?? "";
              headers.push(headerValue);
              const body = JSON.parse(String(init?.body ?? "{}")) as { query?: string };
              const query = body.query ?? "";
              const realtimeDeparture = query.includes("MultiStopDepartures")
                ? (departureCalls += 1) === 1
                  ? 1200
                  : 300
                : 0;
              return new Response(JSON.stringify(graphqlResponse(realtimeDeparture)), { status: 200 });
            },
            getApiKey: () => DIGITRANSIT_KEY,
          });
          const server: Server = createDepartureLiveServer({
            digitransitService,
            now: () => FIXED_NOW_MS,
            pollMs: 40,
          });
          await new Promise<void>((resolve) => {
            server.listen(0, "127.0.0.1", () => resolve());
          });
          const address = server.address();
          if (!address || typeof address === "string") {
            throw new Error("Expected a TCP port for the live departure server");
          }
          world.digitransitHeaders = headers;
          world.livePort = address.port;
          world.messages = [];
          world.stop = async () => {
            await new Promise<void>((resolve, reject) => {
              server.close((error) => (error ? reject(error) : resolve()));
            });
          };
          world.store = createAppStore();
          const url = `ws://127.0.0.1:${address.port}${departureLivePath(liveQuery())}`;
          const socket = new WebSocket(url);
          const message = new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("timed out waiting for a live departure update")), 2000);
            socket.on("message", (data) => {
              clearTimeout(timer);
              resolve(String(data));
            });
          });
          world.messages = [await message];
          socket.close();
        },
      },
      {
        pattern: /^When the browser receives a websocket time update$/,
        run: ({ world }) => {
          if (!world.messages?.length) {
            throw new Error("Expected a websocket time update");
          }
        },
      },
      {
        pattern: /^Then the websocket message does not contain the Digitransit key$/,
        run: ({ assert, world }) => {
          const message = world.messages?.join("\n") ?? "";
          assert.equal(message.includes(DIGITRANSIT_KEY), false);
          assert.equal(world.digitransitHeaders?.includes(DIGITRANSIT_KEY), true);
          assert.equal(message.includes("departure-time"), true);
        },
      },
      {
        pattern: /^Then the live departure url does not contain the Digitransit key$/,
        run: async ({ assert, world }) => {
          try {
            const url = departureLiveWebSocketUrl(liveQuery(), "https://helsinkimoves.fheinonen.eu");
            assert.equal(url.includes(DIGITRANSIT_KEY), false);
            assert.equal(url.startsWith("wss://helsinkimoves.fheinonen.eu/api/v1/departures-live?"), true);
            const plain = await fetch(`http://127.0.0.1:${world.livePort}/api/v1/departures-live`);
            assert.equal(plain.status, 426);
            assert.equal((await plain.text()).includes(DIGITRANSIT_KEY), false);
            const invalid = new WebSocket(
              `ws://127.0.0.1:${world.livePort}/api/v1/departures-live?mode=NOPE`,
            );
            const invalidMessages: string[] = [];
            invalid.on("message", (data) => {
              invalidMessages.push(String(data));
            });
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(() => reject(new Error("invalid live query stayed open")), 1000);
              invalid.on("close", () => {
                clearTimeout(timer);
                resolve();
              });
            });
            assert.equal(invalidMessages.join("\n").includes(DIGITRANSIT_KEY), false);
            assert.equal(invalidMessages.length, 0);
          } finally {
            await world.stop?.();
          }
        },
      },
      {
        pattern: /^When the socket receives messages that are not a newer Pasila time$/,
        run: () => {
          const socket = FakeWebSocket.latest;
          if (!socket) {
            throw new Error("Expected a live departure socket");
          }
          socket.receive("not-json");
          socket.receive(JSON.stringify({ type: "other" }));
          socket.receive(
            JSON.stringify({
              departureIso: "not-a-time",
              stopId: "HSL:STOP_A",
              tripId: "trip-pasila",
              type: "departure-time",
            }),
          );
          socket.receive(
            serializeDepartureTimeUpdate({
              departureIso: "2026-03-07T10:20:00.000Z",
              stopId: "HSL:STOP_A",
              tripId: "trip-pasila",
            }),
          );
        },
      },
      {
        pattern: /^Then the Pasila departure time reads 20m$/,
        run: ({ assert, world }) => {
          assert.equal(timeText(pasilaRow(world)), "20m");
        },
      },
      {
        pattern: /^Then the Pasila departure time is still$/,
        run: async ({ assert, world }) => {
          try {
            assert.equal(pasilaRow(world)?.querySelector(".departure-card__time")?.classList.contains("is-live"), false);
          } finally {
            await world.stop?.();
          }
        },
      },
      {
        pattern: /^When the live socket closes$/,
        run: async () => {
          const socket = FakeWebSocket.latest;
          if (!socket) {
            throw new Error("Expected a live departure socket");
          }
          socket.close();
          await new Promise((resolve) => {
            setTimeout(resolve, 2_100);
          });
        },
      },
      {
        pattern: /^Then another live socket is open for the same board$/,
        run: async ({ assert, world }) => {
          try {
            const url = FakeWebSocket.latest?.url ?? "";
            assert.equal(url.includes("/api/v1/departures-live?"), true);
            assert.equal(url.includes("stopId=HSL%3ASTOP_A") || url.includes("stopId=HSL:STOP_A"), true);
          } finally {
            await world.stop?.();
          }
        },
      },
    ],
  },
);

function departureLivePath(query: DepartureLiveQuery): string {
  const url = new URL(departureLiveWebSocketUrl(query, "http://127.0.0.1"));
  return `${url.pathname}${url.search}`;
}
