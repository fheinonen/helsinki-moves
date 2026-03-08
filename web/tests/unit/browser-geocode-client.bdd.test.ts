import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  createBrowserGeocodeClient,
  type GeocodeClient,
} from "@client/services/geocode-client";
import type { GeocodeSuccessResponse } from "@shared/contracts/geocode-contract";

interface FetchCall {
  init?: RequestInit;
  url: string;
}

interface World {
  client?: GeocodeClient;
  errorMessage?: string;
  fetchCalls?: FetchCall[];
  responsePayload?: GeocodeSuccessResponse | { error?: string } | { message?: string };
  responseStatus?: number;
  result?: GeocodeSuccessResponse;
}

function createGeocodeResponse(): GeocodeSuccessResponse {
  return {
    ambiguous: false,
    choices: [],
    location: {
      confidence: 0.9,
      label: "Kamppi, Helsinki",
      latitude: 60.17,
      longitude: 24.94,
    },
    query: "Kamppi",
  };
}

function createClient(world: World): GeocodeClient {
  const fetchCalls: FetchCall[] = [];
  world.fetchCalls = fetchCalls;
  return createBrowserGeocodeClient({
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
Feature: Browser geocode client

  Scenario: Geocode requests include bias coordinates and language
    Given the browser geocode client has a successful geocode response
    When geocoding is requested with Finnish language bias
    Then the geocode request includes the query and bias coordinates
    And the geocode response location label is Kamppi, Helsinki

  Scenario: Geocode client surfaces an upstream error payload message
    Given the browser geocode client has a failing response with error message No match
    When geocoding is requested with Finnish language bias
    Then the geocode client error is No match

  Scenario: Geocode client uses a generic error when the payload has no error field
    Given the browser geocode client has a failing response without an error field
    When geocoding is requested with Finnish language bias
    Then the geocode client error is Could not approximate location. Please try again.
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the browser geocode client has a successful geocode response$/,
        run: ({ world }) => {
          world.responsePayload = createGeocodeResponse();
          world.responseStatus = 200;
          world.client = createClient(world);
        },
      },
      {
        pattern: /^Given the browser geocode client has a failing response with error message (.+)$/,
        run: ({ args, world }) => {
          world.responsePayload = { error: args[0] };
          world.responseStatus = 400;
          world.client = createClient(world);
        },
      },
      {
        pattern: /^Given the browser geocode client has a failing response without an error field$/,
        run: ({ world }) => {
          world.responsePayload = { message: "missing error" };
          world.responseStatus = 500;
          world.client = createClient(world);
        },
      },
      {
        pattern: /^When geocoding is requested with Finnish language bias$/,
        run: async ({ world }) => {
          if (!world.client) {
            throw new Error("Expected geocode client");
          }
          try {
            world.result = await world.client.resolve({
              biasLat: 60.17,
              biasLon: 24.94,
              lang: "fi",
              query: "Kamppi",
            });
          } catch (error) {
            world.errorMessage = error instanceof Error ? error.message : String(error);
          }
        },
      },
      {
        pattern: /^Then the geocode request includes the query and bias coordinates$/,
        run: ({ assert, world }) => {
          const requestUrl = new URL(world.fetchCalls?.[0]?.url || "", "http://localhost");
          assert.equal(requestUrl.pathname, "/api/v1/geocode");
          assert.equal(requestUrl.searchParams.get("q"), "Kamppi");
          assert.equal(requestUrl.searchParams.get("lat"), "60.17");
          assert.equal(requestUrl.searchParams.get("lon"), "24.94");
          assert.equal(requestUrl.searchParams.get("lang"), "fi");
          assert.equal(world.fetchCalls?.[0]?.init?.method, "GET");
        },
      },
      {
        pattern: /^Then the geocode response location label is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.result?.location?.label, args[0]);
        },
      },
      {
        pattern: /^Then the geocode client error is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.errorMessage, args[0]);
        },
      },
    ],
  }
);
