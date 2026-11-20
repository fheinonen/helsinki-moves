import { afterEach, test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppController } from "@client/app/app-controller";
import { renderAppShell } from "@client/app/app-shell";
import { createAppStore, type AppStore } from "@client/app/app-store";
import { openVehicleSpanStream } from "@client/services/vehicle-span-client";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";
import { frameVehicleSpan, type GeoPoint } from "@shared/domain/vehicle-span";
import type { WalkRequest, WalkRoute } from "@shared/domain/walk-route";

const STOP_ID = "HSL:1020601";
const TRIP_ID = "HSL:TRIP1";
const PERSON: GeoPoint = { lat: 60.1706, lon: 24.9414 };
const VEHICLE_START: GeoPoint = { lat: 60.1715, lon: 24.9402 };
const VEHICLE_NEXT: GeoPoint = { lat: 60.1704, lon: 24.937 };
const PLATFORM: GeoPoint = { lat: 60.1692, lon: 24.9337 };
const WALK_ROUTE: WalkRoute = {
  points: [PERSON, { lat: 60.1701, lon: 24.9381 }, PLATFORM],
  seconds: 6 * 60,
};

interface ScriptedSource {
  close(): void;
  closed: boolean;
  emit(type: string, data: string): void;
  url: string;
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

interface PendingWalk {
  request: WalkRequest;
  resolve(route: WalkRoute | null): void;
}

interface World {
  cleanup?: () => void;
  documentRef?: Document;
  fireHold: (() => void) | null;
  pendingWalks: PendingWalk[];
  root?: HTMLElement;
  source?: ScriptedEventSource;
  store?: AppStore;
  vehicleOpens: number;
  zoomBefore?: number;
  panBefore?: { x: number; y: number };
}

function createWorld(): World {
  return {
    fireHold: null,
    pendingWalks: [],
    vehicleOpens: 0,
  };
}

function mockGlassBox(glass: HTMLElement | null): void {
  if (!glass) {
    return;
  }
  glass.getBoundingClientRect = () =>
    ({
      bottom: 300,
      height: 300,
      left: 0,
      right: 400,
      top: 0,
      width: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

function renderBoard(world: World): void {
  const store = createAppStore();
  store.setCoordinates(PERSON);
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
          departureIso: new Date(Date.now() + 15 * 60_000).toISOString(),
          destination: "Kamppi",
          line: "550",
          stopId: STOP_ID,
          tripId: TRIP_ID,
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
        id: STOP_ID,
        memberStopIds: [STOP_ID],
        name: "Kamppi",
        stopCodes: ["A1"],
      },
    ],
  });
  const documentRef = document;
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
      throw new Error("Unused");
    },
    async getDepartures() {
      throw new Error("Unused");
    },
  };
  const controller = createAppController({
    departuresClient,
    locationService,
    store,
  });
  world.cleanup = renderAppShell({
    controller,
    documentRef,
    fetchWalk(request) {
      return new Promise((resolve) => {
        world.pendingWalks.push({ request, resolve });
      });
    },
    openVehicleSpan(input) {
      world.vehicleOpens += 1;
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
    scheduleHold(_delayMs, fire) {
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

function departureRow(world: World): HTMLTableRowElement {
  const row = world.root?.querySelector("tbody tr");
  if (!(row instanceof HTMLTableRowElement)) {
    throw new Error("Expected departure row");
  }
  return row;
}

function openVehicleLive(world: World): void {
  const row = departureRow(world);
  row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const frame = frameVehicleSpan(VEHICLE_START, PLATFORM, [VEHICLE_START, VEHICLE_NEXT, PLATFORM]);
  world.source?.emit("span", JSON.stringify({ frame, type: "span", vehicle: VEHICLE_START }));
  mockGlassBox(world.root?.querySelector<HTMLElement>("[data-vehicle-glass]") ?? null);
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

function pointerEvent(type: string, x: number, y: number, pointerId = 1): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX: x,
    clientY: y,
    pointerId,
  });
}

async function openWalkMap(world: World): Promise<void> {
  const row = departureRow(world);
  row.dispatchEvent(pointerEvent("pointerdown", 10, 10));
  world.fireHold?.();
  world.documentRef?.dispatchEvent(pointerEvent("pointerup", 10, 10));
  world.pendingWalks.shift()?.resolve(WALK_ROUTE);
  await flush();
  mockGlassBox(world.root?.querySelector<HTMLElement>("[data-walk-map] .vehicle-span__glass") ?? null);
}

function readZoom(root: HTMLElement | undefined): number {
  const canvas = root?.querySelector<HTMLElement>(".vehicle-span__canvas");
  return Number.parseFloat(canvas?.style.getPropertyValue("--map-zoom") || "1");
}

function readPan(root: HTMLElement | undefined): { x: number; y: number } {
  const canvas = root?.querySelector<HTMLElement>(".vehicle-span__canvas");
  return {
    x: Number.parseFloat(canvas?.style.getPropertyValue("--map-pan-x") || "0"),
    y: Number.parseFloat(canvas?.style.getPropertyValue("--map-pan-y") || "0"),
  };
}

let activeCleanup: (() => void) | undefined;

afterEach(() => {
  activeCleanup?.();
  activeCleanup = undefined;
});

defineFeature<World>(
  test,
  `
Feature: Fluid vehicle map and walking route screens

  Scenario: Zoom controls, drag pan, reset, expand, wheel zoom, double click, and keyboard controls work on the vehicle map
    Given a departure board with line 550 to Kamppi and user coordinates
    And the vehicle map is open on the live vehicle
    When the user zooms in with the map control
    Then the map zoom is above 1 and reset is available
    When the user drags the open map by 40 pixels
    Then the open map pans from its center
    When the user resets the open map view
    Then the open map returns to the fitted span
    When the user expands and collapses the open map
    Then the open map toggles its expanded state
    When the user zooms with the wheel and double clicks the open map
    Then the open map responds to wheel zoom and resets on double click
    When the user uses keyboard zoom and arrow panning on the open map
    Then the open map zooms and pans with the keyboard

  Scenario: Pinch gesture zooms the walking route map and reset restores the fitted route
    Given a departure board with line 550 to Kamppi and user coordinates
    And the walking route map is open
    When two fingers pinch outward on the open map
    Then the map zoom is above 1 and reset is available
    When the user resets the open map view
    Then the open map returns to the fitted span

  Scenario: Switching directly between the vehicle map and walking route screen
    Given a departure board with line 550 to Kamppi and user coordinates
    And the vehicle map is open on the live vehicle
    When the user switches from the vehicle map to the walking route
    Then the walking route map replaces the vehicle map
    When the user switches from the walking route to the vehicle map
    Then the vehicle map replaces the walking route map

  Scenario: Pressing Escape closes the open vehicle map or walking route map and restores focus
    Given a departure board with line 550 to Kamppi and user coordinates
    And the vehicle map is open on the live vehicle
    When the user presses Escape
    Then both map screens are closed and focus returns to the departure button
    When the walking route map is opened and the user presses Escape
    Then both map screens are closed and focus returns to the departure button

  Scenario: Departure card shows hold progress, walk loading state, and active map state
    Given a departure board with line 550 to Kamppi and user coordinates
    When the user begins holding the departure card
    Then the departure card shows active hold feedback
    When the hold finishes while the walking route is loading
    Then the departure card shows walking route loading feedback
    When the pending walking route arrives
    Then the departure card is marked active for the open map and no longer loading
    When the user closes the walking route map
    Then the departure card is no longer marked active

  Scenario: Vehicle marker glides smoothly on updates after initial placement and marks live state
    Given a departure board with line 550 to Kamppi and user coordinates
    And the vehicle map is open on the live vehicle
    Then the vehicle map marks live tracking and initial placement does not glide
    When a live position update moves the vehicle
    Then the vehicle marker enables smooth gliding to the new point

  Scenario: Tapping the active departure card closes its open vehicle map cleanly
    Given a departure board with line 550 to Kamppi and user coordinates
    And the vehicle map is open on the live vehicle
    When the user taps the same active departure card again
    Then both map screens are closed

  Scenario: Street tiles mark themselves loaded when images finish decoding
    Given a departure board with line 550 to Kamppi and user coordinates
    And the vehicle map is open on the live vehicle
    When the street tiles finish loading
    Then each street tile is marked loaded

  Scenario: Zooming out, double clicking to zoom in, keyboard directions, and control button clicks behave cleanly
    Given a departure board with line 550 to Kamppi and user coordinates
    And the vehicle map is open on the live vehicle
    When the user double clicks the fitted map then zooms out with control and wheel
    Then the map returns cleanly to 1x zoom
    When the user navigates in all directions and resets with the keyboard
    Then the open map returns to the fitted span
    When pointer interactions start on map controls or outside drag
    Then the open map ignores spurious drags and stays at 1x zoom
  `,
  {
    createWorld,
    stepDefinitions: [
      {
        pattern: /^Given a departure board with line 550 to Kamppi and user coordinates$/,
        run({ world }) {
          renderBoard(world);
          activeCleanup = world.cleanup;
        },
      },
      {
        pattern: /^Given the vehicle map is open on the live vehicle$/,
        run({ world }) {
          openVehicleLive(world);
        },
      },
      {
        pattern: /^Given the walking route map is open$/,
        run: async ({ world }) => {
          await openWalkMap(world);
        },
      },
      {
        pattern: /^When the user zooms in with the map control$/,
        run({ world }) {
          const zoomIn = world.root?.querySelector<HTMLButtonElement>("[data-map-zoom-in]");
          if (!zoomIn) {
            throw new Error("Expected zoom in control");
          }
          zoomIn.click();
        },
      },
      {
        pattern: /^Then the map zoom is above 1 and reset is available$/,
        run({ assert, world }) {
          const reset = world.root?.querySelector<HTMLButtonElement>("[data-map-reset]");
          assert.equal(readZoom(world.root) > 1, true);
          assert.equal(reset instanceof HTMLButtonElement, true);
          assert.equal(reset?.disabled, false);
        },
      },
      {
        pattern: /^When the user drags the open map by 40 pixels$/,
        run({ world }) {
          const glass = world.root?.querySelector<HTMLElement>(".vehicle-span__glass");
          if (!glass) {
            throw new Error("Expected map glass");
          }
          world.panBefore = readPan(world.root);
          glass.dispatchEvent(pointerEvent("pointerdown", 120, 120, 1));
          glass.dispatchEvent(pointerEvent("pointermove", 160, 140, 1));
          glass.dispatchEvent(pointerEvent("pointerup", 160, 140, 1));
        },
      },
      {
        pattern: /^Then the open map pans from its center$/,
        run({ assert, world }) {
          const pan = readPan(world.root);
          assert.equal(pan.x !== (world.panBefore?.x ?? 0), true);
          assert.equal(pan.y !== (world.panBefore?.y ?? 0), true);
        },
      },
      {
        pattern: /^When the user resets the open map view$/,
        run({ world }) {
          const reset = world.root?.querySelector<HTMLButtonElement>("[data-map-reset]");
          if (!reset) {
            throw new Error("Expected reset control");
          }
          reset.click();
        },
      },
      {
        pattern: /^Then the open map returns to the fitted span$/,
        run({ assert, world }) {
          const reset = world.root?.querySelector<HTMLButtonElement>("[data-map-reset]");
          const pan = readPan(world.root);
          assert.equal(readZoom(world.root), 1);
          assert.equal(pan.x, 0);
          assert.equal(pan.y, 0);
          assert.equal(reset?.disabled, true);
        },
      },
      {
        pattern: /^When the user expands and collapses the open map$/,
        run({ world }) {
          const expand = world.root?.querySelector<HTMLButtonElement>("[data-map-expand]");
          if (!expand) {
            throw new Error("Expected expand control");
          }
          expand.click();
          world.zoomBefore = expand.getAttribute("aria-pressed") === "true" ? 1 : 0;
          expand.click();
        },
      },
      {
        pattern: /^Then the open map toggles its expanded state$/,
        run({ assert, world }) {
          const expand = world.root?.querySelector<HTMLButtonElement>("[data-map-expand]");
          const glass = world.root?.querySelector<HTMLElement>(".vehicle-span__glass");
          assert.equal(world.zoomBefore, 1);
          assert.equal(expand?.getAttribute("aria-pressed"), "false");
          assert.equal(glass?.classList.contains("is-expanded"), false);
        },
      },
      {
        pattern: /^When the user zooms with the wheel and double clicks the open map$/,
        run({ world }) {
          const glass = world.root?.querySelector<HTMLElement>(".vehicle-span__glass");
          if (!glass) {
            throw new Error("Expected map glass");
          }
          glass.dispatchEvent(
            new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 250, clientY: 150, deltaY: -120 }),
          );
          world.zoomBefore = readZoom(world.root);
          glass.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 250, clientY: 150 }));
        },
      },
      {
        pattern: /^Then the open map responds to wheel zoom and resets on double click$/,
        run({ assert, world }) {
          assert.equal((world.zoomBefore ?? 1) > 1, true);
          assert.equal(readZoom(world.root), 1);
        },
      },
      {
        pattern: /^When the user uses keyboard zoom and arrow panning on the open map$/,
        run({ world }) {
          const glass = world.root?.querySelector<HTMLElement>(".vehicle-span__glass");
          if (!glass) {
            throw new Error("Expected map glass");
          }
          glass.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "+" }));
          world.zoomBefore = readZoom(world.root);
          glass.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
        },
      },
      {
        pattern: /^Then the open map zooms and pans with the keyboard$/,
        run({ assert, world }) {
          assert.equal((world.zoomBefore ?? 1) > 1, true);
          assert.equal(readPan(world.root).x !== 0, true);
        },
      },
      {
        pattern: /^When two fingers pinch outward on the open map$/,
        run({ world }) {
          const glass = world.root?.querySelector<HTMLElement>(".vehicle-span__glass");
          if (!glass) {
            throw new Error("Expected map glass");
          }
          glass.dispatchEvent(pointerEvent("pointerdown", 150, 150, 1));
          glass.dispatchEvent(pointerEvent("pointerdown", 250, 150, 2));
          glass.dispatchEvent(pointerEvent("pointermove", 100, 150, 1));
          glass.dispatchEvent(pointerEvent("pointermove", 300, 150, 2));
          glass.dispatchEvent(pointerEvent("pointerup", 100, 150, 1));
          glass.dispatchEvent(pointerEvent("pointerup", 300, 150, 2));
        },
      },
      {
        pattern: /^When the user switches from the vehicle map to the walking route$/,
        run: async ({ world }) => {
          const button = world.root?.querySelector<HTMLButtonElement>("[data-map-switch='walk']");
          if (!button) {
            throw new Error("Expected switch to walk control");
          }
          button.click();
          world.pendingWalks.shift()?.resolve(WALK_ROUTE);
          await flush();
        },
      },
      {
        pattern: /^Then the walking route map replaces the vehicle map$/,
        run({ assert, world }) {
          assert.equal(world.root?.querySelector("[data-walk-map='true']") instanceof HTMLElement, true);
          assert.equal(world.root?.querySelector("[data-vehicle-map='true']"), null);
          assert.equal(world.source?.closed, true);
        },
      },
      {
        pattern: /^When the user switches from the walking route to the vehicle map$/,
        run({ world }) {
          const button = world.root?.querySelector<HTMLButtonElement>("[data-map-switch='vehicle']");
          if (!button) {
            throw new Error("Expected switch to vehicle control");
          }
          button.click();
        },
      },
      {
        pattern: /^Then the vehicle map replaces the walking route map$/,
        run({ assert, world }) {
          assert.equal(world.root?.querySelector("[data-vehicle-map='true']") instanceof HTMLElement, true);
          assert.equal(world.root?.querySelector("[data-walk-map='true']"), null);
        },
      },
      {
        pattern: /^When the user presses Escape$/,
        run({ world }) {
          world.documentRef?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
        },
      },
      {
        pattern: /^When the walking route map is opened and the user presses Escape$/,
        run: async ({ world }) => {
          await openWalkMap(world);
          world.documentRef?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
        },
      },
      {
        pattern: /^Then both map screens are closed and focus returns to the departure button$/,
        run({ assert, world }) {
          const openButton = departureRow(world).querySelector("button");
          assert.equal(world.root?.querySelector("[data-vehicle-map]"), null);
          assert.equal(world.root?.querySelector("[data-walk-map]"), null);
          assert.equal(world.documentRef?.activeElement, openButton);
        },
      },
      {
        pattern: /^When the user begins holding the departure card$/,
        run({ world }) {
          departureRow(world).dispatchEvent(pointerEvent("pointerdown", 10, 10));
        },
      },
      {
        pattern: /^Then the departure card shows active hold feedback$/,
        run({ assert, world }) {
          assert.equal(departureRow(world).dataset.holdActive, "true");
        },
      },
      {
        pattern: /^When the hold finishes while the walking route is loading$/,
        run({ world }) {
          world.fireHold?.();
          world.documentRef?.dispatchEvent(pointerEvent("pointerup", 10, 10));
        },
      },
      {
        pattern: /^Then the departure card shows walking route loading feedback$/,
        run({ assert, world }) {
          assert.equal(departureRow(world).dataset.holdActive, undefined);
          assert.equal(departureRow(world).dataset.walkLoading, "true");
        },
      },
      {
        pattern: /^When the pending walking route arrives$/,
        run: async ({ world }) => {
          world.pendingWalks.shift()?.resolve(WALK_ROUTE);
          await flush();
        },
      },
      {
        pattern: /^Then the departure card is marked active for the open map and no longer loading$/,
        run({ assert, world }) {
          assert.equal(departureRow(world).dataset.walkLoading, undefined);
          assert.equal(departureRow(world).dataset.mapActive, "true");
        },
      },
      {
        pattern: /^When the user closes the walking route map$/,
        run({ world }) {
          world.root?.querySelector<HTMLButtonElement>("[data-walk-close]")?.click();
        },
      },
      {
        pattern: /^Then the departure card is no longer marked active$/,
        run({ assert, world }) {
          assert.equal(departureRow(world).dataset.mapActive, undefined);
        },
      },
      {
        pattern: /^Then the vehicle map marks live tracking and initial placement does not glide$/,
        run({ assert, world }) {
          const glass = world.root?.querySelector<HTMLElement>("[data-vehicle-glass]");
          const marker = world.root?.querySelector<HTMLElement>("[data-vehicle-marker]");
          assert.equal(glass?.dataset.vehicleLive, "true");
          assert.equal(marker?.dataset.gliding, undefined);
        },
      },
      {
        pattern: /^When a live position update moves the vehicle$/,
        run({ world }) {
          world.source?.emit("position", JSON.stringify({ type: "position", vehicle: VEHICLE_NEXT }));
        },
      },
      {
        pattern: /^Then the vehicle marker enables smooth gliding to the new point$/,
        run({ assert, world }) {
          const marker = world.root?.querySelector<HTMLElement>("[data-vehicle-marker]");
          assert.equal(marker?.dataset.gliding, "true");
        },
      },
      {
        pattern: /^When the user taps the same active departure card again$/,
        run({ world }) {
          departureRow(world).dispatchEvent(new MouseEvent("click", { bubbles: true }));
        },
      },
      {
        pattern: /^Then both map screens are closed$/,
        run({ assert, world }) {
          assert.equal(world.root?.querySelector("[data-vehicle-map]"), null);
          assert.equal(world.root?.querySelector("[data-walk-map]"), null);
        },
      },
      {
        pattern: /^When the street tiles finish loading$/,
        run({ world }) {
          for (const tile of world.root?.querySelectorAll<HTMLImageElement>("[data-street-tile]") ?? []) {
            tile.dispatchEvent(new Event("load"));
          }
        },
      },
      {
        pattern: /^Then each street tile is marked loaded$/,
        run({ assert, world }) {
          const tiles = [...(world.root?.querySelectorAll<HTMLImageElement>("[data-street-tile]") ?? [])];
          assert.equal(tiles.length > 0, true);
          assert.equal(tiles.every((tile) => tile.dataset.tileLoaded === "true"), true);
        },
      },
      {
        pattern: /^When the user double clicks the fitted map then zooms out with control and wheel$/,
        run({ world }) {
          const glass = world.root?.querySelector<HTMLElement>(".vehicle-span__glass");
          const zoomOut = world.root?.querySelector<HTMLButtonElement>("[data-map-zoom-out]");
          if (!glass || !zoomOut) {
            throw new Error("Expected glass and zoom out control");
          }
          glass.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 220, clientY: 140 }));
          world.zoomBefore = readZoom(world.root);
          zoomOut.click();
          glass.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 0 }));
          for (let step = 0; step < 6; step += 1) {
            glass.dispatchEvent(
              new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: 200, clientY: 150, deltaY: 120 }),
            );
          }
        },
      },
      {
        pattern: /^Then the map returns cleanly to 1x zoom$/,
        run({ assert, world }) {
          assert.equal((world.zoomBefore ?? 1) > 1, true);
          assert.equal(readZoom(world.root), 1);
        },
      },
      {
        pattern: /^When the user navigates in all directions and resets with the keyboard$/,
        run({ world }) {
          const glass = world.root?.querySelector<HTMLElement>(".vehicle-span__glass");
          if (!glass) {
            throw new Error("Expected map glass");
          }
          for (const key of ["=", "+", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "-", "a", "0"]) {
            glass.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key }));
          }
        },
      },
      {
        pattern: /^When pointer interactions start on map controls or outside drag$/,
        run({ world }) {
          const glass = world.root?.querySelector<HTMLElement>(".vehicle-span__glass");
          const zoomIn = world.root?.querySelector<HTMLButtonElement>("[data-map-zoom-in]");
          if (!glass || !zoomIn) {
            throw new Error("Expected glass and zoom in button");
          }
          zoomIn.dispatchEvent(pointerEvent("pointerdown", 10, 10, 9));
          zoomIn.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 10, clientY: 10 }));
          glass.dispatchEvent(pointerEvent("pointermove", 50, 50, 77));
          glass.dispatchEvent(pointerEvent("pointerup", 50, 50, 77));
        },
      },
      {
        pattern: /^Then the open map ignores spurious drags and stays at 1x zoom$/,
        run({ assert, world }) {
          assert.equal(readZoom(world.root), 1);
          assert.equal(readPan(world.root).x, 0);
          assert.equal(readPan(world.root).y, 0);
        },
      },
    ],
  },
);
