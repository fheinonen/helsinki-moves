import { act } from "react";
import { useSyncExternalStore } from "react";
import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { bootstrapCreatePage } from "@client/create/bootstrap-create-page";
import { defaultSpec } from "@client/create/default-spec";
import type { UseGenerateBoardOptions, UseGenerateBoardResult } from "@client/create/use-generate-board";
import type { AlertsSuccessResponse } from "@shared/contracts/alerts-contract";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { RouteItinerary, RoutePlanRequest } from "@shared/contracts/routes-contract";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface HookState extends UseGenerateBoardResult {}

interface HookController {
  hook: (options: UseGenerateBoardOptions) => UseGenerateBoardResult;
}

interface World {
  fetchAlerts?: (input: { routeIds: string[]; stopIds: string[] }) => Promise<AlertsSuccessResponse>;
  fetchRoutes?: (input: RoutePlanRequest) => Promise<RouteItinerary[]>;
  controller?: HookController;
  pageHandle?: { destroy: () => void };
  root?: HTMLElement;
}

function createSuccessResponse(): DeparturesSuccessResponse {
  return {
    filterOptions: {
      destinations: [],
      lines: [],
    },
    mode: "TRAM",
    selectedStopId: "HSL:STOP_TRAM",
    station: {
      departures: [
        {
          departureIso: "2026-03-21T10:05:00.000Z",
          destination: "Lasipalatsi",
          line: "7",
        },
      ],
      distanceMeters: 25,
      stopCode: "H0401",
      stopCodes: ["H0401"],
      stopName: "Rautatientori",
      type: "stop",
    },
    stops: [],
  };
}

function createTriplaResponses(): DeparturesSuccessResponse[] {
  return [
    {
      filterOptions: {
        destinations: [],
        lines: [],
      },
      mode: "BUS",
      selectedStopId: "HSL:FAR",
      station: {
        departures: [
          {
            departureIso: "2026-03-21T10:01:00.000Z",
            destination: "Mall of Tripla",
            line: "600",
            stopCode: "H6000",
            stopName: "Pasila asema",
          },
        ],
        distanceMeters: 240,
        stopCode: "H6000",
        stopCodes: ["H6000"],
        stopName: "Pasila asema",
        type: "stop",
      },
      stops: [
        {
          code: "H6000",
          distanceMeters: 240,
          id: "HSL:FAR",
          memberStopIds: ["HSL:FAR"],
          name: "Pasila asema",
          stopCodes: ["H6000"],
        },
      ],
    },
    {
      filterOptions: {
        destinations: [],
        lines: [],
      },
      mode: "BUS",
      selectedStopId: "HSL:TRIPLA",
      station: {
        departures: [
          {
            departureIso: "2026-03-21T10:04:00.000Z",
            destination: "Mall of Tripla",
            line: "59",
            stopCode: "H0059",
            stopName: "Tripla",
          },
        ],
        distanceMeters: 40,
        stopCode: "H0059",
        stopCodes: ["H0059"],
        stopName: "Tripla",
        type: "stop",
      },
      stops: [
        {
          code: "H0059",
          distanceMeters: 40,
          id: "HSL:TRIPLA",
          memberStopIds: ["HSL:TRIPLA"],
          name: "Tripla",
          stopCodes: ["H0059"],
        },
      ],
    },
  ];
}

function createHookController(): HookController {
  const listeners = new Set<() => void>();
  let state: HookState = {
    appliedPrompt: null,
    generationError: null,
    isLoading: false,
    lastValidSpec: defaultSpec,
    renderablePartialSpec: null,
    stop() {},
    submit() {},
  };

  return {
    hook() {
      return useSyncExternalStore(
        (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        () => state
      );
    },
  };
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickButton(button: HTMLButtonElement | null | undefined): void {
  button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

async function bootstrapCanvasPage(world: World): Promise<void> {
  document.body.innerHTML = "<div id='create-root'></div>";
  const root = document.querySelector<HTMLElement>("#create-root");
  const controller = createHookController();
  if (!root) {
    throw new Error("Expected create root");
  }
  world.root = root;
  world.controller = controller;

  await act(async () => {
    world.pageHandle = await bootstrapCreatePage({
      fetchAlerts: world.fetchAlerts,
      documentRef: document,
      fetchDepartures: async () => createSuccessResponse(),
      fetchRoutes: world.fetchRoutes,
      loadGeneratedDepartures: async ({ onPartial }) => {
        const responses = createTriplaResponses();
        onPartial(responses);
        return {
          responses,
          routeContext: {
            fromCoords: { lat: 60.171, lon: 24.9414 },
            toCoords: { lat: 60.1989, lon: 24.9354 },
          },
          status: "ok",
        };
      },
      nowMs: () => Date.parse("2026-03-21T10:00:00.000Z"),
      root,
      useGenerateBoardHook: controller.hook,
    });
  });
}

async function destroyPageHandle(world: World): Promise<void> {
  await act(async () => {
    world.pageHandle?.destroy();
  });
}

defineFeature<World>(
  test,
  `
Feature: Create route intent canvas

  Scenario: A prompt result renders the deterministic route canvas
    Given the create route canvas shell is bootstrapped
    When the user enters a destination intent prompt
    And the user starts create route generation
    Then the primary route block is visible
    And the primary route block includes line 600
    And the route explanation is visible
    And the policy switch is visible

  Scenario: Editing the draft intent keeps the current canvas stable until submit
    Given the create route canvas shell is bootstrapped
    When the user enters a destination intent prompt
    And the user starts create route generation
    Then the primary route block is visible
    When the user edits the draft prompt to let's go to Kamppi
    Then the primary route block is still visible
    And the route explanation still mentions Mall of Tripla

  Scenario: Changing route policy recomputes the same canvas in place
    Given the create route canvas shell is bootstrapped
    When the user enters a destination intent prompt
    And the user starts create route generation
    Then the primary route block includes line 600
    When the user switches policy to least walking
    Then the primary route block includes line 59
    And the policy switch shows least walking as active

  Scenario: Route canvas prefers Digitransit routes over departure-only ranking
    Given Digitransit routes prefer line 7 to Mall of Tripla
    And the create route canvas shell is bootstrapped
    When the user enters a destination intent prompt
    And the user starts create route generation
    Then the primary route block includes line 7

  Scenario: Route canvas shows itinerary transfer summary from Digitransit routes
    Given Digitransit routes include a P to 59 transfer to Mall of Tripla
    And the create route canvas shell is bootstrapped
    When the user enters a destination intent prompt
    And the user starts create route generation
    Then the route canvas shows itinerary summary P to 59
    And the route canvas shows 1 transfer

  Scenario: Route canvas shows itinerary leg details from Digitransit routes
    Given Digitransit routes include a P to 59 transfer to Mall of Tripla
    And the create route canvas shell is bootstrapped
    When the user enters a destination intent prompt
    And the user starts create route generation
    Then the route canvas shows itinerary leg Helsinki to Pasila on P
    And the route canvas shows itinerary leg Pasila to Mall of Tripla on 59

  Scenario: Route canvas shows itinerary leg timing and interchange
    Given Digitransit routes include a P to 59 transfer to Mall of Tripla
    And the create route canvas shell is bootstrapped
    When the user enters a destination intent prompt
    And the user starts create route generation
    Then the route canvas shows itinerary time range 10:02 to 10:08
    And the route canvas shows itinerary time range 10:10 to 10:15
    And the route canvas shows transfer at Pasila

  Scenario: Fewest transfers policy changes the visible itinerary detail
    Given Digitransit routes include a faster transfer route and a slower direct route to Mall of Tripla
    And the create route canvas shell is bootstrapped
    When the user enters a destination intent prompt
    And the user starts create route generation
    Then the primary route block includes line P
    When the user switches policy to fewest transfers
    Then the primary route block includes line 7
    And the route canvas shows 0 transfers
    And the policy switch shows fewest transfers as active

  Scenario: No route still explains the nearest viable alternative
    Given Digitransit routes return no itineraries for Mall of Tripla
    And the create route canvas shell is bootstrapped
    When the user enters a destination intent prompt
    And the user starts create route generation
    Then the route canvas shows no route explanation
    And the route canvas points to nearest alternative stop Tripla

  Scenario: No route from service disruption explains the disruption cause
    Given Digitransit routes return no itineraries for Mall of Tripla
    And Digitransit alerts include no service at stop HSL:TRIPLA
    And the create route canvas shell is bootstrapped
    When the user enters a destination intent prompt
    And the user starts create route generation
    Then the route canvas shows disruption no-route explanation
    And the route canvas shows disruption recovery for Tripla
    And the route canvas shows disruption notice

  Scenario: No route for fewest transfers suggests trying fastest
    Given Digitransit routes only fail under fewest transfers for Mall of Tripla
    And the create route canvas shell is bootstrapped
    When the user enters a destination intent prompt
    And the user starts create route generation
    Then the primary route block includes line P
    When the user switches policy to fewest transfers
    Then the route canvas shows policy recovery
    And the route canvas points to nearest alternative stop Tripla

  Scenario: Route canvas shows alert-aware support from Digitransit alerts
    Given Digitransit routes prefer line 7 to Mall of Tripla
    And Digitransit alerts include a detour on route HSL:1007
    And the create route canvas shell is bootstrapped
    When the user enters a destination intent prompt
    And the user starts create route generation
    Then the route canvas shows alert Detour on line 7

  Scenario: Route canvas prefers an alert matched to the primary route
    Given Digitransit routes prefer line 7 to Mall of Tripla
    And Digitransit alerts include a stop alert and a route alert for HSL:1007
    And the create route canvas shell is bootstrapped
    When the user enters a destination intent prompt
    And the user starts create route generation
    Then the route canvas shows alert Detour on line 7
    And the route canvas does not show alert Stop H0072 elevator out of service

  Scenario: Route canvas rewrites stop moved alerts into product copy
    Given Digitransit routes prefer line 7 to Mall of Tripla
    And Digitransit alerts include a stop moved alert at Rautatientori
    And the create route canvas shell is bootstrapped
    When the user enters a destination intent prompt
    And the user starts create route generation
    Then the route canvas shows alert Stop moved near Rautatientori
    And the route canvas does not show alert Stop H0072 moved to a temporary platform

  Scenario: Route canvas rewrites no service alerts into stronger line copy
    Given Digitransit routes prefer line 7 to Mall of Tripla
    And Digitransit alerts include no service on route HSL:1007
    And the create route canvas shell is bootstrapped
    When the user enters a destination intent prompt
    And the user starts create route generation
    Then the route canvas shows alert Line 7 not running right now
    And the route canvas shows disruption notice
    And the route canvas does not show alert Line 7 service cancelled

  Scenario: Route canvas renders reduced service as an advisory service note
    Given Digitransit routes prefer line 7 to Mall of Tripla
    And Digitransit alerts include reduced service on route HSL:1007
    And the create route canvas shell is bootstrapped
    When the user enters a destination intent prompt
    And the user starts create route generation
    Then the route canvas shows service note Reduced service on line 7
    And the route canvas does not show degraded confidence note
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given Digitransit routes only fail under fewest transfers for Mall of Tripla$/,
        run: ({ world }) => {
          world.fetchRoutes = async (input) => {
            if (input.policy === "fewest_transfers") {
              return [];
            }
            return [
              {
                durationSeconds: 900,
                endTimeIso: "2026-03-21T10:15:00.000Z",
                id: "itinerary-transfer",
                legs: [
                  {
                    arrivalStopName: "Pasila",
                    departureStopName: "Helsinki",
                    endTimeIso: "2026-03-21T10:08:00.000Z",
                    headsign: "Airport",
                    line: "P",
                    mode: "RAIL",
                    startTimeIso: "2026-03-21T10:02:00.000Z",
                  },
                  {
                    arrivalStopName: "Mall of Tripla",
                    departureStopName: "Pasila",
                    endTimeIso: "2026-03-21T10:15:00.000Z",
                    headsign: "Mall of Tripla",
                    line: "59",
                    mode: "BUS",
                    startTimeIso: "2026-03-21T10:10:00.000Z",
                  },
                ],
                startTimeIso: "2026-03-21T10:02:00.000Z",
                transfers: 1,
                walkDistanceMeters: 120,
              },
            ];
          };
        },
      },
      {
        pattern: /^Given Digitransit routes return no itineraries for Mall of Tripla$/,
        run: ({ world }) => {
          world.fetchRoutes = async () => [];
        },
      },
      {
        pattern: /^Given Digitransit routes include a faster transfer route and a slower direct route to Mall of Tripla$/,
        run: ({ world }) => {
          world.fetchRoutes = async () => [
            {
              durationSeconds: 900,
              endTimeIso: "2026-03-21T10:15:00.000Z",
              id: "itinerary-transfer",
              legs: [
                {
                  arrivalStopName: "Pasila",
                  departureStopName: "Helsinki",
                  endTimeIso: "2026-03-21T10:08:00.000Z",
                  headsign: "Airport",
                  line: "P",
                  mode: "RAIL",
                  startTimeIso: "2026-03-21T10:02:00.000Z",
                },
                {
                  arrivalStopName: "Mall of Tripla",
                  departureStopName: "Pasila",
                  endTimeIso: "2026-03-21T10:15:00.000Z",
                  headsign: "Mall of Tripla",
                  line: "59",
                  mode: "BUS",
                  startTimeIso: "2026-03-21T10:10:00.000Z",
                },
              ],
              startTimeIso: "2026-03-21T10:02:00.000Z",
              transfers: 1,
              walkDistanceMeters: 120,
            },
            {
              durationSeconds: 1020,
              endTimeIso: "2026-03-21T10:17:00.000Z",
              id: "itinerary-direct",
              legs: [
                {
                  arrivalStopName: "Mall of Tripla",
                  departureStopName: "Rautatientori",
                  endTimeIso: "2026-03-21T10:17:00.000Z",
                  headsign: "Mall of Tripla",
                  line: "7",
                  mode: "TRAM",
                  startTimeIso: "2026-03-21T10:05:00.000Z",
                },
              ],
              startTimeIso: "2026-03-21T10:05:00.000Z",
              transfers: 0,
              walkDistanceMeters: 260,
            },
          ];
        },
      },
      {
        pattern: /^Given Digitransit routes prefer line 7 to Mall of Tripla$/,
        run: ({ world }) => {
          world.fetchRoutes = async () => [
            {
              durationSeconds: 360,
              endTimeIso: "2026-03-21T10:06:00.000Z",
              id: "itinerary-7",
              legs: [
                {
                  arrivalStopName: "Mall of Tripla",
                  departureStopName: "Rautatientori",
                  endTimeIso: "2026-03-21T10:06:00.000Z",
                  headsign: "Mall of Tripla",
                  line: "7",
                  mode: "TRAM",
                  routeId: "HSL:1007",
                  startTimeIso: "2026-03-21T10:00:00.000Z",
                },
              ],
              startTimeIso: "2026-03-21T10:00:00.000Z",
              transfers: 0,
              walkDistanceMeters: 90,
            },
          ];
        },
      },
      {
        pattern: /^Given Digitransit alerts include a detour on route HSL:1007$/,
        run: ({ world }) => {
          world.fetchAlerts = async () => ({
            alerts: [
              {
                cause: "CONSTRUCTION",
                descriptionText: "Line 7 runs on a detour.",
                effect: "DETOUR",
                effectiveEndDate: 1774215000,
                effectiveStartDate: 1773401400,
                entities: [{ routeId: "HSL:1007", routeShortName: "7", type: "route" }],
                headerText: "Line 7 runs on a detour",
                id: "alert-7",
                severityLevel: "INFO",
              },
            ],
          });
        },
      },
      {
        pattern: /^Given Digitransit alerts include a stop alert and a route alert for HSL:1007$/,
        run: ({ world }) => {
          world.fetchAlerts = async () => ({
            alerts: [
              {
                cause: "OTHER_CAUSE",
                descriptionText: "Stop H0072 elevator is out of service.",
                effect: "OTHER_EFFECT",
                effectiveEndDate: 1774215000,
                effectiveStartDate: 1773401400,
                entities: [{ stopCode: "H0072", stopId: "HSL:STOP_7", stopName: "Rautatientori", type: "stop" }],
                headerText: "Stop H0072 elevator out of service",
                id: "alert-stop-7",
                severityLevel: "INFO",
              },
              {
                cause: "CONSTRUCTION",
                descriptionText: "Line 7 runs on a detour.",
                effect: "DETOUR",
                effectiveEndDate: 1774215000,
                effectiveStartDate: 1773401400,
                entities: [{ routeId: "HSL:1007", routeShortName: "7", type: "route" }],
                headerText: "Line 7 runs on a detour",
                id: "alert-route-7",
                severityLevel: "INFO",
              },
            ],
          });
        },
      },
      {
        pattern: /^Given Digitransit alerts include a stop moved alert at Rautatientori$/,
        run: ({ world }) => {
          world.fetchAlerts = async () => ({
            alerts: [
              {
                cause: "OTHER_CAUSE",
                descriptionText: "Stop H0072 moved to a temporary platform.",
                effect: "STOP_MOVED",
                effectiveEndDate: 1774215000,
                effectiveStartDate: 1773401400,
                entities: [{ stopCode: "H0072", stopId: "HSL:STOP_7", stopName: "Rautatientori", type: "stop" }],
                headerText: "Stop H0072 moved to a temporary platform",
                id: "alert-stop-moved-7",
                severityLevel: "INFO",
              },
            ],
          });
        },
      },
      {
        pattern: /^Given Digitransit alerts include no service on route HSL:1007$/,
        run: ({ world }) => {
          world.fetchAlerts = async () => ({
            alerts: [
              {
                cause: "OTHER_CAUSE",
                descriptionText: "Line 7 service cancelled.",
                effect: "NO_SERVICE",
                effectiveEndDate: 1774215000,
                effectiveStartDate: 1773401400,
                entities: [{ routeId: "HSL:1007", routeShortName: "7", type: "route" }],
                headerText: "Line 7 service cancelled",
                id: "alert-no-service-7",
                severityLevel: "SEVERE",
              },
            ],
          });
        },
      },
      {
        pattern: /^Given Digitransit alerts include reduced service on route HSL:1007$/,
        run: ({ world }) => {
          world.fetchAlerts = async () => ({
            alerts: [
              {
                cause: "OTHER_CAUSE",
                descriptionText: "Line 7 runs less often right now.",
                effect: "REDUCED_SERVICE",
                effectiveEndDate: 1774215000,
                effectiveStartDate: 1773401400,
                entities: [{ routeId: "HSL:1007", routeShortName: "7", type: "route" }],
                headerText: "Line 7 reduced service",
                id: "alert-reduced-service-7",
                severityLevel: "WARNING",
              },
            ],
          });
        },
      },
      {
        pattern: /^(Given|And) Digitransit alerts include no service at stop HSL:TRIPLA$/,
        run: ({ world }) => {
          world.fetchAlerts = async () => ({
            alerts: [
              {
                cause: "OTHER_CAUSE",
                descriptionText: "Tripla stop has no service right now.",
                effect: "NO_SERVICE",
                effectiveEndDate: 1774215000,
                effectiveStartDate: 1773401400,
                entities: [{ stopCode: "H0059", stopId: "HSL:TRIPLA", stopName: "Tripla", type: "stop" }],
                headerText: "Tripla stop service cancelled",
                id: "alert-no-service-tripla",
                severityLevel: "SEVERE",
              },
            ],
          });
        },
      },
      {
        pattern: /^Given Digitransit routes include a P to 59 transfer to Mall of Tripla$/,
        run: ({ world }) => {
          world.fetchRoutes = async () => [
            {
              durationSeconds: 900,
              endTimeIso: "2026-03-21T10:15:00.000Z",
              id: "itinerary-transfer",
              legs: [
                {
                  arrivalStopName: "Pasila",
                  departureStopName: "Helsinki",
                  endTimeIso: "2026-03-21T10:08:00.000Z",
                  headsign: "Airport",
                  line: "P",
                  mode: "RAIL",
                  routeId: "HSL:3001P",
                  startTimeIso: "2026-03-21T10:02:00.000Z",
                },
                {
                  arrivalStopName: "Mall of Tripla",
                  departureStopName: "Pasila",
                  endTimeIso: "2026-03-21T10:15:00.000Z",
                  headsign: "Mall of Tripla",
                  line: "59",
                  mode: "BUS",
                  routeId: "HSL:2059",
                  startTimeIso: "2026-03-21T10:10:00.000Z",
                },
              ],
              startTimeIso: "2026-03-21T10:02:00.000Z",
              transfers: 1,
              walkDistanceMeters: 120,
            },
          ];
        },
      },
      {
        pattern: /^Given the create route canvas shell is bootstrapped$/,
        run: async ({ world }) => {
          window.localStorage.clear();
          await bootstrapCanvasPage(world);
        },
      },
      {
        pattern: /^When the user enters a destination intent prompt$/,
        run: async ({ world }) => {
          const prompt = world.root?.querySelector<HTMLInputElement>('[data-testid="create-prompt"]');
          if (!prompt) {
            throw new Error("Expected prompt input");
          }
          await act(async () => {
            setInputValue(prompt, "let's go to Mall of Tripla");
          });
        },
      },
      {
        pattern: /^(When|And) the user starts create route generation$/,
        run: async ({ world }) => {
          const button = world.root?.querySelector<HTMLButtonElement>('[data-testid="create-generate"]');
          await act(async () => {
            clickButton(button);
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
          });
        },
      },
      {
        pattern: /^When the user edits the draft prompt to let's go to Kamppi$/,
        run: async ({ world }) => {
          const prompt = world.root?.querySelector<HTMLInputElement>('[data-testid="create-prompt"]');
          if (!prompt) {
            throw new Error("Expected prompt input");
          }
          await act(async () => {
            setInputValue(prompt, "let's go to Kamppi");
          });
        },
      },
      {
        pattern: /^When the user switches policy to least walking$/,
        run: async ({ world }) => {
          const button = world.root?.querySelector<HTMLButtonElement>(
            '[data-testid="create-policy-least-walking"]'
          );
          await act(async () => {
            clickButton(button);
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
          });
        },
      },
      {
        pattern: /^When the user switches policy to fewest transfers$/,
        run: async ({ world }) => {
          const button = world.root?.querySelector<HTMLButtonElement>(
            '[data-testid="create-policy-fewest-transfers"]'
          );
          await act(async () => {
            clickButton(button);
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
          });
        },
      },
      {
        pattern: /^Then the primary route block is visible$/,
        run: ({ assert, world }) => {
          assert.equal(
            Boolean(world.root?.querySelector('[data-testid="create-route-block-primary"]')),
            true
          );
        },
      },
      {
        pattern: /^Then the primary route block is still visible$/,
        run: ({ assert, world }) => {
          assert.equal(
            Boolean(world.root?.querySelector('[data-testid="create-route-block-primary"]')),
            true
          );
        },
      },
      {
        pattern: /^(Then|And) the primary route block includes line 600$/,
        run: ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("600"), true);
        },
      },
      {
        pattern: /^(Then|And) the primary route block includes line 59$/,
        run: ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("59"), true);
        },
      },
      {
        pattern: /^(Then|And) the primary route block includes line 7$/,
        run: ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("7"), true);
        },
      },
      {
        pattern: /^(Then|And) the primary route block includes line P$/,
        run: ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("P"), true);
        },
      },
      {
        pattern: /^(Then|And) the route explanation is visible$/,
        run: ({ assert, world }) => {
          assert.equal(
            Boolean(world.root?.querySelector('[data-testid="create-route-explanation"]')),
            true
          );
        },
      },
      {
        pattern: /^(Then|And) the route canvas shows no route explanation$/,
        run: ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("No full route available right now"), true);
        },
      },
      {
        pattern: /^(Then|And) the route canvas shows disruption no-route explanation$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.root?.textContent?.includes("No full route available because of current service disruption"),
            true
          );
        },
      },
      {
        pattern: /^(Then|And) the route canvas shows disruption recovery for Tripla$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.root?.textContent?.includes("Nearest alternative stop: Tripla"),
            true
          );
        },
      },
      {
        pattern: /^(Then|And) the route canvas points to nearest alternative stop Tripla$/,
        run: ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("Tripla"), true);
        },
      },
      {
        pattern: /^(Then|And) the route canvas suggests trying fastest instead$/,
        run: ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("Try fastest instead"), true);
        },
      },
      {
        pattern: /^(Then|And) the route canvas shows policy recovery$/,
        run: ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("Try fastest instead"), true);
        },
      },
      {
        pattern: /^(Then|And) the route canvas shows alert Detour on line 7$/,
        run: async ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("Detour on line 7"), true);
          await destroyPageHandle(world);
        },
      },
      {
        pattern: /^(Then|And) the route canvas does not show alert Stop H0072 elevator out of service$/,
        run: async ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("Stop H0072 elevator out of service"), false);
          await destroyPageHandle(world);
        },
      },
      {
        pattern: /^(Then|And) the route canvas shows alert Stop moved near Rautatientori$/,
        run: ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("Stop moved near Rautatientori"), true);
        },
      },
      {
        pattern: /^(Then|And) the route canvas does not show alert Stop H0072 moved to a temporary platform$/,
        run: async ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("Stop H0072 moved to a temporary platform"), false);
          await destroyPageHandle(world);
        },
      },
      {
        pattern: /^(Then|And) the route canvas shows alert Line 7 not running right now$/,
        run: ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("Line 7 not running right now"), true);
        },
      },
      {
        pattern: /^(Then|And) the route canvas shows service note Reduced service on line 7$/,
        run: ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("Service note: Reduced service on line 7"), true);
        },
      },
      {
        pattern: /^(Then|And) the route canvas shows degraded confidence note$/,
        run: ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("Live disruption may affect this route"), true);
        },
      },
      {
        pattern: /^(Then|And) the route canvas shows disruption notice$/,
        run: ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("Service disruption affects this route"), true);
        },
      },
      {
        pattern: /^(Then|And) the route canvas does not show degraded confidence note$/,
        run: async ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("Live disruption may affect this route"), false);
          await destroyPageHandle(world);
        },
      },
      {
        pattern: /^(Then|And) the route canvas does not show alert Line 7 service cancelled$/,
        run: async ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("Line 7 service cancelled"), false);
          await destroyPageHandle(world);
        },
      },
      {
        pattern: /^(Then|And) the route canvas shows itinerary summary P to 59$/,
        run: ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("P to 59"), true);
        },
      },
      {
        pattern: /^(Then|And) the route canvas shows 1 transfer$/,
        run: async ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("1 transfer"), true);
          await destroyPageHandle(world);
        },
      },
      {
        pattern: /^(Then|And) the route canvas shows 0 transfers$/,
        run: ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("0 transfers"), true);
        },
      },
      {
        pattern: /^(Then|And) the route canvas shows itinerary leg Helsinki to Pasila on P$/,
        run: ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("Helsinki"), true);
          assert.equal(world.root?.textContent?.includes("Pasila"), true);
          assert.equal(world.root?.textContent?.includes("P"), true);
        },
      },
      {
        pattern: /^(Then|And) the route canvas shows itinerary leg Pasila to Mall of Tripla on 59$/,
        run: async ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("Mall of Tripla"), true);
          assert.equal(world.root?.textContent?.includes("59"), true);
          await destroyPageHandle(world);
        },
      },
      {
        pattern: /^(Then|And) the route canvas shows itinerary time range 10:02 to 10:08$/,
        run: ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("10:02 to 10:08"), true);
        },
      },
      {
        pattern: /^(Then|And) the route canvas shows itinerary time range 10:10 to 10:15$/,
        run: ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("10:10 to 10:15"), true);
        },
      },
      {
        pattern: /^(Then|And) the route canvas shows transfer at Pasila$/,
        run: async ({ assert, world }) => {
          assert.equal(world.root?.textContent?.includes("Transfer at Pasila"), true);
          await destroyPageHandle(world);
        },
      },
      {
        pattern: /^(Then|And) the route explanation still mentions Mall of Tripla$/,
        run: async ({ assert, world }) => {
          const explanation = world.root?.querySelector('[data-testid="create-route-explanation"]');
          assert.equal(explanation?.textContent?.includes("Mall of Tripla"), true);
          await destroyPageHandle(world);
        },
      },
      {
        pattern: /^(Then|And) the policy switch is visible$/,
        run: async ({ assert, world }) => {
          assert.equal(
            Boolean(world.root?.querySelector('[data-testid="create-policy-switch"]')),
            true
          );
          await destroyPageHandle(world);
        },
      },
      {
        pattern: /^(Then|And) the policy switch shows least walking as active$/,
        run: async ({ assert, world }) => {
          const button = world.root?.querySelector<HTMLButtonElement>(
            '[data-testid="create-policy-least-walking"]'
          );
          assert.equal(button?.getAttribute("aria-pressed"), "true");
          await destroyPageHandle(world);
        },
      },
      {
        pattern: /^(Then|And) the policy switch shows fewest transfers as active$/,
        run: async ({ assert, world }) => {
          const button = world.root?.querySelector<HTMLButtonElement>(
            '[data-testid="create-policy-fewest-transfers"]'
          );
          assert.equal(button?.getAttribute("aria-pressed"), "true");
          await destroyPageHandle(world);
        },
      },
    ],
  }
);
