import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  assembleDestinationRouteCanvas,
  assembleHomeRouteCanvas,
  assemblePlannedRouteCanvas,
  type RouteCanvasViewModel,
} from "@client/create/route-canvas-assembler";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { RouteItinerary } from "@shared/contracts/routes-contract";

interface World {
  alerts?: Array<{
    cause: string | null;
    descriptionText: string;
    effect: string | null;
    effectiveEndDate: number | null;
    effectiveStartDate: number | null;
    entities: Array<{
      routeId?: string | null;
      routeShortName?: string | null;
      stopCode?: string | null;
      stopId?: string | null;
      stopName?: string | null;
      type: "route" | "stop";
    }>;
    headerText: string | null;
    id: string;
    severityLevel: string | null;
  }>;
  fastestResult?: RouteCanvasViewModel;
  fewestTransfersResult?: RouteCanvasViewModel;
  itineraries?: RouteItinerary[];
  leastWalkingResult?: RouteCanvasViewModel;
  responses?: DeparturesSuccessResponse[];
  result?: RouteCanvasViewModel;
}

function createResponse(input: {
  departures: Array<{ departureIso: string; destination: string; line: string }>;
  distanceMeters: number;
  stopCode: string;
  stopId: string;
  stopName: string;
}): DeparturesSuccessResponse {
  return {
    filterOptions: {
      destinations: [],
      lines: [],
    },
    mode: "BUS",
    selectedStopId: input.stopId,
    station: {
      departures: input.departures,
      distanceMeters: input.distanceMeters,
      stopCode: input.stopCode,
      stopCodes: [input.stopCode],
      stopName: input.stopName,
      type: "stop",
    },
    stops: [
      {
        code: input.stopCode,
        distanceMeters: input.distanceMeters,
        id: input.stopId,
        memberStopIds: [input.stopId],
        name: input.stopName,
        stopCodes: [input.stopCode],
      },
    ],
  };
}

defineFeature<World>(
  test,
  `
Feature: Route canvas assembly

  Scenario: Home canvas builds a primary and backup recommendation
    Given route responses for Home with two visible departures
    When the Home route canvas is assembled with fastest policy
    Then the primary route is line 550 to Home in 2 minutes
    And the backup route is line 510 to Home in 5 minutes

  Scenario: Destination canvas can prefer the least walking option
    Given route responses for Mall of Tripla with a faster farther stop and a slower closer stop
    When the destination route canvas is assembled with least_walking policy
    Then the primary route is line 59 to Mall of Tripla in 4 minutes
    And the primary route walking distance is 40 meters

  Scenario: No route keeps viable alternatives inside the canvas shell
    Given route responses with no visible departures but nearby stops
    When the destination route canvas is assembled with fastest policy
    Then the canvas state is no_route
    And the first viable alternative stop is Kamppi

  Scenario: No route with disruptive alerts is marked as service disruption
    Given route responses with no visible departures but nearby stops
    And disruptive route alerts for the no-route canvas
    When the destination route canvas is assembled with fastest policy
    Then the no-route reason is service_disruption

  Scenario: Missing disruption confidence marks the canvas degraded
    Given route responses for Home with two visible departures
    When the Home route canvas is assembled without disruption confidence
    Then the canvas is marked degraded

  Scenario: Policy changes alter the chosen primary route
    Given route responses for Mall of Tripla with a faster farther stop and a slower closer stop
    When the destination route canvas is assembled with fastest and least_walking policies
    Then the fastest primary route is line 600
    And the least walking primary route is line 59

  Scenario: Planned route preserves itinerary transfer summary
    Given Digitransit itineraries include a train and bus transfer to Mall of Tripla
    When the planned destination route canvas is assembled with fastest policy
    Then the primary route itinerary summary is P to 59
    And the primary route transfer count is 1

  Scenario: Planned route preserves itinerary leg timing and interchange stop
    Given Digitransit itineraries include a train and bus transfer to Mall of Tripla
    When the planned destination route canvas is assembled with fastest policy
    Then the first itinerary leg time range is 10:02 to 10:08
    And the second itinerary leg time range is 10:10 to 10:15
    And the itinerary interchange stop is Pasila

  Scenario: Fewest transfers can prefer a direct route over a faster transfer
    Given Digitransit itineraries include a faster transfer route and a slower direct route to Mall of Tripla
    When the planned destination route canvas is assembled with fastest and fewest_transfers policies
    Then the fastest planned primary route is line P
    And the fewest transfers primary route is line 7
    And the fewest transfers route has 0 transfers
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given Digitransit itineraries include a faster transfer route and a slower direct route to Mall of Tripla$/,
        run: ({ world }) => {
          world.itineraries = [
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
        pattern: /^Given Digitransit itineraries include a train and bus transfer to Mall of Tripla$/,
        run: ({ world }) => {
          world.itineraries = [
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
        },
      },
      {
        pattern: /^Given route responses for Home with two visible departures$/,
        run: ({ world }) => {
          world.responses = [
            createResponse({
              departures: [
                {
                  departureIso: "2026-03-21T10:02:00.000Z",
                  destination: "Home",
                  line: "550",
                },
                {
                  departureIso: "2026-03-21T10:05:00.000Z",
                  destination: "Home",
                  line: "510",
                },
              ],
              distanceMeters: 80,
              stopCode: "H1234",
              stopId: "HSL:HOME_A",
              stopName: "Kamppi",
            }),
          ];
        },
      },
      {
        pattern: /^Given route responses for Mall of Tripla with a faster farther stop and a slower closer stop$/,
        run: ({ world }) => {
          world.responses = [
            createResponse({
              departures: [
                {
                  departureIso: "2026-03-21T10:01:00.000Z",
                  destination: "Mall of Tripla",
                  line: "600",
                },
              ],
              distanceMeters: 240,
              stopCode: "H6000",
              stopId: "HSL:FAR",
              stopName: "Pasila asema",
            }),
            createResponse({
              departures: [
                {
                  departureIso: "2026-03-21T10:04:00.000Z",
                  destination: "Mall of Tripla",
                  line: "59",
                },
              ],
              distanceMeters: 40,
              stopCode: "H0059",
              stopId: "HSL:CLOSE",
              stopName: "Tripla",
            }),
          ];
        },
      },
      {
        pattern: /^Given route responses with no visible departures but nearby stops$/,
        run: ({ world }) => {
          world.responses = [
            {
              filterOptions: {
                destinations: [],
                lines: [],
              },
              mode: "BUS",
              selectedStopId: "HSL:STOP_A",
              station: {
                departures: [],
                distanceMeters: 30,
                stopCode: "H0001",
                stopCodes: ["H0001"],
                stopName: "Kamppi",
                type: "stop",
              },
              stops: [
                {
                  code: "H0001",
                  distanceMeters: 30,
                  id: "HSL:STOP_A",
                  memberStopIds: ["HSL:STOP_A"],
                  name: "Kamppi",
                  stopCodes: ["H0001"],
                },
                {
                  code: "H0002",
                  distanceMeters: 90,
                  id: "HSL:STOP_B",
                  memberStopIds: ["HSL:STOP_B"],
                  name: "Ruoholahti",
                  stopCodes: ["H0002"],
                },
              ],
            },
          ];
        },
      },
      {
        pattern: /^(Given|And) disruptive route alerts for the no-route canvas$/,
        run: ({ world }) => {
          world.alerts = [
            {
              cause: "OTHER_CAUSE",
              descriptionText: "All service at Kamppi is cancelled.",
              effect: "NO_SERVICE",
              effectiveEndDate: 1774215000,
              effectiveStartDate: 1773401400,
              entities: [{ stopCode: "H0001", stopId: "HSL:STOP_A", stopName: "Kamppi", type: "stop" }],
              headerText: "Kamppi stop service cancelled",
              id: "alert-no-service-stop",
              severityLevel: "SEVERE",
            },
          ];
        },
      },
      {
        pattern: /^When the planned destination route canvas is assembled with fastest policy$/,
        run: ({ world }) => {
          if (!world.itineraries) {
            throw new Error("Expected itineraries");
          }
          world.result = assemblePlannedRouteCanvas({
            canvasType: "destination_route",
            itineraries: world.itineraries,
            nowMs: Date.parse("2026-03-21T10:00:00.000Z"),
            policy: "fastest",
            title: "Mall of Tripla",
          });
        },
      },
      {
        pattern: /^When the planned destination route canvas is assembled with fastest and fewest_transfers policies$/,
        run: ({ world }) => {
          if (!world.itineraries) {
            throw new Error("Expected itineraries");
          }
          world.fastestResult = assemblePlannedRouteCanvas({
            canvasType: "destination_route",
            itineraries: world.itineraries,
            nowMs: Date.parse("2026-03-21T10:00:00.000Z"),
            policy: "fastest",
            title: "Mall of Tripla",
          });
          world.fewestTransfersResult = assemblePlannedRouteCanvas({
            canvasType: "destination_route",
            itineraries: world.itineraries,
            nowMs: Date.parse("2026-03-21T10:00:00.000Z"),
            policy: "fewest_transfers",
            title: "Mall of Tripla",
          });
        },
      },
      {
        pattern: /^When the Home route canvas is assembled with fastest policy$/,
        run: ({ world }) => {
          if (!world.responses) {
            throw new Error("Expected responses");
          }
          world.result = assembleHomeRouteCanvas({
            nowMs: Date.parse("2026-03-21T10:00:00.000Z"),
            policy: "fastest",
            responses: world.responses,
          });
        },
      },
      {
        pattern: /^When the destination route canvas is assembled with least_walking policy$/,
        run: ({ world }) => {
          if (!world.responses) {
            throw new Error("Expected responses");
          }
          world.result = assembleDestinationRouteCanvas({
            nowMs: Date.parse("2026-03-21T10:00:00.000Z"),
            policy: "least_walking",
            responses: world.responses,
            title: "Mall of Tripla",
          });
        },
      },
      {
        pattern: /^When the destination route canvas is assembled with fastest policy$/,
        run: ({ world }) => {
          if (!world.responses) {
            throw new Error("Expected responses");
          }
          world.result = assembleDestinationRouteCanvas({
            alerts: world.alerts,
            nowMs: Date.parse("2026-03-21T10:00:00.000Z"),
            policy: "fastest",
            responses: world.responses,
            title: "Mall of Tripla",
          });
        },
      },
      {
        pattern: /^When the Home route canvas is assembled without disruption confidence$/,
        run: ({ world }) => {
          if (!world.responses) {
            throw new Error("Expected responses");
          }
          world.result = assembleHomeRouteCanvas({
            disruptionConfidenceAvailable: false,
            nowMs: Date.parse("2026-03-21T10:00:00.000Z"),
            policy: "fastest",
            responses: world.responses,
          });
        },
      },
      {
        pattern: /^When the destination route canvas is assembled with fastest and least_walking policies$/,
        run: ({ world }) => {
          if (!world.responses) {
            throw new Error("Expected responses");
          }
          world.fastestResult = assembleDestinationRouteCanvas({
            nowMs: Date.parse("2026-03-21T10:00:00.000Z"),
            policy: "fastest",
            responses: world.responses,
            title: "Mall of Tripla",
          });
          world.leastWalkingResult = assembleDestinationRouteCanvas({
            nowMs: Date.parse("2026-03-21T10:00:00.000Z"),
            policy: "least_walking",
            responses: world.responses,
            title: "Mall of Tripla",
          });
        },
      },
      {
        pattern: /^Then the primary route itinerary summary is P to 59$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.state, "ready");
          if (world.result?.state !== "ready") {
            throw new Error("Expected ready result");
          }
          assert.equal(world.result.primary.itinerarySummary, "P to 59");
        },
      },
      {
        pattern: /^(Then|And) the primary route transfer count is 1$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.state, "ready");
          if (world.result?.state !== "ready") {
            throw new Error("Expected ready result");
          }
          assert.equal(world.result.primary.transfers, 1);
        },
      },
      {
        pattern: /^Then the first itinerary leg time range is 10:02 to 10:08$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.state, "ready");
          if (world.result?.state !== "ready") {
            throw new Error("Expected ready result");
          }
          assert.equal(world.result.primary.itineraryLegs?.[0]?.timeRangeLabel, "10:02 to 10:08");
        },
      },
      {
        pattern: /^(Then|And) the second itinerary leg time range is 10:10 to 10:15$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.state, "ready");
          if (world.result?.state !== "ready") {
            throw new Error("Expected ready result");
          }
          assert.equal(world.result.primary.itineraryLegs?.[1]?.timeRangeLabel, "10:10 to 10:15");
        },
      },
      {
        pattern: /^(Then|And) the itinerary interchange stop is Pasila$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.state, "ready");
          if (world.result?.state !== "ready") {
            throw new Error("Expected ready result");
          }
          assert.equal(world.result.primary.interchangeStopName, "Pasila");
        },
      },
      {
        pattern: /^Then the fastest planned primary route is line P$/,
        run: ({ assert, world }) => {
          assert.equal(world.fastestResult?.state, "ready");
          if (world.fastestResult?.state !== "ready") {
            throw new Error("Expected ready result");
          }
          assert.equal(world.fastestResult.primary.line, "P");
        },
      },
      {
        pattern: /^(Then|And) the fewest transfers primary route is line 7$/,
        run: ({ assert, world }) => {
          assert.equal(world.fewestTransfersResult?.state, "ready");
          if (world.fewestTransfersResult?.state !== "ready") {
            throw new Error("Expected ready result");
          }
          assert.equal(world.fewestTransfersResult.primary.line, "7");
        },
      },
      {
        pattern: /^(Then|And) the fewest transfers route has 0 transfers$/,
        run: ({ assert, world }) => {
          assert.equal(world.fewestTransfersResult?.state, "ready");
          if (world.fewestTransfersResult?.state !== "ready") {
            throw new Error("Expected ready result");
          }
          assert.equal(world.fewestTransfersResult.primary.transfers, 0);
        },
      },
      {
        pattern: /^Then the primary route is line 550 to Home in 2 minutes$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.state, "ready");
          if (world.result?.state !== "ready") {
            throw new Error("Expected ready result");
          }
          assert.equal(world.result.primary.line, "550");
          assert.equal(world.result.primary.destination, "Home");
          assert.equal(world.result.primary.minutes, 2);
        },
      },
      {
        pattern: /^(Then|And) the backup route is line 510 to Home in 5 minutes$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.state, "ready");
          if (world.result?.state !== "ready") {
            throw new Error("Expected ready result");
          }
          assert.equal(world.result.backup?.line, "510");
          assert.equal(world.result.backup?.destination, "Home");
          assert.equal(world.result.backup?.minutes, 5);
        },
      },
      {
        pattern: /^Then the primary route is line 59 to Mall of Tripla in 4 minutes$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.state, "ready");
          if (world.result?.state !== "ready") {
            throw new Error("Expected ready result");
          }
          assert.equal(world.result.primary.line, "59");
          assert.equal(world.result.primary.destination, "Mall of Tripla");
          assert.equal(world.result.primary.minutes, 4);
        },
      },
      {
        pattern: /^(Then|And) the primary route walking distance is 40 meters$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.state, "ready");
          if (world.result?.state !== "ready") {
            throw new Error("Expected ready result");
          }
          assert.equal(world.result.primary.walkingMeters, 40);
        },
      },
      {
        pattern: /^Then the canvas state is no_route$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.state, "no_route");
        },
      },
      {
        pattern: /^(Then|And) the first viable alternative stop is Kamppi$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.state, "no_route");
          if (world.result?.state !== "no_route") {
            throw new Error("Expected no-route result");
          }
          assert.equal(world.result.alternatives[0]?.stopName, "Kamppi");
        },
      },
      {
        pattern: /^Then the canvas is marked degraded$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.degraded, true);
        },
      },
      {
        pattern: /^Then the no-route reason is service_disruption$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.state, "no_route");
          if (world.result?.state !== "no_route") {
            throw new Error("Expected no-route result");
          }
          assert.equal((world.result as RouteCanvasViewModel & { reason?: string }).reason, "service_disruption");
        },
      },
      {
        pattern: /^Then the fastest primary route is line 600$/,
        run: ({ assert, world }) => {
          assert.equal(world.fastestResult?.state, "ready");
          if (world.fastestResult?.state !== "ready") {
            throw new Error("Expected ready result");
          }
          assert.equal(world.fastestResult.primary.line, "600");
        },
      },
      {
        pattern: /^(Then|And) the least walking primary route is line 59$/,
        run: ({ assert, world }) => {
          assert.equal(world.leastWalkingResult?.state, "ready");
          if (world.leastWalkingResult?.state !== "ready") {
            throw new Error("Expected ready result");
          }
          assert.equal(world.leastWalkingResult.primary.line, "59");
        },
      },
    ],
  }
);
