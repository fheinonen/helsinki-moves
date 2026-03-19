import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { describeNoRouteSupport } from "@client/create/no-route-support";
import type { NoRouteCanvasViewModel } from "@client/create/canvas-view-model";

interface World {
  routeCanvas?: NoRouteCanvasViewModel;
  support?: ReturnType<typeof describeNoRouteSupport>;
}

defineFeature<World>(
  test,
  `
Feature: No-route support composition

  Scenario: Generic no-route keeps the nearest alternative inline
    Given a generic no-route canvas with Tripla as the nearest alternative
    When the no-route support is described
    Then the no-route support explanation is No full route available right now. Nearest alternative stop: Tripla.
    And the no-route policy recovery is absent
    And the no-route disruption recovery is absent

  Scenario: Policy-restricted no-route uses a dedicated policy recovery
    Given a policy-restricted no-route canvas with Tripla as the nearest alternative
    When the no-route support is described
    Then the no-route support explanation is No full route available with this policy right now.
    And the no-route policy recovery is Try fastest instead. Nearest alternative stop: Tripla.
    And the no-route disruption recovery is absent

  Scenario: Service-disruption no-route uses a dedicated disruption recovery
    Given a service-disruption no-route canvas with Tripla as the nearest alternative
    When the no-route support is described
    Then the no-route support explanation is No full route available because of current service disruption. Service disruption affects this route.
    And the no-route policy recovery is absent
    And the no-route disruption recovery is Nearest alternative stop: Tripla.
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a generic no-route canvas with Tripla as the nearest alternative$/,
        run: ({ world }) => {
          world.routeCanvas = {
            alternatives: [{ distanceMeters: 40, stopCode: "H0059", stopName: "Tripla" }],
            alerts: [],
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
            alerts: [],
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
            alerts: [],
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
        pattern: /^When the no-route support is described$/,
        run: ({ world }) => {
          if (!world.routeCanvas) {
            throw new Error("Expected no-route canvas");
          }
          world.support = describeNoRouteSupport(world.routeCanvas);
        },
      },
      {
        pattern: /^Then the no-route support explanation is No full route available right now\. Nearest alternative stop: Tripla\.$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.support?.explanation,
            "No full route available right now. Nearest alternative stop: Tripla."
          );
        },
      },
      {
        pattern: /^Then the no-route support explanation is No full route available with this policy right now\.$/,
        run: ({ assert, world }) => {
          assert.equal(world.support?.explanation, "No full route available with this policy right now.");
        },
      },
      {
        pattern: /^Then the no-route support explanation is No full route available because of current service disruption\. Service disruption affects this route\.$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.support?.explanation,
            "No full route available because of current service disruption. Service disruption affects this route."
          );
        },
      },
      {
        pattern: /^(Then|And) the no-route policy recovery is absent$/,
        run: ({ assert, world }) => {
          assert.equal(world.support?.policyRecovery, null);
        },
      },
      {
        pattern: /^(Then|And) the no-route disruption recovery is absent$/,
        run: ({ assert, world }) => {
          assert.equal(world.support?.disruptionRecovery, null);
        },
      },
      {
        pattern: /^(Then|And) the no-route policy recovery is Try fastest instead\. Nearest alternative stop: Tripla\.$/,
        run: ({ assert, world }) => {
          assert.equal(world.support?.policyRecovery, "Try fastest instead. Nearest alternative stop: Tripla.");
        },
      },
      {
        pattern: /^(Then|And) the no-route disruption recovery is Nearest alternative stop: Tripla\.$/,
        run: ({ assert, world }) => {
          assert.equal(world.support?.disruptionRecovery, "Nearest alternative stop: Tripla.");
        },
      },
    ],
  }
);
