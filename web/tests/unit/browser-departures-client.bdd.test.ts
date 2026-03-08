import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  createBrowserDeparturesClient,
  type DeparturesClient,
} from "@client/services/departures-client";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";

interface FetchCall {
  init?: RequestInit;
  url: string;
}

interface World {
  client?: DeparturesClient;
  errorMessage?: string;
  fetchCalls?: FetchCall[];
  responsePayload?: DeparturesSuccessResponse | { error?: string } | { message?: string };
  result?: DeparturesSuccessResponse;
  responseStatus?: number;
}

function createDeparturesResponse(): DeparturesSuccessResponse {
  return {
    filterOptions: {
      destinations: [{ count: 1, value: "Kamppi" }],
      lines: [{ count: 1, value: "550" }],
    },
    mode: "BUS",
    selectedStopId: "HSL:STOP_A",
    station: {
      departures: [],
      distanceMeters: 80,
      stopCode: "A1",
      stopCodes: ["A1"],
      stopName: "Kamppi",
      type: "stop",
    },
    stops: [],
  };
}

function createClient(world: World): DeparturesClient {
  const fetchCalls: FetchCall[] = [];
  world.fetchCalls = fetchCalls;
  return createBrowserDeparturesClient({
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
Feature: Browser departures client

  Scenario: Departures requests include active filters and selected stop
    Given the browser departures client has a successful departures response
    When departures are requested with one line one destination line intent and selected stop
    Then the departures request includes the active filter query parameters
    And the departures response selected stop id is HSL:STOP_A

  Scenario: Departures client surfaces an upstream error payload message
    Given the browser departures client has a failing response with error message Service offline
    When departures are requested without optional filters
    Then the departures client error is Service offline

  Scenario: Departures client uses a generic error when the payload has no error field
    Given the browser departures client has a failing response without an error field
    When departures are requested without optional filters
    Then the departures client error is Could not load departures.
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the browser departures client has a successful departures response$/,
        run: ({ world }) => {
          world.responsePayload = createDeparturesResponse();
          world.responseStatus = 200;
          world.client = createClient(world);
        },
      },
      {
        pattern: /^Given the browser departures client has a failing response with error message (.+)$/,
        run: ({ args, world }) => {
          world.responsePayload = { error: args[0] };
          world.responseStatus = 503;
          world.client = createClient(world);
        },
      },
      {
        pattern: /^Given the browser departures client has a failing response without an error field$/,
        run: ({ world }) => {
          world.responsePayload = { message: "missing error" };
          world.responseStatus = 500;
          world.client = createClient(world);
        },
      },
      {
        pattern: /^When departures are requested with one line one destination line intent and selected stop$/,
        run: async ({ world }) => {
          if (!world.client) {
            throw new Error("Expected departures client");
          }
          world.result = await world.client.getDepartures({
            coords: { lat: 60.17, lon: 24.94 },
            destinations: ["Kamppi"],
            lineIntent: true,
            lines: ["550"],
            mode: "BUS",
            stopId: "HSL:STOP_A",
          });
        },
      },
      {
        pattern: /^When departures are requested without optional filters$/,
        run: async ({ world }) => {
          if (!world.client) {
            throw new Error("Expected departures client");
          }
          try {
            await world.client.getDepartures({
              coords: { lat: 60.17, lon: 24.94 },
              destinations: [],
              lines: [],
              mode: "BUS",
              stopId: null,
            });
          } catch (error) {
            world.errorMessage = error instanceof Error ? error.message : String(error);
          }
        },
      },
      {
        pattern: /^Then the departures request includes the active filter query parameters$/,
        run: ({ assert, world }) => {
          const requestUrl = new URL(world.fetchCalls?.[0]?.url || "", "http://localhost");
          assert.equal(requestUrl.pathname, "/api/v1/departures");
          assert.equal(requestUrl.searchParams.get("lat"), "60.17");
          assert.equal(requestUrl.searchParams.get("lon"), "24.94");
          assert.equal(requestUrl.searchParams.get("mode"), "BUS");
          assert.equal(requestUrl.searchParams.get("stopId"), "HSL:STOP_A");
          assert.equal(requestUrl.searchParams.get("line"), "550");
          assert.equal(requestUrl.searchParams.get("dest"), "Kamppi");
          assert.equal(requestUrl.searchParams.get("lineIntent"), "1");
          assert.equal(world.fetchCalls?.[0]?.init?.method, "GET");
        },
      },
      {
        pattern: /^Then the departures response selected stop id is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.result?.selectedStopId, args[0]);
        },
      },
      {
        pattern: /^Then the departures client error is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.errorMessage, args[0]);
        },
      },
    ],
  }
);
