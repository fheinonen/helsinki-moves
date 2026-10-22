import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createDigitransitService } from "@server/services/digitransit/client";

interface World {
  point?: { lat: number; lon: number } | null;
  service?: ReturnType<typeof createDigitransitService>;
}

defineFeature<World>(
  test,
  `
Feature: Digitransit stop point

  Scenario: A bookmarked stop lookup returns that stop point
    Given Digitransit returns a stop point for HSL:OLD
    When the stop point for HSL:OLD is requested
    Then the stop point is 60.2|24.9

  Scenario: An unknown stop lookup has no point
    Given Digitransit returns no stop point
    When the stop point for HSL:MISSING is requested
    Then the stop point is empty
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given Digitransit returns a stop point for HSL:OLD$/,
        run: ({ world }) => {
          world.service = createDigitransitService({
            fetchImpl: async () =>
              new Response(
                JSON.stringify({
                  data: {
                    stop: { lat: 60.2, lon: 24.9 },
                  },
                }),
                { status: 200 }
              ),
            getApiKey: () => "test-key",
          });
        },
      },
      {
        pattern: /^Given Digitransit returns no stop point$/,
        run: ({ world }) => {
          world.service = createDigitransitService({
            fetchImpl: async () =>
              new Response(JSON.stringify({ data: { stop: null } }), { status: 200 }),
            getApiKey: () => "test-key",
          });
        },
      },
      {
        pattern: /^When the stop point for (.+) is requested$/,
        run: async ({ args, world }) => {
          if (!world.service?.getStopPoint) {
            throw new Error("Expected stop point lookup");
          }
          world.point = await world.service.getStopPoint(args[0]);
        },
      },
      {
        pattern: /^Then the stop point is (.+)$/,
        run: ({ args, assert, world }) => {
          const actual = world.point ? `${world.point.lat}|${world.point.lon}` : "empty";
          assert.equal(actual, args[0]);
        },
      },
    ],
  }
);
