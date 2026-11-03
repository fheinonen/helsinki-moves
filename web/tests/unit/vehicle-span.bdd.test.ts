import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore, type AppStore } from "@client/app/app-store";
import { renderAppShell } from "@client/app/app-shell";
import { createAppController } from "@client/app/app-controller";
import { openVehicleSpanStream, vehicleSpanUrl } from "@client/services/vehicle-span-client";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";
import { createApp } from "@server/app";
import { createDigitransitService } from "@server/services/digitransit/client";
import { readVehicleSpan } from "@server/services/vehicle-span/stream";
import type { VehicleSpanEvent } from "@shared/domain/vehicle-span";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const API_KEY = "server-only-digitransit-key";

interface GeoPoint {
  lat: number;
  lon: number;
}

interface ScriptedSource {
  close(): void;
  emit(type: string, data: string): void;
  url: string;
}

interface World {
  documentRef?: Document;
  generator?: AsyncGenerator<VehicleSpanEvent>;
  lineRest?: GeoPoint;
  lockedFrame?: string;
  nextVehicle?: GeoPoint;
  openedVehicle: GeoPoint;
  releaseSleep?: () => void;
  root?: HTMLElement;
  serverBody?: string;
  source?: ScriptedSource;
  stopId: string;
  stopPoint: GeoPoint;
  tripId: string;
  upstreamKeys: string[];
  waitForSleep?: Promise<void>;
}

function coord(value: number): string {
  return value.toFixed(6);
}

function parsePoint(lat: string, lon: string): GeoPoint {
  return { lat: Number(lat), lon: Number(lon) };
}

class ScriptedEventSource implements ScriptedSource {
  private readonly listeners = new Map<string, (event: { data?: string }) => void>();
  closed = false;
  url: string;

  constructor(url: string) {
    this.url = url;
  }

  addEventListener(type: string, listener: (event: { data?: string }) => void): void {
    this.listeners.set(type, listener);
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
  }

  emit(type: string, data: string): void {
    this.listeners.get(type)?.({ data });
  }
}

function renderBoard(world: World): void {
  const store: AppStore = createAppStore();
  store.applyDeparturesResponse({
    filterOptions: {
      destinations: [{ count: 1, value: "Kamppi" }],
      lines: [{ count: 1, value: "550" }],
    },
    mode: "BUS",
    selectedStopId: world.stopId,
    station: {
      departures: [
        {
          departureIso: "2026-03-07T10:10:00.000Z",
          destination: "Kamppi",
          line: "550",
          stopId: world.stopId,
          tripId: world.tripId,
        },
      ],
      distanceMeters: 80,
      stopCode: "A1",
      stopCodes: ["A1"],
      stopName: "Kamppi",
      type: "stop",
    },
    stops: [],
  });
  const documentRef = document.implementation.createHTMLDocument("vehicle-span");
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
    store,
  });
  renderAppShell({
    controller,
    documentRef,
    openVehicleSpan(input) {
      return openVehicleSpanStream({
        ...input,
        eventSourceFactory(url) {
          const source = new ScriptedEventSource(url);
          world.source = source;
          return source;
        },
      });
    },
    root,
  });
  world.documentRef = documentRef;
  world.root = root;
}

function armGenerator(world: World): void {
  let sleepCount = 0;
  let release = () => {};
  world.waitForSleep = new Promise((resolve) => {
    release = resolve;
  });
  world.releaseSleep = () => {
    release();
  };
  world.generator = readVehicleSpan({
    intervalMs: 1,
    isActive: () => sleepCount < 2,
    readStop: async () => world.stopPoint,
    readVehicle: async () => (sleepCount === 0 ? world.openedVehicle : (world.nextVehicle ?? world.openedVehicle)),
    sleep: async () => {
      sleepCount += 1;
      if (sleepCount === 1) {
        await world.waitForSleep;
      }
    },
  });
}

async function emitOpening(world: World): Promise<void> {
  const card = world.root?.querySelector<HTMLElement>("[data-vehicle-span='true']");
  if (!card) {
    throw new Error("Expected a pressable departure card");
  }
  card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  if (!world.source) {
    throw new Error("Expected a vehicle span stream");
  }
  armGenerator(world);
  const first = await world.generator?.next();
  if (!first || first.done || first.value.type !== "span") {
    throw new Error("Expected the opening span");
  }
  world.source.emit("span", JSON.stringify(first.value));
  const glass = world.root?.querySelector<HTMLElement>("[data-vehicle-glass]");
  world.lockedFrame = [
    glass?.dataset.south,
    glass?.dataset.west,
    glass?.dataset.north,
    glass?.dataset.east,
  ].join(",");
}

function readClientSource(): string {
  const directory = path.join(webRoot, "src/client");
  const files: string[] = [];
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }
      if (entry.name.endsWith(".ts")) {
        files.push(fs.readFileSync(entryPath, "utf8"));
      }
    }
  };
  visit(directory);
  return files.join("\n");
}

defineFeature<World>(
  test,
  `
Feature: Vehicle span map

  Scenario: Pressing a departure card opens the map
    Given a departure card for line 550 to Kamppi on trip HSL:TRIP1 at stop HSL:STOP1
    When the card is pressed
    Then the vehicle map is open
    And the map closes when the close control is pressed

  Scenario: The map frame fits the opening vehicle and the chosen stop
    Given a departure card for line 550 to Kamppi on trip HSL:TRIP1 at stop HSL:STOP1
    And the vehicle opens at latitude 60.170 and longitude 24.940
    And the chosen stop is at latitude 60.180 and longitude 24.950
    And the rest of the line includes latitude 60.250 and longitude 25.050
    When the card is pressed
    Then the frame contains the opening vehicle position
    And the frame contains the chosen stop
    And the frame does not contain the rest of the line

  Scenario: The vehicle marker moves when a newer position arrives
    Given a departure card for line 550 to Kamppi on trip HSL:TRIP1 at stop HSL:STOP1
    And the vehicle opens at latitude 60.170 and longitude 24.940
    And the chosen stop is at latitude 60.180 and longitude 24.950
    And the map is open on the vehicle
    When a newer vehicle position arrives at latitude 60.174 and longitude 24.944
    Then the vehicle marker is at latitude 60.174 and longitude 24.944
    And the frame stays on the opening span

  Scenario: The Digitransit API key stays off the client
    Given a Digitransit key is configured on the server
    When the browser requests the vehicle span
    Then the browser request does not carry the Digitransit API key
    And the browser response does not carry the Digitransit API key
    And the client source does not contain the Digitransit API key
  `,
  {
    createWorld: () => ({
      openedVehicle: { lat: 60.17, lon: 24.94 },
      stopId: "HSL:STOP1",
      stopPoint: { lat: 60.18, lon: 24.95 },
      tripId: "HSL:TRIP1",
      upstreamKeys: [],
    }),
    stepDefinitions: [
      {
        pattern: /^Given a departure card for line 550 to Kamppi on trip HSL:TRIP1 at stop HSL:STOP1$/,
        run: ({ world }) => {
          renderBoard(world);
        },
      },
      {
        pattern: /^Given the vehicle opens at latitude (-?\d+\.\d+) and longitude (-?\d+\.\d+)$/,
        run: ({ args, world }) => {
          world.openedVehicle = parsePoint(args[0], args[1]);
        },
      },
      {
        pattern: /^Given the chosen stop is at latitude (-?\d+\.\d+) and longitude (-?\d+\.\d+)$/,
        run: ({ args, world }) => {
          world.stopPoint = parsePoint(args[0], args[1]);
        },
      },
      {
        pattern: /^Given the rest of the line includes latitude (-?\d+\.\d+) and longitude (-?\d+\.\d+)$/,
        run: ({ args, world }) => {
          world.lineRest = parsePoint(args[0], args[1]);
        },
      },
      {
        pattern: /^Given the map is open on the vehicle$/,
        run: async ({ world }) => {
          await emitOpening(world);
        },
      },
      {
        pattern: /^Given a Digitransit key is configured on the server$/,
        run: ({ world }) => {
          world.upstreamKeys = [];
        },
      },
      {
        pattern: /^When the card is pressed$/,
        run: async ({ world }) => {
          await emitOpening(world);
        },
      },
      {
        pattern: /^When a newer vehicle position arrives at latitude (-?\d+\.\d+) and longitude (-?\d+\.\d+)$/,
        run: async ({ args, world }) => {
          world.nextVehicle = parsePoint(args[0], args[1]);
          if (!world.generator || !world.source || !world.releaseSleep) {
            throw new Error("Expected an open vehicle span");
          }
          const pending = world.generator.next();
          world.releaseSleep();
          const step = await pending;
          if (step.done || step.value.type !== "position") {
            throw new Error("Expected a newer vehicle position");
          }
          world.source.emit("position", JSON.stringify(step.value));
        },
      },
      {
        pattern: /^When the browser requests the vehicle span$/,
        run: async ({ world }) => {
          const service = createDigitransitService({
            fetchImpl: async (_url, init) => {
              const headers = new Headers(init?.headers);
              world.upstreamKeys.push(headers.get("digitransit-subscription-key") || "");
              const body = JSON.parse(String(init?.body || "{}")) as { query?: string };
              const query = body.query || "";
              if (query.includes("StopPoint")) {
                return Response.json({
                  data: { stop: { lat: world.stopPoint.lat, lon: world.stopPoint.lon } },
                });
              }
              if (!query.includes("VehicleFix")) {
                throw new Error("Unexpected Digitransit query");
              }
              return Response.json({
                data: {
                  trip: {
                    pattern: {
                      vehiclePositions: [
                        {
                          lat: world.openedVehicle.lat,
                          lon: world.openedVehicle.lon,
                          trip: { gtfsId: world.tripId },
                        },
                      ],
                    },
                  },
                },
              });
            },
            getApiKey: () => API_KEY,
          });
          const app = createApp({
            digitransitService: service,
            vehicleSpanSleep: async () => {},
          });
          const requestUrl = new URL(vehicleSpanUrl(world.tripId, world.stopId), "http://localhost");
          const response = await app.request(requestUrl);
          world.serverBody = await response.text();
        },
      },
      {
        pattern: /^Then the vehicle map is open$/,
        run: ({ assert, world }) => {
          const map = world.root?.querySelector<HTMLElement>("[data-vehicle-map]");
          assert.equal(map?.hidden, false);
        },
      },
      {
        pattern: /^Then the map closes when the close control is pressed$/,
        run: ({ assert, world }) => {
          const closeControl = world.root?.querySelector<HTMLButtonElement>("[data-vehicle-span-close]");
          closeControl?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          assert.equal(world.root?.querySelector("[data-vehicle-map]"), null);
          assert.equal(world.source?.closed, true);
        },
      },
      {
        pattern: /^Then the frame contains the opening vehicle position$/,
        run: ({ assert, world }) => {
          const glass = world.root?.querySelector<HTMLElement>("[data-vehicle-glass]");
          assert.equal(glass?.dataset.south, coord(Math.min(world.openedVehicle.lat, world.stopPoint.lat)));
          assert.equal(glass?.dataset.west, coord(Math.min(world.openedVehicle.lon, world.stopPoint.lon)));
        },
      },
      {
        pattern: /^Then the frame contains the chosen stop$/,
        run: ({ assert, world }) => {
          const glass = world.root?.querySelector<HTMLElement>("[data-vehicle-glass]");
          assert.equal(glass?.dataset.north, coord(Math.max(world.openedVehicle.lat, world.stopPoint.lat)));
          assert.equal(glass?.dataset.east, coord(Math.max(world.openedVehicle.lon, world.stopPoint.lon)));
        },
      },
      {
        pattern: /^Then the frame does not contain the rest of the line$/,
        run: ({ assert, world }) => {
          const glass = world.root?.querySelector<HTMLElement>("[data-vehicle-glass]");
          const rest = world.lineRest;
          if (!glass || !rest) {
            throw new Error("Expected a frame and the rest of the line");
          }
          const south = Number(glass.dataset.south);
          const north = Number(glass.dataset.north);
          const west = Number(glass.dataset.west);
          const east = Number(glass.dataset.east);
          const inside = rest.lat >= south && rest.lat <= north && rest.lon >= west && rest.lon <= east;
          assert.equal(inside, false);
          assert.equal(glass.querySelectorAll("[data-route-line], polyline, path").length, 0);
        },
      },
      {
        pattern: /^Then the vehicle marker is at latitude (-?\d+\.\d+) and longitude (-?\d+\.\d+)$/,
        run: ({ args, assert, world }) => {
          const marker = world.root?.querySelector<HTMLElement>("[data-vehicle-marker]");
          const point = parsePoint(args[0], args[1]);
          assert.equal(marker?.dataset.lat, coord(point.lat));
          assert.equal(marker?.dataset.lon, coord(point.lon));
        },
      },
      {
        pattern: /^Then the frame stays on the opening span$/,
        run: ({ assert, world }) => {
          const glass = world.root?.querySelector<HTMLElement>("[data-vehicle-glass]");
          const current = [
            glass?.dataset.south,
            glass?.dataset.west,
            glass?.dataset.north,
            glass?.dataset.east,
          ].join(",");
          assert.equal(current, world.lockedFrame);
        },
      },
      {
        pattern: /^Then the browser request does not carry the Digitransit API key$/,
        run: ({ assert, world }) => {
          const url = vehicleSpanUrl(world.tripId, world.stopId);
          assert.equal(url.includes(API_KEY), false);
          assert.equal(url.includes("digitransit-subscription-key"), false);
          assert.equal(world.upstreamKeys.length > 0, true);
          assert.equal(world.upstreamKeys.every((value) => value === API_KEY), true);
        },
      },
      {
        pattern: /^Then the browser response does not carry the Digitransit API key$/,
        run: ({ assert, world }) => {
          assert.equal(world.serverBody?.includes(API_KEY), false);
          assert.equal(world.serverBody?.includes('"type":"span"'), true);
        },
      },
      {
        pattern: /^Then the client source does not contain the Digitransit API key$/,
        run: ({ assert }) => {
          const source = readClientSource();
          assert.equal(source.includes(API_KEY), false);
          assert.equal(source.includes("DIGITRANSIT_API_KEY"), false);
          assert.equal(source.includes("digitransit-subscription-key"), false);
        },
      },
    ],
  }
);
