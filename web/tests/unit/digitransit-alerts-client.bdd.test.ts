import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createDigitransitService } from "@server/services/digitransit/client";
import type { NormalizedAlert } from "@shared/contracts/alerts-contract";

interface FetchCall {
  body?: string;
  url: string;
}

interface World {
  alerts?: NormalizedAlert[];
  fetchCalls?: FetchCall[];
}

defineFeature<World>(
  test,
  `
Feature: Digitransit alerts client

  Scenario: Digitransit alerts normalize route and stop entities from the root alerts query
    Given Digitransit GraphQL returns one route alert and one stop alert
    When Digitransit alerts are requested for route HSL:2149 and stop HSL:1250551
    Then the upstream alerts query passes empty route and stop filters
    And 2 normalized alerts are returned
    And the first normalized alert includes route entity HSL:2149
    And the second normalized alert includes stop entity HSL:1250551
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given Digitransit GraphQL returns one route alert and one stop alert$/,
        run: ({ world }) => {
          world.fetchCalls = [];
        },
      },
      {
        pattern: /^When Digitransit alerts are requested for route HSL:2149 and stop HSL:1250551$/,
        run: async ({ world }) => {
          const service = createDigitransitService({
            fetchImpl: async (url, init) => {
              world.fetchCalls?.push({
                body: typeof init?.body === "string" ? init.body : undefined,
                url: String(url),
              });
              return {
                json: async () => ({
                  data: {
                    alerts: [
                      {
                        alertCause: "CONSTRUCTION",
                        alertDescriptionText: "Line 149 runs on a detour.",
                        alertEffect: "DETOUR",
                        alertHeaderText: "Line 149 runs on a detour",
                        alertSeverityLevel: "INFO",
                        effectiveEndDate: 1774215000,
                        effectiveStartDate: 1773401400,
                        entities: [
                          {
                            __typename: "Route",
                            routeGtfsId: "HSL:2149",
                            shortName: "149",
                          },
                        ],
                        id: "alert-route-149",
                      },
                      {
                        alertCause: "OTHER_CAUSE",
                        alertDescriptionText: "Käpylä platform 3 lift is out of service.",
                        alertEffect: "OTHER_EFFECT",
                        alertHeaderText: "No accessible access to platform 3",
                        alertSeverityLevel: "INFO",
                        effectiveEndDate: 1777062600,
                        effectiveStartDate: 1773903600,
                        entities: [
                          {
                            __typename: "Stop",
                            name: "Käpylä",
                            stopCode: "H0072",
                            stopGtfsId: "HSL:1250551",
                          },
                        ],
                        id: "alert-stop-kapyla",
                      },
                    ],
                  },
                }),
                ok: true,
                status: 200,
              } as Response;
            },
            getApiKey: () => "test-key",
          });
          const getAlerts = service.getAlerts;
          if (!getAlerts) {
            throw new Error("Expected alerts client");
          }
          world.alerts = await getAlerts({
            routeIds: ["HSL:2149"],
            stopIds: ["HSL:1250551"],
          });
        },
      },
      {
        pattern: /^Then the upstream alerts query passes empty route and stop filters$/,
        run: ({ assert, world }) => {
          const body = JSON.parse(world.fetchCalls?.[0]?.body || "{}") as {
            variables?: Record<string, unknown>;
          };
          assert.equal(
            JSON.stringify(body.variables),
            JSON.stringify({
              feeds: ["HSL"],
              routeIds: [],
              stopIds: [],
            })
          );
        },
      },
      {
        pattern: /^(?:Then|And) 2 normalized alerts are returned$/,
        run: ({ assert, world }) => {
          assert.equal(world.alerts?.length, 2);
        },
      },
      {
        pattern: /^(?:Then|And) the first normalized alert includes route entity HSL:2149$/,
        run: ({ assert, world }) => {
          assert.equal(world.alerts?.[0]?.entities[0]?.routeId, "HSL:2149");
        },
      },
      {
        pattern: /^(?:Then|And) the second normalized alert includes stop entity HSL:1250551$/,
        run: ({ assert, world }) => {
          assert.equal(world.alerts?.[1]?.entities[0]?.stopId, "HSL:1250551");
        },
      },
    ],
  }
);
