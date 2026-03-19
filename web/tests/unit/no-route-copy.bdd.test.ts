import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { describeNoRouteCanvas } from "@client/create/no-route-copy";
import type { NoRouteCanvasViewModel } from "@client/create/canvas-view-model";

interface World {
  description?: ReturnType<typeof describeNoRouteCanvas>;
  routeCanvas?: NoRouteCanvasViewModel;
}

defineFeature<World>(
  test,
  `
Feature: No-route copy

  Scenario: Generic no-route copy stays neutral
    Given a generic no-route canvas with Tripla as the nearest alternative
    When the no-route copy is described
    Then the no-route explanation is No full route available right now.
    And the no-route recovery is Nearest alternative stop: Tripla.

  Scenario: Policy-restricted no-route copy points to recovery
    Given a policy-restricted no-route canvas with Tripla as the nearest alternative
    When the no-route copy is described
    Then the no-route explanation is No full route available with this policy right now.
    And the no-route recovery is Try fastest instead. Nearest alternative stop: Tripla.

  Scenario: Service-disruption no-route copy separates recovery from explanation
    Given a service-disruption no-route canvas with Tripla as the nearest alternative
    When the no-route copy is described
    Then the no-route explanation is No full route available because of current service disruption. Service disruption affects this route.
    And the no-route recovery is Nearest alternative stop: Tripla.
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a generic no-route canvas with Tripla as the nearest alternative$/,
        run: ({ world }) => {
          world.routeCanvas = {
            alternatives: [{ distanceMeters: 40, stopCode: "H0059", stopName: "Tripla" }],
            canvasType: "destination_route",
            degraded: false,
            policy: "fastest",
            reason: "generic",
            state: "no_route",
            title: "let's go to Mall of Tripla",
          };
        },
      },
      {
        pattern: /^Given a policy-restricted no-route canvas with Tripla as the nearest alternative$/,
        run: ({ world }) => {
          world.routeCanvas = {
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
        pattern: /^Given a service-disruption no-route canvas with Tripla as the nearest alternative$/,
        run: ({ world }) => {
          world.routeCanvas = {
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
        pattern: /^When the no-route copy is described$/,
        run: ({ world }) => {
          if (!world.routeCanvas) {
            throw new Error("Expected no-route canvas");
          }
          world.description = describeNoRouteCanvas(world.routeCanvas);
        },
      },
      {
        pattern: /^Then the no-route explanation is No full route available right now\.$/,
        run: ({ assert, world }) => {
          assert.equal(world.description?.explanation, "No full route available right now.");
        },
      },
      {
        pattern: /^Then the no-route explanation is No full route available with this policy right now\.$/,
        run: ({ assert, world }) => {
          assert.equal(world.description?.explanation, "No full route available with this policy right now.");
        },
      },
      {
        pattern: /^Then the no-route explanation is No full route available because of current service disruption\. Service disruption affects this route\.$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.description?.explanation,
            "No full route available because of current service disruption. Service disruption affects this route."
          );
        },
      },
      {
        pattern: /^(Then|And) the no-route recovery is Nearest alternative stop: Tripla\.$/,
        run: ({ assert, world }) => {
          assert.equal(world.description?.recovery, "Nearest alternative stop: Tripla.");
        },
      },
      {
        pattern: /^(Then|And) the no-route recovery is Try fastest instead\. Nearest alternative stop: Tripla\.$/,
        run: ({ assert, world }) => {
          assert.equal(world.description?.recovery, "Try fastest instead. Nearest alternative stop: Tripla.");
        },
      },
    ],
  }
);
