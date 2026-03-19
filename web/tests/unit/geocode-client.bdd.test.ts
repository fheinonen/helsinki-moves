import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  filterHslValidCandidates,
  geocode,
  type RawGeocodeCandidate,
} from "@server/services/geocode/client";
import type { NearbyStopNode } from "@server/services/digitransit/types";

interface FetchCall {
  init?: RequestInit;
  url: string;
}

interface World {
  errorMessage?: string;
  fetchCalls?: FetchCall[];
  geocodeResult?: Awaited<ReturnType<typeof geocode>>;
  invalidJsonResponse?: boolean;
  nearbyStopCallCount?: number;
  rawCandidates?: RawGeocodeCandidate[];
  validatedCandidates?: RawGeocodeCandidate[];
}

defineFeature<World>(
  test,
  `
Feature: Geocode client

  Scenario: Geocoding keeps valid parsed features and sends bias and language parameters
    Given Digitransit geocoding returns valid and invalid candidate features
    When geocoding is requested with bias 60.17 24.94 and language fi
    Then the upstream geocoding request includes bias and language parameters
    And only the valid geocode candidates are returned
    And the first valid geocode candidate confidence is clamped to 1
    And the second valid geocode candidate label is Kamppi
    And the third valid geocode candidate label is Helsinki, Uusimaa

  Scenario: Identical coordinate validation uses the nearby-stop cache
    Given geocode candidates share one coordinate and one separate coordinate
    When HSL geocode candidate validation is run
    Then nearby-stop lookup is called twice
    And only the HSL-valid geocode candidates remain

  Scenario: Geocoding fails fast without an API key
    Given geocoding has no API key
    When geocoding is requested without an API key
    Then the geocode client error is Missing DIGITRANSIT_API_KEY environment variable.

  Scenario: Invalid upstream JSON returns a deterministic error
    Given Digitransit geocoding returns invalid JSON with status 502
    When geocoding is requested with bias 60.17 24.94 and language fi
    Then the geocode client error is Digitransit geocoding invalid response (HTTP 502)
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given Digitransit geocoding returns valid and invalid candidate features$/,
        run: ({ world }) => {
          world.fetchCalls = [];
        },
      },
      {
        pattern: /^Given geocode candidates share one coordinate and one separate coordinate$/,
        run: ({ world }) => {
          world.rawCandidates = [
            { confidence: 0.9, label: "Kamppi", latitude: 60.17, longitude: 24.94 },
            { confidence: 0.8, label: "Kamppi Duplicate", latitude: 60.17, longitude: 24.94 },
            { confidence: 0.7, label: "Far Away", latitude: 60.3, longitude: 24.8 },
          ];
        },
      },
      {
        pattern: /^Given geocoding has no API key$/,
        run: () => {},
      },
      {
        pattern: /^Given Digitransit geocoding returns invalid JSON with status 502$/,
        run: ({ world }) => {
          world.fetchCalls = [];
          world.invalidJsonResponse = true;
        },
      },
      {
        pattern: /^When geocoding is requested with bias ([\d.]+) ([\d.]+) and language (.+)$/,
        run: async ({ args, world }) => {
          try {
            world.geocodeResult = await geocode({
              biasLat: Number(args[0]),
              biasLon: Number(args[1]),
              fetchImpl: async (url, init) => {
                world.fetchCalls?.push({ init, url: String(url) });
                if (world.invalidJsonResponse) {
                  return {
                    json: async () => {
                      throw new Error("invalid json");
                    },
                    ok: false,
                    status: 502,
                  } as unknown as Response;
                }
                return {
                  json: async () => ({
                    features: [
                      {
                        geometry: { coordinates: [24.94, 60.17] },
                        properties: { confidence: 2, label: "Kamppi, Helsinki" },
                      },
                      {
                        geometry: { coordinates: [999, 60.17] },
                        properties: { confidence: 0.5, label: "Invalid" },
                      },
                      {
                        geometry: { coordinates: [24.95, 60.18] },
                        properties: { confidence: 0.7, name: "Kamppi" },
                      },
                      {
                        geometry: { coordinates: [24.96, 60.19] },
                        properties: { confidence: 0.6, locality: "Helsinki", region: "Uusimaa" },
                      },
                      {
                        geometry: { coordinates: [] },
                        properties: { label: "Missing coordinates" },
                      },
                    ],
                  }),
                  ok: true,
                  status: 200,
                } as Response;
              },
              getApiKey: () => "test-key",
              lang: args[2],
              query: "Kamppi",
            });
          } catch (error) {
            world.errorMessage = error instanceof Error ? error.message : String(error);
          }
        },
      },
      {
        pattern: /^When HSL geocode candidate validation is run$/,
        run: async ({ world }) => {
          let callCount = 0;
          const validStops: NearbyStopNode[] = [
            {
              distance: 100,
              stop: {
                code: "A1",
                gtfsId: "HSL:STOP_A",
                name: "Kamppi",
              },
            },
          ];
          world.validatedCandidates = await filterHslValidCandidates(world.rawCandidates || [], {
            async getDeparturesForStopIds() {
              return new Map();
            },
            async getNearbyStops({ lat }) {
              callCount += 1;
              return lat === 60.17 ? validStops : [];
            },
            async getRoutes() {
              return [];
            },
          });
          world.nearbyStopCallCount = callCount;
        },
      },
      {
        pattern: /^When geocoding is requested without an API key$/,
        run: async ({ world }) => {
          try {
            await geocode({
              biasLat: 60.17,
              biasLon: 24.94,
              getApiKey: () => undefined,
              lang: "fi",
              query: "Kamppi",
            });
          } catch (error) {
            world.errorMessage = error instanceof Error ? error.message : String(error);
          }
        },
      },
      {
        pattern: /^Then the upstream geocoding request includes bias and language parameters$/,
        run: ({ assert, world }) => {
          const requestUrl = new URL(world.fetchCalls?.[0]?.url || "");
          assert.equal(requestUrl.searchParams.get("text"), "Kamppi");
          assert.equal(requestUrl.searchParams.get("boundary.country"), "FI");
          assert.equal(requestUrl.searchParams.get("focus.point.lat"), "60.17");
          assert.equal(requestUrl.searchParams.get("focus.point.lon"), "24.94");
          assert.equal(requestUrl.searchParams.get("lang"), "fi");
          assert.equal(
            (world.fetchCalls?.[0]?.init?.headers as Record<string, string>)?.["digitransit-subscription-key"],
            "test-key"
          );
        },
      },
      {
        pattern: /^Then only the valid geocode candidates are returned$/,
        run: ({ assert, world }) => {
          assert.equal(world.geocodeResult?.length, 3);
        },
      },
      {
        pattern: /^Then the first valid geocode candidate confidence is clamped to 1$/,
        run: ({ assert, world }) => {
          assert.equal(world.geocodeResult?.[0]?.confidence, 1);
        },
      },
      {
        pattern: /^Then the second valid geocode candidate label is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.geocodeResult?.[1]?.label, args[0]);
        },
      },
      {
        pattern: /^Then the third valid geocode candidate label is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.geocodeResult?.[2]?.label, args[0]);
        },
      },
      {
        pattern: /^Then nearby-stop lookup is called twice$/,
        run: ({ assert, world }) => {
          assert.equal(world.nearbyStopCallCount, 2);
        },
      },
      {
        pattern: /^Then only the HSL-valid geocode candidates remain$/,
        run: ({ assert, world }) => {
          assert.equal(world.validatedCandidates?.map((candidate) => candidate.label).join(" | "), "Kamppi | Kamppi Duplicate");
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
