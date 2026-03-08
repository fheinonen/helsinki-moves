import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createGeocodeService, type GeocodeService } from "@server/services/geocode/geocode-service";
import type { GeocodeSuccessResponse } from "@shared/contracts/geocode-contract";
import type { NearbyStopNode } from "@server/services/digitransit/types";

interface World {
  nearbyStopsByText?: Map<string, NearbyStopNode[]>;
  response?: GeocodeSuccessResponse;
  service?: GeocodeService;
}

function createNearbyStop(name: string): NearbyStopNode {
  return {
    distance: 100,
    stop: {
      code: "A1",
      gtfsId: `HSL:${name}`,
      name,
    },
  };
}

defineFeature<World>(
  test,
  `
Feature: Geocode service

  Scenario: Geocode service returns the no-match payload when HSL validation removes all candidates
    Given upstream geocoding returns one parsed Kamppi candidate without nearby HSL stops
    When the geocode service resolves Kamppi
    Then the geocode service response is not ambiguous
    And the geocode service location is empty
    And the geocode service message is No matching location found in HSL area.

  Scenario: Geocode service returns ambiguity when two valid Kamppi matches survive filtering
    Given upstream geocoding returns two valid Kamppi candidates with nearby HSL stops
    When the geocode service resolves Kamppi
    Then the geocode service response is ambiguous
    And the geocode service choices are Kamppi, Helsinki | Kamppi Center, Helsinki
    And the geocode service location label is Kamppi, Helsinki
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given upstream geocoding returns one parsed Kamppi candidate without nearby HSL stops$/,
        run: ({ world }) => {
          world.nearbyStopsByText = new Map([["Kamppi", []]]);
          world.service = createGeocodeService({
            digitransitService: {
              async getDeparturesForStopIds() {
                return new Map();
              },
              async getNearbyStops({ lat }) {
                return lat === 60.17 ? [] : [];
              },
            },
            fetchImpl: async () =>
              ({
                json: async () => ({
                  features: [
                    {
                      geometry: { coordinates: [24.94, 60.17] },
                      properties: { confidence: 0.9, label: "Kamppi, Helsinki" },
                    },
                  ],
                }),
                ok: true,
                status: 200,
              }) as Response,
            getApiKey: () => "test-key",
          });
        },
      },
      {
        pattern: /^Given upstream geocoding returns two valid Kamppi candidates with nearby HSL stops$/,
        run: ({ world }) => {
          world.service = createGeocodeService({
            digitransitService: {
              async getDeparturesForStopIds() {
                return new Map();
              },
              async getNearbyStops({ lat }) {
                if (lat === 60.17) {
                  return [createNearbyStop("Kamppi")];
                }
                if (lat === 60.1705) {
                  return [createNearbyStop("Kamppi Center")];
                }
                return [];
              },
            },
            fetchImpl: async (url) => {
              const query = new URL(String(url)).searchParams.get("text");
              const features =
                query === "Kamppi"
                  ? [
                      {
                        geometry: { coordinates: [24.94, 60.17] },
                        properties: { confidence: 0.95, label: "Kamppi, Helsinki" },
                      },
                      {
                        geometry: { coordinates: [24.941, 60.1705] },
                        properties: { confidence: 0.9, label: "Kamppi Center, Helsinki" },
                      },
                    ]
                  : [];
              return {
                json: async () => ({ features }),
                ok: true,
                status: 200,
              } as Response;
            },
            getApiKey: () => "test-key",
          });
        },
      },
      {
        pattern: /^When the geocode service resolves Kamppi$/,
        run: async ({ world }) => {
          if (!world.service) {
            throw new Error("Expected geocode service");
          }
          world.response = await world.service.resolve({
            biasLat: 60.17,
            biasLon: 24.94,
            lang: "fi",
            query: "Kamppi",
          });
        },
      },
      {
        pattern: /^Then the geocode service response is not ambiguous$/,
        run: ({ assert, world }) => {
          assert.equal(world.response?.ambiguous, false);
        },
      },
      {
        pattern: /^Then the geocode service location is empty$/,
        run: ({ assert, world }) => {
          assert.equal(world.response?.location, null);
        },
      },
      {
        pattern: /^Then the geocode service message is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.response?.message, args[0]);
        },
      },
      {
        pattern: /^Then the geocode service response is ambiguous$/,
        run: ({ assert, world }) => {
          assert.equal(world.response?.ambiguous, true);
        },
      },
      {
        pattern: /^Then the geocode service choices are (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.response?.choices.map((choice) => choice.label).join(" | "), args[0]);
        },
      },
      {
        pattern: /^Then the geocode service location label is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.response?.location?.label, args[0]);
        },
      },
    ],
  }
);
