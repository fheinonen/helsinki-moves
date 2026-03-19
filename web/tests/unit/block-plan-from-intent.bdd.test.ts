import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  createBlockPlanFromIntent,
  createBlockPlanForRouteCanvas,
  type IntentBlockSelectionInput,
} from "@client/create/block-plan-from-intent";
import type { RouteCanvasViewModel } from "@client/create/canvas-view-model";

interface World {
  input?: IntentBlockSelectionInput;
  routeCanvas?: RouteCanvasViewModel;
  result?: ReturnType<typeof createBlockPlanFromIntent>;
}

defineFeature<World>(
  test,
  `
Feature: Block plan selection

  Scenario: Get me home fast chooses the Home canvas
    Given a Home intent with proposed primary and backup routes
    When the block plan is selected from intent
    Then the selected canvas type is home_fast
    And the block plan includes primary_route

  Scenario: Lets go to Mall of Tripla chooses the destination canvas
    Given a destination intent with proposed primary route and policy switch
    When the block plan is selected from intent
    Then the selected canvas type is destination_route
    And the block plan includes policy_switch

  Scenario: A Home canvas rejects destination-only clarification blocks
    Given a Home intent with proposed clarification choices
    When the block plan is selected from intent
    Then the selected canvas type is home_fast
    And the block plan excludes clarification_choices

  Scenario: An unresolved destination keeps clarification choices
    Given a destination intent needing clarification with proposed clarification choices
    When the block plan is selected from intent
    Then the selected canvas type is destination_route
    And the block plan includes clarification_choices

  Scenario: Invalid proposed blocks are repaired before rendering
    Given a destination intent with duplicate and unknown proposed blocks
    When the block plan is selected from intent
    Then the block plan includes primary_route
    And the block plan excludes unknown blocks
    And the block plan contains primary_route once

  Scenario: A degraded destination canvas includes confidence notice
    Given a degraded destination route canvas
    When the block plan is selected for the route canvas
    Then the block plan includes confidence_notice
    And the block plan includes route_explanation

  Scenario: An advisory destination canvas includes service note instead of confidence notice
    Given an advisory destination route canvas
    When the block plan is selected for the route canvas
    Then the block plan includes service_note
    And the block plan excludes confidence_notice

  Scenario: A disrupted destination canvas includes disruption notice instead of confidence notice
    Given a disrupted destination route canvas
    When the block plan is selected for the route canvas
    Then the block plan includes disruption_notice
    And the block plan excludes confidence_notice

  Scenario: A policy-restricted no-route canvas includes policy recovery
    Given a policy-restricted no-route canvas
    When the block plan is selected for the route canvas
    Then the block plan includes policy_recovery

  Scenario: A service-disruption no-route canvas includes disruption recovery
    Given a service-disruption no-route canvas
    When the block plan is selected for the route canvas
    Then the block plan includes disruption_recovery
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a Home intent with proposed primary and backup routes$/,
        run: ({ world }) => {
          world.input = {
            destinationResolved: true,
            homeSaved: true,
            intentKind: "home",
            proposedBlocks: ["primary_route", "backup_route"],
          };
        },
      },
      {
        pattern: /^Given a destination intent with proposed primary route and policy switch$/,
        run: ({ world }) => {
          world.input = {
            destinationResolved: true,
            homeSaved: true,
            intentKind: "destination",
            proposedBlocks: ["primary_route", "policy_switch"],
          };
        },
      },
      {
        pattern: /^Given a Home intent with proposed clarification choices$/,
        run: ({ world }) => {
          world.input = {
            destinationResolved: true,
            homeSaved: true,
            intentKind: "home",
            proposedBlocks: ["clarification_choices"],
          };
        },
      },
      {
        pattern: /^Given a destination intent needing clarification with proposed clarification choices$/,
        run: ({ world }) => {
          world.input = {
            destinationResolved: false,
            homeSaved: true,
            intentKind: "destination",
            proposedBlocks: ["clarification_choices", "primary_route"],
          };
        },
      },
      {
        pattern: /^Given a destination intent with duplicate and unknown proposed blocks$/,
        run: ({ world }) => {
          world.input = {
            destinationResolved: true,
            homeSaved: true,
            intentKind: "destination",
            proposedBlocks: ["primary_route", "primary_route", "policy_switch", "unknown_block"],
          };
        },
      },
      {
        pattern: /^Given a degraded destination route canvas$/,
        run: ({ world }) => {
          world.routeCanvas = {
            alerts: [],
            backup: null,
            canvasType: "destination_route",
            degraded: true,
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
        },
      },
      {
        pattern: /^Given an advisory destination route canvas$/,
        run: ({ world }) => {
          world.routeCanvas = {
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
            backup: null,
            canvasType: "destination_route",
            degraded: false,
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
        },
      },
      {
        pattern: /^Given a disrupted destination route canvas$/,
        run: ({ world }) => {
          world.routeCanvas = {
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
            backup: null,
            canvasType: "destination_route",
            degraded: true,
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
        },
      },
      {
        pattern: /^Given a policy-restricted no-route canvas$/,
        run: ({ world }) => {
          world.routeCanvas = {
            alerts: [],
            alternatives: [
              {
                distanceMeters: 40,
                stopCode: "H0059",
                stopName: "Tripla",
              },
            ],
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
        pattern: /^Given a service-disruption no-route canvas$/,
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
                headerText: "Tripla stop service cancelled",
                id: "alert-no-service-tripla",
                severityLevel: "SEVERE",
              },
            ],
            alternatives: [
              {
                distanceMeters: 40,
                stopCode: "H0059",
                stopName: "Tripla",
              },
            ],
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
        pattern: /^When the block plan is selected from intent$/,
        run: ({ world }) => {
          if (!world.input) {
            throw new Error("Expected intent input");
          }
          world.result = createBlockPlanFromIntent(world.input);
        },
      },
      {
        pattern: /^When the block plan is selected for the route canvas$/,
        run: ({ world }) => {
          if (!world.routeCanvas) {
            throw new Error("Expected route canvas");
          }
          world.result = createBlockPlanForRouteCanvas(world.routeCanvas);
        },
      },
      {
        pattern: /^Then the selected canvas type is home_fast$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.plan.canvasType, "home_fast");
        },
      },
      {
        pattern: /^Then the selected canvas type is destination_route$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.plan.canvasType, "destination_route");
        },
      },
      {
        pattern: /^(Then|And) the block plan includes primary_route$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.plan.blocks.includes("primary_route"), true);
        },
      },
      {
        pattern: /^(Then|And) the block plan includes policy_switch$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.plan.blocks.includes("policy_switch"), true);
        },
      },
      {
        pattern: /^(Then|And) the block plan includes confidence_notice$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.plan.blocks.includes("confidence_notice"), true);
        },
      },
      {
        pattern: /^(Then|And) the block plan excludes confidence_notice$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.plan.blocks.includes("confidence_notice"), false);
        },
      },
      {
        pattern: /^(Then|And) the block plan includes route_explanation$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.plan.blocks.includes("route_explanation"), true);
        },
      },
      {
        pattern: /^(Then|And) the block plan includes service_note$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.plan.blocks.includes("service_note" as never), true);
        },
      },
      {
        pattern: /^(Then|And) the block plan includes disruption_notice$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.plan.blocks.includes("disruption_notice" as never), true);
        },
      },
      {
        pattern: /^(Then|And) the block plan includes policy_recovery$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.plan.blocks.includes("policy_recovery" as never), true);
        },
      },
      {
        pattern: /^(Then|And) the block plan includes disruption_recovery$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.plan.blocks.includes("disruption_recovery" as never), true);
        },
      },
      {
        pattern: /^(Then|And) the block plan excludes clarification_choices$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.plan.blocks.includes("clarification_choices"), false);
        },
      },
      {
        pattern: /^(Then|And) the block plan includes clarification_choices$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.plan.blocks.includes("clarification_choices"), true);
        },
      },
      {
        pattern: /^(Then|And) the block plan excludes unknown blocks$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.plan.blocks.includes("unknown_block" as never), false);
        },
      },
      {
        pattern: /^(Then|And) the block plan contains primary_route once$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.result?.plan.blocks.filter((block: string) => block === "primary_route").length,
            1
          );
        },
      },
    ],
  }
);
