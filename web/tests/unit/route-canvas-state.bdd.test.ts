import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  createRouteCanvasDataState,
  createRouteCanvasEmptyState,
  resolveRouteCanvasDataState,
} from "@client/create/route-canvas-state";
import type { AlertsSuccessResponse } from "@shared/contracts/alerts-contract";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { RouteItinerary } from "@shared/contracts/routes-contract";

interface World {
  alerts?: AlertsSuccessResponse["alerts"];
  fetchAlertsCalls?: Array<{ routeIds: string[]; stopIds: string[] }>;
  fetchRoutesCalls?: Array<string>;
  itineraries?: RouteItinerary[] | null;
  responses?: DeparturesSuccessResponse[];
  result?: Awaited<ReturnType<typeof resolveRouteCanvasDataState>> | ReturnType<typeof createRouteCanvasDataState>;
  routeContext?: { fromCoords: { lat: number; lon: number }; toCoords: { lat: number; lon: number } } | null;
}

function createTriplaResponses(): DeparturesSuccessResponse[] {
  return [
    {
      filterOptions: { destinations: [], lines: [] },
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

function createPlannedItinerary(): RouteItinerary[] {
  return [
    {
      durationSeconds: 900,
      endTimeIso: "2026-03-21T10:15:00.000Z",
      id: "itinerary-7",
      legs: [
        {
          arrivalPlatform: null,
          arrivalStopName: "Mall of Tripla",
          departurePlatform: null,
          departureStopName: "Rautatientori",
          endTimeIso: "2026-03-21T10:15:00.000Z",
          headsign: "Mall of Tripla",
          line: "7",
          mode: "TRAM",
          routeId: "HSL:1007",
          startTimeIso: "2026-03-21T10:02:00.000Z",
        },
      ],
      startTimeIso: "2026-03-21T10:02:00.000Z",
      transfers: 0,
      walkDistanceMeters: 90,
    },
  ];
}

defineFeature<World>(
  test,
  `
Feature: Route canvas state controller

  Scenario: Empty route canvas state starts blank
    When the empty route canvas state is created
    Then the route canvas state has no responses
    And the route canvas state has no itineraries
    And the route canvas state has no alerts
    And the route canvas state has no route canvas

  Scenario: Route canvas state builds from departures only
    Given Tripla departure responses
    When the route canvas state is created for fastest policy
    Then the route canvas state has 1 response
    And the route canvas primary line is 59

  Scenario: Route canvas state resolves routes and alerts from route context
    Given Tripla departure responses
    And a Tripla route context
    And Digitransit route planning returns line 7
    And Digitransit alerts return a detour on line 7
    When the route canvas state is resolved for fastest policy
    Then route planning was requested once
    And alert lookup was requested with route HSL:1007 and stop HSL:TRIPLA
    And the route canvas primary line is 7

  Scenario: Route canvas state skips planning without route context
    Given Tripla departure responses
    When the route canvas state is resolved without route context
    Then route planning was not requested
    And alert lookup was not requested
    And the route canvas primary line is 59

  Scenario: Route canvas state recomputes policy-restricted no-route from existing data
    Given Tripla departure responses
    And no planned itineraries
    When the route canvas state is created for fewest transfers policy
    Then the route canvas state is no_route
    And the no-route reason is policy_restricted
  `,
  {
    createWorld: () => ({
      fetchAlertsCalls: [],
      fetchRoutesCalls: [],
    }),
    stepDefinitions: [
      {
        pattern: /^Given Tripla departure responses$/,
        run: ({ world }) => {
          world.responses = createTriplaResponses();
        },
      },
      {
        pattern: /^(Given|And) a Tripla route context$/,
        run: ({ world }) => {
          world.routeContext = {
            fromCoords: { lat: 60.171, lon: 24.9414 },
            toCoords: { lat: 60.1989, lon: 24.9354 },
          };
        },
      },
      {
        pattern: /^(Given|And) Digitransit route planning returns line 7$/,
        run: ({ world }) => {
          world.itineraries = createPlannedItinerary();
        },
      },
      {
        pattern: /^(Given|And) Digitransit alerts return a detour on line 7$/,
        run: ({ world }) => {
          world.alerts = [
            {
              cause: "CONSTRUCTION",
              descriptionText: "Line 7 runs on a detour.",
              effect: "DETOUR",
              effectiveEndDate: 1774215000,
              effectiveStartDate: 1773401400,
              entities: [{ routeId: "HSL:1007", routeShortName: "7", type: "route" }],
              headerText: "Line 7 runs on a detour",
              id: "detour-7",
              severityLevel: "INFO",
            },
          ];
        },
      },
      {
        pattern: /^(Given|And) no planned itineraries$/,
        run: ({ world }) => {
          world.itineraries = [];
        },
      },
      {
        pattern: /^When the empty route canvas state is created$/,
        run: ({ world }) => {
          world.result = createRouteCanvasEmptyState();
        },
      },
      {
        pattern: /^When the route canvas state is created for fastest policy$/,
        run: ({ world }) => {
          if (!world.responses) {
            throw new Error("Expected responses");
          }
          world.result = createRouteCanvasDataState({
            alerts: [],
            itineraries: null,
            nowMs: Date.parse("2026-03-21T10:00:00.000Z"),
            policy: "fastest",
            responses: world.responses,
            title: "let's go to Mall of Tripla",
          });
        },
      },
      {
        pattern: /^When the route canvas state is created for fewest transfers policy$/,
        run: ({ world }) => {
          if (!world.responses || !world.itineraries) {
            throw new Error("Expected responses and itineraries");
          }
          world.result = createRouteCanvasDataState({
            alerts: [],
            itineraries: world.itineraries,
            nowMs: Date.parse("2026-03-21T10:00:00.000Z"),
            policy: "fewest_transfers",
            responses: world.responses,
            title: "let's go to Mall of Tripla",
          });
        },
      },
      {
        pattern: /^When the route canvas state is resolved for fastest policy$/,
        run: async ({ world }) => {
          if (!world.responses || !world.routeContext) {
            throw new Error("Expected responses and route context");
          }
          world.result = await resolveRouteCanvasDataState({
            fetchAlerts: async (input) => {
              world.fetchAlertsCalls?.push(input);
              return { alerts: world.alerts || [] };
            },
            fetchRoutes: async (input) => {
              world.fetchRoutesCalls?.push(`${input.fromLat}:${input.toLat}:${input.policy}`);
              return world.itineraries || [];
            },
            nowMs: Date.parse("2026-03-21T10:00:00.000Z"),
            policy: "fastest",
            responses: world.responses,
            routeContext: world.routeContext,
            title: "let's go to Mall of Tripla",
          });
        },
      },
      {
        pattern: /^When the route canvas state is resolved without route context$/,
        run: async ({ world }) => {
          if (!world.responses) {
            throw new Error("Expected responses");
          }
          world.result = await resolveRouteCanvasDataState({
            fetchAlerts: async (input) => {
              world.fetchAlertsCalls?.push(input);
              return { alerts: world.alerts || [] };
            },
            fetchRoutes: async (input) => {
              world.fetchRoutesCalls?.push(`${input.fromLat}:${input.toLat}:${input.policy}`);
              return world.itineraries || [];
            },
            nowMs: Date.parse("2026-03-21T10:00:00.000Z"),
            policy: "fastest",
            responses: world.responses,
            routeContext: null,
            title: "let's go to Mall of Tripla",
          });
        },
      },
      {
        pattern: /^Then the route canvas state has no responses$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.responses.length, 0);
        },
      },
      {
        pattern: /^(Then|And) the route canvas state has no itineraries$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.itineraries, null);
        },
      },
      {
        pattern: /^(Then|And) the route canvas state has no alerts$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.alerts.length, 0);
        },
      },
      {
        pattern: /^(Then|And) the route canvas state has no route canvas$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.routeCanvas, null);
        },
      },
      {
        pattern: /^Then the route canvas state has 1 response$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.responses.length, 1);
        },
      },
      {
        pattern: /^(Then|And) route planning was requested once$/,
        run: ({ assert, world }) => {
          assert.equal(world.fetchRoutesCalls?.length, 1);
        },
      },
      {
        pattern: /^(Then|And) alert lookup was requested with route HSL:1007 and stop HSL:TRIPLA$/,
        run: ({ assert, world }) => {
          assert.equal(JSON.stringify(world.fetchAlertsCalls?.[0]), JSON.stringify({
            routeIds: ["HSL:1007"],
            stopIds: ["HSL:TRIPLA"],
          }));
        },
      },
      {
        pattern: /^(Then|And) route planning was not requested$/,
        run: ({ assert, world }) => {
          assert.equal(world.fetchRoutesCalls?.length, 0);
        },
      },
      {
        pattern: /^(Then|And) alert lookup was not requested$/,
        run: ({ assert, world }) => {
          assert.equal(world.fetchAlertsCalls?.length, 0);
        },
      },
      {
        pattern: /^(Then|And) the route canvas primary line is 59$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.result?.routeCanvas && world.result.routeCanvas.state === "ready"
              ? world.result.routeCanvas.primary.line
              : null,
            "59"
          );
        },
      },
      {
        pattern: /^(Then|And) the route canvas primary line is 7$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.result?.routeCanvas && world.result.routeCanvas.state === "ready"
              ? world.result.routeCanvas.primary.line
              : null,
            "7"
          );
        },
      },
      {
        pattern: /^Then the route canvas state is no_route$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.routeCanvas?.state, "no_route");
        },
      },
      {
        pattern: /^(Then|And) the no-route reason is policy_restricted$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.result?.routeCanvas && world.result.routeCanvas.state === "no_route"
              ? world.result.routeCanvas.reason
              : null,
            "policy_restricted"
          );
        },
      },
    ],
  }
);
