import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createApp } from "@server/app";
import type { DigitransitService } from "@server/services/digitransit/types";
import type { AlertsSuccessResponse } from "@shared/contracts/alerts-contract";

interface World {
  payload?: AlertsSuccessResponse;
  response?: Response;
  service?: DigitransitService;
}

defineFeature<World>(
  test,
  `
Feature: Alerts route contract

  Scenario: Alerts route returns normalized route and stop alerts
    Given Digitransit returns a route alert and a stop alert
    When the alerts route handles route HSL:2149 and stop HSL:1250551
    Then the alerts response status is 200
    And the alerts response contains 2 alerts
    And the first alert severity is INFO
    And the first alert includes route entity HSL:2149
    And the second alert includes stop entity HSL:1250551
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given Digitransit returns a route alert and a stop alert$/,
        run: ({ world }) => {
          world.service = {
            async getAlerts() {
              return [
                {
                  cause: "CONSTRUCTION",
                  descriptionText: "Line 149 runs on a detour.",
                  effect: "DETOUR",
                  effectiveEndDate: 1774215000,
                  effectiveStartDate: 1773401400,
                  entities: [
                    {
                      routeId: "HSL:2149",
                      routeShortName: "149",
                      type: "route",
                    },
                  ],
                  headerText: "Line 149 runs on a detour",
                  id: "alert-route-149",
                  severityLevel: "INFO",
                },
                {
                  cause: "OTHER_CAUSE",
                  descriptionText: "Käpylä platform 3 lift is out of service.",
                  effect: "OTHER_EFFECT",
                  effectiveEndDate: 1777062600,
                  effectiveStartDate: 1773903600,
                  entities: [
                    {
                      stopCode: "H0072",
                      stopId: "HSL:1250551",
                      stopName: "Käpylä",
                      type: "stop",
                    },
                  ],
                  headerText: "No accessible access to platform 3",
                  id: "alert-stop-kapyla",
                  severityLevel: "INFO",
                },
              ];
            },
            async getDeparturesForStopIds() {
              return new Map();
            },
            async getNearbyStops() {
              return [];
            },
            async getRoutes() {
              return [];
            },
          };
        },
      },
      {
        pattern: /^When the alerts route handles route HSL:2149 and stop HSL:1250551$/,
        run: async ({ world }) => {
          if (!world.service) {
            throw new Error("Expected Digitransit service");
          }
          const app = createApp({
            digitransitService: world.service,
          });
          world.response = await app.request(
            "http://localhost/api/v1/alerts?route=HSL:2149&stop=HSL:1250551"
          );
          world.payload = (await world.response.json()) as AlertsSuccessResponse;
        },
      },
      {
        pattern: /^(?:Then|And) the alerts response status is 200$/,
        run: ({ assert, world }) => {
          assert.equal(world.response?.status, 200);
        },
      },
      {
        pattern: /^(?:Then|And) the alerts response contains 2 alerts$/,
        run: ({ assert, world }) => {
          assert.equal(world.payload?.alerts.length, 2);
        },
      },
      {
        pattern: /^(?:Then|And) the first alert severity is INFO$/,
        run: ({ assert, world }) => {
          assert.equal(world.payload?.alerts[0]?.severityLevel, "INFO");
        },
      },
      {
        pattern: /^(?:Then|And) the first alert includes route entity HSL:2149$/,
        run: ({ assert, world }) => {
          assert.equal(world.payload?.alerts[0]?.entities[0]?.routeId, "HSL:2149");
        },
      },
      {
        pattern: /^(?:Then|And) the second alert includes stop entity HSL:1250551$/,
        run: ({ assert, world }) => {
          assert.equal(world.payload?.alerts[1]?.entities[0]?.stopId, "HSL:1250551");
        },
      },
    ],
  }
);
