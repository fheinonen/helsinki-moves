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
  closed: boolean;
  emit(type: string, data: string): void;
  url: string;
}

interface LiveFeedVehicle {
  canceled?: boolean;
  directionId: number;
  lat: number;
  lon: number;
  routeId: string;
  startDate: string;
  startTime: string;
}

interface World {
  blankVehicle?: boolean;
  documentRef?: Document;
  graphDown?: boolean;
  failLiveOnce?: boolean;
  generator?: AsyncGenerator<VehicleSpanEvent>;
  lineRest?: GeoPoint;
  liveBody?: Uint8Array;
  liveHeader?: string | null;
  liveRequests: string[];
  lockedFrame?: string;
  nextVehicle?: GeoPoint;
  spanVia?: GeoPoint;
  openedVehicle: GeoPoint;
  releaseSleep?: () => void;
  root?: HTMLElement;
  serverBodies?: string[];
  serverBody?: string;
  source?: ScriptedSource;
  tileBody?: string;
  tileStatus?: number;
  tileType?: string | null;
  tileUpstream?: string;
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

function inverseMercator(t: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * t))) * 180) / Math.PI;
}

interface StreetTileBox {
  east: number;
  north: number;
  south: number;
  src: string;
  west: number;
}

function readStreetTiles(glass: HTMLElement | null | undefined): StreetTileBox[] {
  if (!glass) {
    return [];
  }
  return [...glass.querySelectorAll<HTMLImageElement>("[data-street-tile]")].map((tile) => {
    const url = new URL(tile.getAttribute("src") || "", "http://localhost");
    const zoom = Number(url.searchParams.get("z"));
    const x = Number(url.searchParams.get("x"));
    const y = Number(url.searchParams.get("y"));
    const scale = 2 ** zoom;
    return {
      east: ((x + 1) / scale) * 360 - 180,
      north: inverseMercator(y / scale),
      south: inverseMercator((y + 1) / scale),
      src: `${url.pathname}${url.search}`,
      west: (x / scale) * 360 - 180,
    };
  });
}

function varint(value: number): number[] {
  const bytes: number[] = [];
  let rest = value;
  while (rest > 127) {
    bytes.push((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  bytes.push(rest);
  return bytes;
}

function protoKey(field: number, wire: number): number[] {
  return varint((field << 3) | wire);
}

function protoMessage(field: number, body: number[]): number[] {
  return [...protoKey(field, 2), ...varint(body.length), ...body];
}

function protoString(field: number, value: string): number[] {
  const text = [...new TextEncoder().encode(value)];
  return [...protoKey(field, 2), ...varint(text.length), ...text];
}

function protoFloat(field: number, value: number): number[] {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setFloat32(0, value, true);
  return [...protoKey(field, 5), ...new Uint8Array(buffer)];
}

function liveFeedBytes(chosen: LiveFeedVehicle): Uint8Array {
  const same = {
    directionId: chosen.directionId,
    routeId: chosen.routeId,
    startTime: chosen.startTime,
  };
  const vehicles: LiveFeedVehicle[] = [
    { ...same, lat: 62.5, lon: 25.5, startDate: "20261102" },
    { ...same, canceled: true, lat: 61.5, lon: 25.5, startDate: chosen.startDate },
    chosen,
    { ...same, lat: 59.5, lon: 23.5, routeId: "9999", startDate: chosen.startDate },
  ];
  const parts = [protoMessage(1, protoString(1, "2.0"))];
  for (const vehicle of vehicles) {
    const trip = [
      ...protoString(2, vehicle.startTime),
      ...protoString(3, vehicle.startDate),
      ...(vehicle.canceled ? [...protoKey(4, 0), 3] : []),
      ...protoString(5, vehicle.routeId),
      ...protoKey(6, 0),
      vehicle.directionId,
    ];
    const position = [...protoFloat(1, vehicle.lat), ...protoFloat(2, vehicle.lon)];
    const body = [...protoMessage(1, trip), ...protoMessage(2, position), ...protoKey(5, 1), 0, 0, 0, 0, 0, 0, 0, 0];
    parts.push(protoMessage(2, [...protoString(1, "bus"), ...protoMessage(4, body)]));
  }
  const partialTrip = protoMessage(1, protoString(2, "13:15:00"));
  const partialPosition = protoMessage(2, protoFloat(2, 24.9));
  parts.push(protoMessage(2, [...protoString(1, "partial"), ...protoMessage(4, [...partialTrip, ...partialPosition])]));
  parts.push(protoMessage(2, [...protoString(1, "empty"), ...protoMessage(4, protoMessage(1, protoString(5, "1")))]));
  return Uint8Array.from([...parts.flat(), 0x80]);
}

function feedBody(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function readSpanVehicle(body: string): GeoPoint | null {
  const line = body.split("\n").find((item) => item.startsWith("data: "));
  if (!line) {
    return null;
  }
  const event = JSON.parse(line.slice(6)) as { vehicle?: GeoPoint };
  if (typeof event.vehicle?.lat !== "number" || typeof event.vehicle.lon !== "number") {
    return null;
  }
  return event.vehicle;
}

function cornerCovered(tiles: StreetTileBox[], lat: number, lon: number): boolean {
  const epsilon = 1e-8;
  return tiles.some(
    (tile) =>
      lat <= tile.north + epsilon &&
      lat >= tile.south - epsilon &&
      lon >= tile.west - epsilon &&
      lon <= tile.east + epsilon,
  );
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

async function requestVehicleSpan(world: World): Promise<void> {
  const service = createDigitransitService({
    fetchImpl: async (_url, init) => {
      const headers = new Headers(init?.headers);
      world.upstreamKeys.push(headers.get("digitransit-subscription-key") || "");
      const body = JSON.parse(String(init?.body || "{}")) as { query?: string };
      const query = body.query || "";
      if (world.graphDown && query.includes("VehicleFix")) {
        throw new Error("digitransit down");
      }
      if (query.includes("StopPoint")) {
        return Response.json({
          data: { stop: { lat: world.stopPoint.lat, lon: world.stopPoint.lon } },
        });
      }
      if (query.includes("TripShape")) {
        if (!world.spanVia && !world.lineRest) {
          return Response.json({
            data: { trip: { pattern: { geometry: null } } },
          });
        }
        const geometry = [world.stopPoint];
        if (world.spanVia) {
          geometry.push(world.spanVia);
        }
        geometry.push(world.openedVehicle);
        if (world.lineRest) {
          geometry.push(world.lineRest);
        }
        return Response.json({
          data: { trip: { pattern: { geometry } } },
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
                  lat: world.blankVehicle ? null : world.openedVehicle.lat,
                  lon: world.blankVehicle ? null : world.openedVehicle.lon,
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
  let liveAttempts = 0;
  const app = createApp({
    digitransitService: service,
    liveVehicleFetch: async (url, init) => {
      liveAttempts += 1;
      world.liveRequests.push(String(url));
      world.liveHeader = new Headers(init?.headers).get("digitransit-subscription-key");
      if (world.failLiveOnce && liveAttempts === 1) {
        throw new Error("live feed missed");
      }
      if (!world.liveBody) {
        return new Response(null, { status: 404 });
      }
      return new Response(feedBody(world.liveBody));
    },
    now: () => Date.parse("2026-11-03T11:00:00.000Z"),
    vehicleSpanSleep: async () => {},
  });
  const requestUrl = new URL(vehicleSpanUrl(world.tripId, world.stopId), "http://localhost");
  const response = await app.request(requestUrl);
  world.serverBody = await response.text();
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

function routeLine(world: World): GeoPoint[] {
  if (!world.lineRest && !world.spanVia) {
    return [];
  }
  const line: GeoPoint[] = [];
  if (world.lineRest) {
    line.push(world.lineRest);
  }
  line.push(world.openedVehicle);
  if (world.spanVia) {
    line.push(world.spanVia);
  }
  line.push(world.stopPoint);
  return line;
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
    readRoute: async () => routeLine(world),
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

  Scenario: Pressing a departure card shows the map before the vehicle is found
    Given a departure card for line 550 to Kamppi on trip HSL:TRIP1 at stop HSL:STOP1
    When the departure card is pressed before the vehicle arrives
    Then the vehicle map is open
    And the street map is still waiting for the vehicle

  Scenario: A press opens the span from the live vehicle feed
    Given a Digitransit key is configured on the server
    And the vehicle opens at latitude 60.171 and longitude 24.939
    And the chosen stop is at latitude 60.180 and longitude 24.950
    And the departure trip is HSL:1040_20261102_Ti_1_1315
    And Digitransit has no coordinates for that vehicle
    And the live feed places route 1040 direction 0 starting at 13:15:00 on 20261103
    When the browser requests the vehicle span
    Then the span response places the opening vehicle
    And the live feed request leaves the Digitransit API key on the server

  Scenario: A press follows the return direction on the live feed
    Given a Digitransit key is configured on the server
    And the vehicle opens at latitude 60.186 and longitude 24.920
    And the chosen stop is at latitude 60.190 and longitude 24.930
    And the departure trip is HSL:4400_20261102_Ti_2_1227
    And Digitransit has no coordinates for that vehicle
    And the live feed places route 4400 direction 1 starting at 12:27:00 on 20261103
    When the browser requests the vehicle span
    Then the span response places the opening vehicle

  Scenario: A live feed that misses once still opens the span
    Given a Digitransit key is configured on the server
    And the vehicle opens at latitude 60.171 and longitude 24.939
    And the chosen stop is at latitude 60.180 and longitude 24.950
    And the departure trip is HSL:1040_20261102_Ti_1_1315
    And Digitransit has no coordinates for that vehicle
    And the live feed fails once then places route 1040 direction 0 starting at 13:15:00 on 20261103
    When the browser requests the vehicle span
    Then the span response places the opening vehicle

  Scenario: A press does not invent a vehicle the live feed cannot find
    Given a Digitransit key is configured on the server
    And the vehicle opens at latitude 60.171 and longitude 24.939
    And the chosen stop is at latitude 60.180 and longitude 24.950
    And the departure trip is HSL:1040_20261102_Ti_1_1315
    And Digitransit has no coordinates for that vehicle
    When the browser requests the vehicle span
    Then the span response does not invent a vehicle

  Scenario: A press still opens the span when Digitransit does not answer
    Given a Digitransit key is configured on the server
    And the vehicle opens at latitude 60.171 and longitude 24.939
    And the chosen stop is at latitude 60.180 and longitude 24.950
    And the departure trip is HSL:1040_20261102_Ti_1_1315
    And Digitransit has no answer for that vehicle
    And the live feed places route 1040 direction 0 starting at 13:15:00 on 20261103
    When the browser requests the vehicle span
    Then the span response places the opening vehicle

  Scenario: A press does not invent a vehicle for a trip the feed cannot match
    Given a Digitransit key is configured on the server
    And the vehicle opens at latitude 60.171 and longitude 24.939
    And the chosen stop is at latitude 60.180 and longitude 24.950
    And Digitransit has no coordinates for that vehicle
    When the browser requests unmatched trips HSL:TRIP1, HSL:1040_20261102_Ti_9_1315, and HSL:1040_20261102_Ti_1_131
    Then none of the span responses invent a vehicle

  Scenario: The map frame fits the opening vehicle and the chosen stop
    Given a departure card for line 550 to Kamppi on trip HSL:TRIP1 at stop HSL:STOP1
    And the vehicle opens at latitude 60.170 and longitude 24.940
    And the chosen stop is at latitude 60.180 and longitude 24.950
    And the vehicle line passes through latitude 60.175 and longitude 24.945
    And the rest of the line includes latitude 60.250 and longitude 25.050
    When the card is pressed
    Then the frame contains the opening vehicle position
    And the frame contains the chosen stop
    And the frame does not contain the rest of the line

  Scenario: The map shows streets for the opening span
    Given a departure card for line 550 to Kamppi on trip HSL:TRIP1 at stop HSL:STOP1
    And the vehicle opens at latitude 60.170 and longitude 24.940
    And the chosen stop is at latitude 60.180 and longitude 24.950
    And the vehicle line passes through latitude 60.175 and longitude 24.945
    And the rest of the line includes latitude 60.250 and longitude 25.050
    When the card is pressed
    Then the map shows street tiles for that span
    And the drawn line keeps the vehicle line and leaves out the rest
    And the chosen stop is marked

  Scenario: The stream sends the span of the line and not the rest
    Given a Digitransit key is configured on the server
    And the vehicle opens at latitude 60.170 and longitude 24.940
    And the chosen stop is at latitude 60.180 and longitude 24.950
    And the vehicle line passes through latitude 60.176 and longitude 24.955
    And the rest of the line includes latitude 60.250 and longitude 25.050
    When the browser requests the vehicle span
    Then the span response keeps the vehicle line
    And the span response leaves out the rest of the line

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

  Scenario: A street tile stays on our server
    Given a Digitransit key is configured on the server
    When the browser requests a street tile
    Then the street tile image is returned
    And the street tile leaves the Digitransit API key on the server

  Scenario: A street tile the map cannot serve stays empty
    Given a Digitransit key is configured on the server
    When the browser requests a street tile the map cannot serve
    Then the empty tile response does not carry the Digitransit API key
  `,
  {
    createWorld: () => ({
      liveRequests: [],
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
        pattern: /^Given the vehicle line passes through latitude (-?\d+\.\d+) and longitude (-?\d+\.\d+)$/,
        run: ({ args, world }) => {
          world.spanVia = parsePoint(args[0], args[1]);
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
        pattern: /^When the departure card is pressed before the vehicle arrives$/,
        run: ({ world }) => {
          const card = world.root?.querySelector<HTMLElement>("[data-vehicle-span='true']");
          card?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        },
      },
      {
        pattern: /^Given the departure trip is (\S+)$/,
        run: ({ args, world }) => {
          world.tripId = args[0];
        },
      },
      {
        pattern: /^Given Digitransit has no coordinates for that vehicle$/,
        run: ({ world }) => {
          world.blankVehicle = true;
        },
      },
      {
        pattern: /^Given Digitransit has no answer for that vehicle$/,
        run: ({ world }) => {
          world.graphDown = true;
        },
      },
      {
        pattern: /^Given the live feed places route ([A-Za-z0-9]+) direction ([01]) starting at (\d{2}:\d{2}:\d{2}) on (\d{8})$/,
        run: ({ args, world }) => {
          world.liveBody = liveFeedBytes({
            directionId: Number(args[1]),
            lat: world.openedVehicle.lat,
            lon: world.openedVehicle.lon,
            routeId: args[0],
            startDate: args[3],
            startTime: args[2],
          });
        },
      },
      {
        pattern: /^Given the live feed fails once then places route ([A-Za-z0-9]+) direction ([01]) starting at (\d{2}:\d{2}:\d{2}) on (\d{8})$/,
        run: ({ args, world }) => {
          world.failLiveOnce = true;
          world.liveBody = liveFeedBytes({
            directionId: Number(args[1]),
            lat: world.openedVehicle.lat,
            lon: world.openedVehicle.lon,
            routeId: args[0],
            startDate: args[3],
            startTime: args[2],
          });
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
        pattern: /^When the browser requests a street tile$/,
        run: async ({ world }) => {
          world.upstreamKeys = [];
          const app = createApp({
            getApiKey: () => API_KEY,
            mapTileFetch: async (url, init) => {
              const headers = new Headers(init?.headers);
              world.upstreamKeys.push(headers.get("digitransit-subscription-key") || "");
              world.tileUpstream = String(url);
              return new Response(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), {
                headers: { "content-type": "image/png" },
              });
            },
          });
          const response = await app.request("http://localhost/api/v1/map-tile?z=16&x=37309&y=18967");
          world.tileStatus = response.status;
          world.tileType = response.headers.get("content-type");
          world.tileBody = await response.text();
        },
      },
      {
        pattern: /^When the browser requests the vehicle span$/,
        run: async ({ world }) => {
          await requestVehicleSpan(world);
        },
      },
      {
        pattern: /^When the browser requests unmatched trips (\S+), (\S+), and (\S+)$/,
        run: async ({ args, world }) => {
          world.serverBodies = [];
          for (const tripId of args) {
            world.tripId = tripId;
            await requestVehicleSpan(world);
            world.serverBodies.push(world.serverBody || "");
          }
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
        pattern: /^Then the street map is still waiting for the vehicle$/,
        run: ({ assert, world }) => {
          const glass = world.root?.querySelector<HTMLElement>("[data-vehicle-glass]");
          const status = world.root?.querySelector("[data-vehicle-status]");
          const markup = world.root?.innerHTML ?? "";
          assert.equal(glass?.querySelector("[data-street-tile]"), null);
          assert.equal(status?.textContent, "Finding the vehicle");
          assert.equal(glass?.dataset.south, undefined);
          assert.equal(markup.indexOf("data-vehicle-map") < markup.indexOf("app-shell__departures-table"), true);
        },
      },
      {
        pattern: /^Then the span response places the opening vehicle$/,
        run: ({ assert, world }) => {
          const vehicle = readSpanVehicle(world.serverBody || "");
          assert.equal(vehicle ? vehicle.lat.toFixed(3) : "", world.openedVehicle.lat.toFixed(3));
          assert.equal(vehicle ? vehicle.lon.toFixed(3) : "", world.openedVehicle.lon.toFixed(3));
          assert.equal(world.serverBody?.includes("59.5"), false);
          assert.equal(world.serverBody?.includes(API_KEY), false);
        },
      },
      {
        pattern: /^Then the live feed request leaves the Digitransit API key on the server$/,
        run: ({ assert, world }) => {
          const source = readClientSource();
          assert.equal(world.liveRequests.length, 1);
          assert.equal(world.liveRequests.some((url) => url.includes(API_KEY) || url.includes("digitransit")), false);
          assert.equal(world.liveRequests[0]?.includes("realtime.hsl.fi/realtime/vehicle-positions/v2/hsl"), true);
          assert.equal(world.liveHeader, null);
          assert.equal(source.includes("realtime.hsl.fi"), false);
          assert.equal(source.includes(API_KEY), false);
        },
      },
      {
        pattern: /^Then none of the span responses invent a vehicle$/,
        run: ({ assert, world }) => {
          const bodies = world.serverBodies || [];
          assert.equal(bodies.length, 3);
          assert.equal(bodies.every((body) => !body.includes('"type":"span"')), true);
          assert.equal(world.liveRequests.length > 0, true);
          assert.equal(bodies.every((body) => !body.includes(API_KEY)), true);
        },
      },
      {
        pattern: /^Then the span response does not invent a vehicle$/,
        run: ({ assert, world }) => {
          assert.equal(world.serverBody?.includes('"type":"span"'), false);
          assert.equal(world.liveRequests.length > 0, true);
          assert.equal(world.serverBody?.includes(API_KEY), false);
          assert.equal(world.liveHeader, null);
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
          const drawn = glass.querySelector("[data-route-span]")?.getAttribute("data-route-span") || "";
          assert.equal(drawn.includes(coord(rest.lat)), false);
          assert.equal(drawn.includes(coord(world.openedVehicle.lat)), true);
          assert.equal(drawn.includes(coord(world.stopPoint.lat)), true);
          if (world.spanVia) {
            assert.equal(drawn.includes(coord(world.spanVia.lat)), true);
          }
        },
      },
      {
        pattern: /^Then the map shows street tiles for that span$/,
        run: ({ assert, world }) => {
          const glass = world.root?.querySelector<HTMLElement>("[data-vehicle-glass]");
          const css = fs.readFileSync(path.join(webRoot, "src/client/styles/main.css"), "utf8");
          const glassRule = css.slice(css.indexOf(".vehicle-span__glass"), css.indexOf(".vehicle-span__stop"));
          const tiles = readStreetTiles(glass);
          const south = Number(glass?.dataset.south);
          const west = Number(glass?.dataset.west);
          const north = Number(glass?.dataset.north);
          const east = Number(glass?.dataset.east);
          const frameWidth = Math.max(east - west, 0.001);
          const tileWidth = tiles.length > 0 ? tiles[0].east - tiles[0].west : 0;
          assert.equal(glassRule.includes("repeating-linear-gradient"), false);
          assert.equal(tiles.length > 0, true);
          assert.equal(tiles.length <= 16, true);
          assert.equal(tiles.every((tile) => tile.src.startsWith("/api/v1/map-tile?")), true);
          assert.equal(
            tiles.some((tile) => tile.src.includes(API_KEY) || tile.src.includes("digitransit")),
            false,
          );
          assert.equal(tileWidth <= frameWidth * 4, true);
          assert.equal(tileWidth >= frameWidth / 8, true);
          assert.equal(cornerCovered(tiles, south, west), true);
          assert.equal(cornerCovered(tiles, south, east), true);
          assert.equal(cornerCovered(tiles, north, west), true);
          assert.equal(cornerCovered(tiles, north, east), true);
        },
      },
      {
        pattern: /^Then the drawn line keeps the vehicle line and leaves out the rest$/,
        run: ({ assert, world }) => {
          const glass = world.root?.querySelector<HTMLElement>("[data-vehicle-glass]");
          const drawn = glass?.querySelector("[data-route-span]")?.getAttribute("data-route-span") || "";
          const via = world.spanVia;
          const rest = world.lineRest;
          if (!via || !rest) {
            throw new Error("Expected the vehicle line and the rest of the line");
          }
          assert.equal((glass?.querySelector("[data-route-span]")?.getAttribute("points") || "").length > 0, true);
          assert.equal(drawn.includes(coord(world.openedVehicle.lat)), true);
          assert.equal(drawn.includes(coord(world.openedVehicle.lon)), true);
          assert.equal(drawn.includes(coord(world.stopPoint.lat)), true);
          assert.equal(drawn.includes(coord(world.stopPoint.lon)), true);
          assert.equal(drawn.includes(coord(via.lat)), true);
          assert.equal(drawn.includes(coord(via.lon)), true);
          assert.equal(drawn.includes(coord(rest.lat)), false);
          assert.equal(drawn.includes(coord(rest.lon)), false);
        },
      },
      {
        pattern: /^Then the chosen stop is marked$/,
        run: ({ assert, world }) => {
          const stop = world.root?.querySelector<HTMLElement>("[data-stop-marker]");
          assert.equal(stop instanceof HTMLElement, true);
          assert.equal(stop?.hidden, false);
        },
      },
      {
        pattern: /^Then the span response keeps the vehicle line$/,
        run: ({ assert, world }) => {
          const via = world.spanVia;
          if (!via) {
            throw new Error("Expected a point on the vehicle line");
          }
          assert.equal(world.serverBody?.includes(via.lon.toString()), true);
          assert.equal(world.serverBody?.includes(world.openedVehicle.lat.toString()), true);
          assert.equal(world.serverBody?.includes(world.stopPoint.lat.toString()), true);
        },
      },
      {
        pattern: /^Then the span response leaves out the rest of the line$/,
        run: ({ assert, world }) => {
          const rest = world.lineRest;
          if (!rest) {
            throw new Error("Expected the rest of the line");
          }
          assert.equal(world.serverBody?.includes(rest.lat.toString()), false);
          assert.equal(world.serverBody?.includes(rest.lon.toString()), false);
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
        pattern: /^When the browser requests a street tile the map cannot serve$/,
        run: async ({ world }) => {
          world.upstreamKeys = [];
          const bodies: string[] = [];
          const refused = async (app: ReturnType<typeof createApp>, path: string) => {
            const response = await app.request(`http://localhost${path}`);
            bodies.push(`${response.status}:${await response.text()}`);
          };
          const keyed = createApp({
            getApiKey: () => API_KEY,
            mapTileFetch: async (url, init) => {
              const headers = new Headers(init?.headers);
              world.upstreamKeys.push(headers.get("digitransit-subscription-key") || "");
              world.tileUpstream = String(url);
              const address = String(url);
              if (address.endsWith("/1/0/0.png")) {
                return new Response("nope", { status: 500, headers: { "content-type": "text/plain" } });
              }
              if (address.endsWith("/1/1/0.png")) {
                return new Response("nope", { status: 200, headers: { "content-type": "text/plain" } });
              }
              throw new Error("tile upstream failed");
            },
          });
          await refused(keyed, "/api/v1/map-tile?z=99&x=0&y=0");
          await refused(keyed, "/api/v1/map-tile?z=16&x=999999&y=0");
          await refused(keyed, "/api/v1/map-tile?z=no&x=1&y=1");
          await refused(keyed, "/api/v1/map-tile?z=1&x=0&y=0");
          await refused(keyed, "/api/v1/map-tile?z=1&x=1&y=0");
          await refused(keyed, "/api/v1/map-tile?z=1&x=0&y=1");
          await refused(createApp({ getApiKey: () => undefined }), "/api/v1/map-tile?z=1&x=1&y=1");
          world.tileBody = bodies.join("\n");
        },
      },
      {
        pattern: /^Then the empty tile response does not carry the Digitransit API key$/,
        run: ({ assert, world }) => {
          assert.equal(world.tileBody?.includes("200:"), false);
          assert.equal(world.tileBody?.includes(API_KEY), false);
          assert.equal(world.tileBody?.includes("DIGITRANSIT_API_KEY"), false);
          assert.equal(world.tileUpstream?.includes(API_KEY), false);
          assert.equal(world.upstreamKeys.every((value) => value === API_KEY), true);
        },
      },
      {
        pattern: /^Then the street tile image is returned$/,
        run: ({ assert, world }) => {
          assert.equal(world.tileStatus, 200);
          assert.equal(world.tileType, "image/png");
          assert.equal(world.tileBody?.includes(API_KEY), false);
          assert.equal(world.tileBody?.includes("DIGITRANSIT_API_KEY"), false);
        },
      },
      {
        pattern: /^Then the street tile leaves the Digitransit API key on the server$/,
        run: ({ assert, world }) => {
          assert.equal(world.tileUpstream?.includes(API_KEY), false);
          assert.equal(world.tileUpstream?.includes("/map/v3/hsl-map/16/37309/18967.png"), true);
          assert.equal(world.upstreamKeys.length, 1);
          assert.equal(world.upstreamKeys[0], API_KEY);
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
