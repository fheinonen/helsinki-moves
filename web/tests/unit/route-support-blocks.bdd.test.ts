import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { getRouteSupportBlocks } from "@client/create/route-support-blocks";
import type { NormalizedAlert } from "@shared/contracts/alerts-contract";
import type { RouteCanvasViewModel } from "@client/create/canvas-view-model";

interface World {
  blocks?: string[];
  routeCanvas?: RouteCanvasViewModel;
}

function createReadyCanvas(input: {
  alerts?: NormalizedAlert[];
  backup?: RouteCanvasViewModel extends { backup: infer T } ? T : never;
  degraded?: boolean;
}): RouteCanvasViewModel {
  return {
    alerts: input.alerts || [],
    backup: input.backup === undefined ? null : input.backup,
    canvasType: "destination_route",
    degraded: input.degraded ?? false,
    policy: "fastest",
    primary: {
      destination: "Mall of Tripla",
      line: "7",
      minutes: 0,
      routeId: "HSL:1007",
      stopCode: "H0072",
      stopName: "Rautatientori",
      walkingMeters: 90,
    },
    state: "ready",
    title: "let's go to Mall of Tripla",
  };
}

defineFeature<World>(
  test,
  `
Feature: Route support block composition

  Scenario: Advisory route canvases use service note without disruption notice
    Given an advisory ready route canvas
    When the route support blocks are selected
    Then the route support blocks include service_note
    And the route support blocks exclude disruption_notice
    And the route support blocks exclude confidence_notice

  Scenario: Disrupted degraded route canvases use disruption notice without confidence notice
    Given a disrupted degraded ready route canvas
    When the route support blocks are selected
    Then the route support blocks include disruption_notice
    And the route support blocks exclude confidence_notice

  Scenario: Generic degraded route canvases keep confidence notice
    Given a generic degraded ready route canvas
    When the route support blocks are selected
    Then the route support blocks include confidence_notice
    And the route support blocks exclude disruption_notice

  Scenario: Policy-restricted no-route canvases use policy recovery
    Given a policy-restricted no-route route canvas
    When the route support blocks are selected
    Then the route support blocks include policy_recovery
    And the route support blocks exclude disruption_recovery

  Scenario: Service-disruption no-route canvases use disruption recovery and notice
    Given a service-disruption no-route route canvas
    When the route support blocks are selected
    Then the route support blocks include disruption_recovery
    And the route support blocks include disruption_notice
    And the route support blocks exclude confidence_notice
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given an advisory ready route canvas$/,
        run: ({ world }) => {
          world.routeCanvas = createReadyCanvas({
            alerts: [
              {
                cause: "OTHER_CAUSE",
                descriptionText: "Line 7 runs less often right now.",
                effect: "REDUCED_SERVICE",
                effectiveEndDate: 1774215000,
                effectiveStartDate: 1773401400,
                entities: [{ routeId: "HSL:1007", routeShortName: "7", type: "route" }],
                headerText: "Line 7 reduced service",
                id: "reduced-service-7",
                severityLevel: "WARNING",
              },
            ],
          });
        },
      },
      {
        pattern: /^Given a disrupted degraded ready route canvas$/,
        run: ({ world }) => {
          world.routeCanvas = createReadyCanvas({
            alerts: [
              {
                cause: "OTHER_CAUSE",
                descriptionText: "Line 7 service cancelled.",
                effect: "NO_SERVICE",
                effectiveEndDate: 1774215000,
                effectiveStartDate: 1773401400,
                entities: [{ routeId: "HSL:1007", routeShortName: "7", type: "route" }],
                headerText: "Line 7 service cancelled",
                id: "no-service-7",
                severityLevel: "SEVERE",
              },
            ],
            degraded: true,
          });
        },
      },
      {
        pattern: /^Given a generic degraded ready route canvas$/,
        run: ({ world }) => {
          world.routeCanvas = createReadyCanvas({ degraded: true });
        },
      },
      {
        pattern: /^Given a policy-restricted no-route route canvas$/,
        run: ({ world }) => {
          world.routeCanvas = {
            alerts: [],
            alternatives: [{ distanceMeters: 40, stopCode: "H0059", stopName: "Tripla" }],
            canvasType: "destination_route",
            degraded: false,
            policy: "fewest_transfers",
            reason: "policy_restricted",
            state: "no_route",
            title: "let's go to Mall of Tripla",
          };
        },
      },
      {
        pattern: /^Given a service-disruption no-route route canvas$/,
        run: ({ world }) => {
          world.routeCanvas = {
            alerts: [
              {
                cause: "OTHER_CAUSE",
                descriptionText: "Tripla stop has no service right now.",
                effect: "NO_SERVICE",
                effectiveEndDate: 1774215000,
                effectiveStartDate: 1773401400,
                entities: [{ stopCode: "H0059", stopId: "HSL:TRIPLA", stopName: "Tripla", type: "stop" }],
                headerText: "Tripla stop closed",
                id: "tripla-no-service",
                severityLevel: "SEVERE",
              },
            ],
            alternatives: [{ distanceMeters: 40, stopCode: "H0059", stopName: "Tripla" }],
            canvasType: "destination_route",
            degraded: false,
            policy: "fastest",
            reason: "service_disruption",
            state: "no_route",
            title: "let's go to Mall of Tripla",
          };
        },
      },
      {
        pattern: /^When the route support blocks are selected$/,
        run: ({ world }) => {
          if (!world.routeCanvas) {
            throw new Error("Expected route canvas");
          }
          world.blocks = getRouteSupportBlocks(world.routeCanvas);
        },
      },
      {
        pattern: /^(Then|And) the route support blocks include service_note$/,
        run: ({ assert, world }) => {
          assert.equal(world.blocks?.includes("service_note"), true);
        },
      },
      {
        pattern: /^(Then|And) the route support blocks include disruption_notice$/,
        run: ({ assert, world }) => {
          assert.equal(world.blocks?.includes("disruption_notice"), true);
        },
      },
      {
        pattern: /^(Then|And) the route support blocks include confidence_notice$/,
        run: ({ assert, world }) => {
          assert.equal(world.blocks?.includes("confidence_notice"), true);
        },
      },
      {
        pattern: /^(Then|And) the route support blocks include policy_recovery$/,
        run: ({ assert, world }) => {
          assert.equal(world.blocks?.includes("policy_recovery"), true);
        },
      },
      {
        pattern: /^(Then|And) the route support blocks include disruption_recovery$/,
        run: ({ assert, world }) => {
          assert.equal(world.blocks?.includes("disruption_recovery"), true);
        },
      },
      {
        pattern: /^(Then|And) the route support blocks exclude disruption_notice$/,
        run: ({ assert, world }) => {
          assert.equal(world.blocks?.includes("disruption_notice"), false);
        },
      },
      {
        pattern: /^(Then|And) the route support blocks exclude confidence_notice$/,
        run: ({ assert, world }) => {
          assert.equal(world.blocks?.includes("confidence_notice"), false);
        },
      },
      {
        pattern: /^(Then|And) the route support blocks exclude disruption_recovery$/,
        run: ({ assert, world }) => {
          assert.equal(world.blocks?.includes("disruption_recovery"), false);
        },
      },
    ],
  }
);
