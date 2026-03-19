import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  createBrowserAlertsClient,
  type AlertsClient,
} from "@client/services/alerts-client";
import type { AlertsSuccessResponse } from "@shared/contracts/alerts-contract";

interface FetchCall {
  init?: RequestInit;
  url: string;
}

interface World {
  client?: AlertsClient;
  errorMessage?: string;
  fetchCalls?: FetchCall[];
  responsePayload?: AlertsSuccessResponse | { error?: string };
  responseStatus?: number;
  result?: AlertsSuccessResponse;
}

function createAlertsResponse(): AlertsSuccessResponse {
  return {
    alerts: [
      {
        cause: "CONSTRUCTION",
        descriptionText: "Line 7 runs on a detour.",
        effect: "DETOUR",
        effectiveEndDate: 1774215000,
        effectiveStartDate: 1773401400,
        entities: [{ routeId: "HSL:1007", routeShortName: "7", type: "route" }],
        headerText: "Line 7 runs on a detour",
        id: "alert-7",
        severityLevel: "INFO",
      },
    ],
  };
}

function createClient(world: World): AlertsClient {
  const fetchCalls: FetchCall[] = [];
  world.fetchCalls = fetchCalls;
  return createBrowserAlertsClient({
    fetchImpl: async (url, init) => {
      fetchCalls.push({ init, url: String(url) });
      return {
        json: async () => world.responsePayload,
        ok: (world.responseStatus || 200) < 400,
        status: world.responseStatus || 200,
      } as Response;
    },
  });
}

defineFeature<World>(
  test,
  `
Feature: Browser alerts client

  Scenario: Alerts requests include route and stop filters
    Given the browser alerts client has a successful alerts response
    When alerts are requested for route HSL:1007 and stop HSL:STOP_7
    Then the alerts request includes the route and stop filters
    And the alerts response contains 1 alert

  Scenario: Alerts client surfaces an upstream error payload message
    Given the browser alerts client has a failing response with error message Alert service offline
    When alerts are requested for route HSL:1007 only
    Then the alerts client error is Alert service offline
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the browser alerts client has a successful alerts response$/,
        run: ({ world }) => {
          world.responsePayload = createAlertsResponse();
          world.responseStatus = 200;
          world.client = createClient(world);
        },
      },
      {
        pattern: /^Given the browser alerts client has a failing response with error message (.+)$/,
        run: ({ args, world }) => {
          world.responsePayload = { error: args[0] };
          world.responseStatus = 503;
          world.client = createClient(world);
        },
      },
      {
        pattern: /^When alerts are requested for route HSL:1007 and stop HSL:STOP_7$/,
        run: async ({ world }) => {
          if (!world.client) {
            throw new Error("Expected alerts client");
          }
          world.result = await world.client.getAlerts({
            routeIds: ["HSL:1007"],
            stopIds: ["HSL:STOP_7"],
          });
        },
      },
      {
        pattern: /^When alerts are requested for route HSL:1007 only$/,
        run: async ({ world }) => {
          if (!world.client) {
            throw new Error("Expected alerts client");
          }
          try {
            await world.client.getAlerts({
              routeIds: ["HSL:1007"],
              stopIds: [],
            });
          } catch (error) {
            world.errorMessage = error instanceof Error ? error.message : String(error);
          }
        },
      },
      {
        pattern: /^Then the alerts request includes the route and stop filters$/,
        run: ({ assert, world }) => {
          const requestUrl = new URL(world.fetchCalls?.[0]?.url || "", "http://localhost");
          assert.equal(requestUrl.pathname, "/api/v1/alerts");
          assert.equal(requestUrl.searchParams.get("route"), "HSL:1007");
          assert.equal(requestUrl.searchParams.get("stop"), "HSL:STOP_7");
          assert.equal(world.fetchCalls?.[0]?.init?.method, "GET");
        },
      },
      {
        pattern: /^(?:Then|And) the alerts response contains 1 alert$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.alerts.length, 1);
        },
      },
      {
        pattern: /^Then the alerts client error is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.errorMessage, args[0]);
        },
      },
    ],
  }
);
