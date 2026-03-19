import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  getPreferredAlertMessage,
  getPreferredAlertTone,
  preferredAlertDegradesConfidence,
  selectPreferredAlert,
} from "@client/create/route-alert-support";
import type { NormalizedAlert } from "@shared/contracts/alerts-contract";
import type { RouteCanvasViewModel } from "@client/create/canvas-view-model";

interface World {
  alert?: NormalizedAlert | null;
  message?: string | null;
  routeCanvas?: RouteCanvasViewModel;
}

function createReadyCanvas(alerts: NormalizedAlert[]): RouteCanvasViewModel {
  return {
    alerts,
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
}

defineFeature<World>(
  test,
  `
Feature: Route alert support

  Scenario: Route-matched stop-on-route alert beats a generic stop alert
    Given a route canvas with a generic stop alert and a stop-on-route alert for line 7
    When the preferred alert is selected
    Then the selected alert id is stop-on-route-7

  Scenario: Detour alerts use line-specific product copy
    Given a route canvas with a detour alert for line 7
    When the preferred alert message is generated
    Then the preferred alert message is Detour on line 7

  Scenario: Significant delay alerts use line-specific product copy
    Given a route canvas with a significant delay alert for line 7
    When the preferred alert message is generated
    Then the preferred alert message is Major delays on line 7

  Scenario: Reduced service alerts use line-specific product copy
    Given a route canvas with a reduced service alert for line 7
    When the preferred alert message is generated
    Then the preferred alert message is Reduced service on line 7

  Scenario: Reduced service alerts use advisory tone
    Given a route canvas with a reduced service alert for line 7
    When the preferred alert tone is evaluated
    Then the preferred alert tone is advisory

  Scenario: Significant delay alerts lower confidence even when only warning-level
    Given a route canvas with a warning-level significant delay alert for line 7
    When the preferred alert confidence is evaluated
    Then the preferred alert degrades confidence

  Scenario: Severe reduced-service alerts stay advisory
    Given a route canvas with a severe reduced service alert for line 7
    When the preferred alert confidence is evaluated
    Then the preferred alert does not degrade confidence

  Scenario: Severe no-service alerts degrade confidence
    Given a route canvas with a severe no-service alert for line 7
    When the preferred alert confidence is evaluated
    Then the preferred alert degrades confidence
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a route canvas with a generic stop alert and a stop-on-route alert for line 7$/,
        run: ({ world }) => {
          world.routeCanvas = createReadyCanvas([
            {
              cause: "OTHER_CAUSE",
              descriptionText: "Stop elevator issue.",
              effect: "OTHER_EFFECT",
              effectiveEndDate: 1774215000,
              effectiveStartDate: 1773401400,
              entities: [{ stopCode: "H0072", stopId: "HSL:STOP_7", stopName: "Rautatientori", type: "stop" }],
              headerText: "Stop H0072 elevator out of service",
              id: "generic-stop",
              severityLevel: "INFO",
            },
            {
              cause: "OTHER_CAUSE",
              descriptionText: "Board at a temporary stop for line 7.",
              effect: "STOP_MOVED",
              effectiveEndDate: 1774215000,
              effectiveStartDate: 1773401400,
              entities: [
                {
                  routeId: "HSL:1007",
                  routeShortName: "7",
                  stopCode: "H0072",
                  stopId: "HSL:STOP_7",
                  stopName: "Rautatientori",
                  type: "stop_on_route",
                },
              ],
              headerText: "Temporary stop for line 7",
              id: "stop-on-route-7",
              severityLevel: "INFO",
            },
          ]);
        },
      },
      {
        pattern: /^Given a route canvas with a detour alert for line 7$/,
        run: ({ world }) => {
          world.routeCanvas = createReadyCanvas([
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
          ]);
        },
      },
      {
        pattern: /^Given a route canvas with a significant delay alert for line 7$/,
        run: ({ world }) => {
          world.routeCanvas = createReadyCanvas([
            {
              cause: "OTHER_CAUSE",
              descriptionText: "Line 7 is heavily delayed.",
              effect: "SIGNIFICANT_DELAYS",
              effectiveEndDate: 1774215000,
              effectiveStartDate: 1773401400,
              entities: [{ routeId: "HSL:1007", routeShortName: "7", type: "route" }],
              headerText: "Line 7 heavily delayed",
              id: "delays-7",
              severityLevel: "WARNING",
            },
          ]);
        },
      },
      {
        pattern: /^Given a route canvas with a reduced service alert for line 7$/,
        run: ({ world }) => {
          world.routeCanvas = createReadyCanvas([
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
          ]);
        },
      },
      {
        pattern: /^Given a route canvas with a warning-level significant delay alert for line 7$/,
        run: ({ world }) => {
          world.routeCanvas = createReadyCanvas([
            {
              cause: "OTHER_CAUSE",
              descriptionText: "Line 7 is heavily delayed.",
              effect: "SIGNIFICANT_DELAYS",
              effectiveEndDate: 1774215000,
              effectiveStartDate: 1773401400,
              entities: [{ routeId: "HSL:1007", routeShortName: "7", type: "route" }],
              headerText: "Line 7 heavily delayed",
              id: "warning-delays-7",
              severityLevel: "WARNING",
            },
          ]);
        },
      },
      {
        pattern: /^Given a route canvas with a severe reduced service alert for line 7$/,
        run: ({ world }) => {
          world.routeCanvas = createReadyCanvas([
            {
              cause: "OTHER_CAUSE",
              descriptionText: "Line 7 runs less often right now.",
              effect: "REDUCED_SERVICE",
              effectiveEndDate: 1774215000,
              effectiveStartDate: 1773401400,
              entities: [{ routeId: "HSL:1007", routeShortName: "7", type: "route" }],
              headerText: "Line 7 reduced service",
              id: "severe-reduced-service-7",
              severityLevel: "SEVERE",
            },
          ]);
        },
      },
      {
        pattern: /^Given a route canvas with a severe no-service alert for line 7$/,
        run: ({ world }) => {
          world.routeCanvas = createReadyCanvas([
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
          ]);
        },
      },
      {
        pattern: /^When the preferred alert is selected$/,
        run: ({ world }) => {
          if (!world.routeCanvas) {
            throw new Error("Expected route canvas");
          }
          world.alert = selectPreferredAlert(world.routeCanvas);
        },
      },
      {
        pattern: /^When the preferred alert message is generated$/,
        run: ({ world }) => {
          if (!world.routeCanvas) {
            throw new Error("Expected route canvas");
          }
          world.message = getPreferredAlertMessage(world.routeCanvas);
        },
      },
      {
        pattern: /^When the preferred alert confidence is evaluated$/,
        run: ({ world }) => {
          if (!world.routeCanvas) {
            throw new Error("Expected route canvas");
          }
          world.message = preferredAlertDegradesConfidence(world.routeCanvas) ? "degraded" : "not-degraded";
        },
      },
      {
        pattern: /^When the preferred alert tone is evaluated$/,
        run: ({ world }) => {
          if (!world.routeCanvas) {
            throw new Error("Expected route canvas");
          }
          world.message = getPreferredAlertTone(world.routeCanvas);
        },
      },
      {
        pattern: /^Then the selected alert id is stop-on-route-7$/,
        run: ({ assert, world }) => {
          assert.equal(world.alert?.id, "stop-on-route-7");
        },
      },
      {
        pattern: /^Then the preferred alert message is Detour on line 7$/,
        run: ({ assert, world }) => {
          assert.equal(world.message, "Detour on line 7");
        },
      },
      {
        pattern: /^Then the preferred alert message is Major delays on line 7$/,
        run: ({ assert, world }) => {
          assert.equal(world.message, "Major delays on line 7");
        },
      },
      {
        pattern: /^Then the preferred alert message is Reduced service on line 7$/,
        run: ({ assert, world }) => {
          assert.equal(world.message, "Reduced service on line 7");
        },
      },
      {
        pattern: /^Then the preferred alert tone is advisory$/,
        run: ({ assert, world }) => {
          assert.equal(world.message, "advisory");
        },
      },
      {
        pattern: /^Then the preferred alert degrades confidence$/,
        run: ({ assert, world }) => {
          assert.equal(world.message, "degraded");
        },
      },
      {
        pattern: /^Then the preferred alert does not degrade confidence$/,
        run: ({ assert, world }) => {
          assert.equal(world.message, "not-degraded");
        },
      },
    ],
  }
);
