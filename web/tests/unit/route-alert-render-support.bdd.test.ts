import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { describeRouteAlertRenderSupport } from "@client/create/route-alert-render-support";
import type { NormalizedAlert } from "@shared/contracts/alerts-contract";
import type { RouteCanvasViewModel } from "@client/create/canvas-view-model";

interface World {
  routeCanvas?: RouteCanvasViewModel;
  support?: ReturnType<typeof describeRouteAlertRenderSupport>;
}

function createReadyCanvas(input: { alerts: NormalizedAlert[]; degraded: boolean }): RouteCanvasViewModel {
  return {
    alerts: input.alerts,
    backup: null,
    canvasType: "destination_route",
    degraded: input.degraded,
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
Feature: Route alert render support

  Scenario: Disruption alerts append strong explanation copy and show a disruption notice
    Given a degraded route canvas with a no-service alert for line 7
    When the route alert render support is described
    Then the route alert explanation suffix is Alert: Line 7 not running right now.
    And the route alert service note is absent
    And the route alert disruption notice is present

  Scenario: Advisory alerts render as service notes and do not show disruption notice
    Given a route canvas with a reduced service alert for line 7
    When the route alert render support is described
    Then the route alert explanation suffix is absent
    And the route alert service note is Service note: Reduced service on line 7.
    And the route alert disruption notice is absent

  Scenario: Routes without alerts render no alert support
    Given a route canvas with no alerts
    When the route alert render support is described
    Then the route alert explanation suffix is absent
    And the route alert service note is absent
    And the route alert disruption notice is absent
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a degraded route canvas with a no-service alert for line 7$/,
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
        pattern: /^Given a route canvas with a reduced service alert for line 7$/,
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
            degraded: false,
          });
        },
      },
      {
        pattern: /^Given a route canvas with no alerts$/,
        run: ({ world }) => {
          world.routeCanvas = createReadyCanvas({ alerts: [], degraded: false });
        },
      },
      {
        pattern: /^When the route alert render support is described$/,
        run: ({ world }) => {
          if (!world.routeCanvas) {
            throw new Error("Expected route canvas");
          }
          world.support = describeRouteAlertRenderSupport(world.routeCanvas);
        },
      },
      {
        pattern: /^Then the route alert explanation suffix is Alert: Line 7 not running right now\.$/,
        run: ({ assert, world }) => {
          assert.equal(world.support?.explanationSuffix, "Alert: Line 7 not running right now.");
        },
      },
      {
        pattern: /^(Then|And) the route alert explanation suffix is absent$/,
        run: ({ assert, world }) => {
          assert.equal(world.support?.explanationSuffix, null);
        },
      },
      {
        pattern: /^(Then|And) the route alert service note is Service note: Reduced service on line 7\.$/,
        run: ({ assert, world }) => {
          assert.equal(world.support?.serviceNote, "Service note: Reduced service on line 7.");
        },
      },
      {
        pattern: /^(Then|And) the route alert service note is absent$/,
        run: ({ assert, world }) => {
          assert.equal(world.support?.serviceNote, null);
        },
      },
      {
        pattern: /^(Then|And) the route alert disruption notice is present$/,
        run: ({ assert, world }) => {
          assert.equal(world.support?.showDisruptionNotice, true);
        },
      },
      {
        pattern: /^(Then|And) the route alert disruption notice is absent$/,
        run: ({ assert, world }) => {
          assert.equal(world.support?.showDisruptionNotice, false);
        },
      },
    ],
  }
);
