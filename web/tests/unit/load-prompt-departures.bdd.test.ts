import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { loadPromptDepartures } from "@client/create/load-prompt-departures";
import type { DeparturesClient } from "@client/services/departures-client";
import type { GeocodeClient } from "@client/services/geocode-client";
import type { TravelIntentClient } from "@client/services/travel-intent-client";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { Mode } from "@shared/domain/mode";

interface DeparturesCall {
  coords: { lat: number; lon: number };
  destinations: string[];
  lineIntent?: boolean;
  lines: string[];
  mode: string;
}

interface World {
  calls?: DeparturesCall[];
  geocodeQueries?: string[];
  intentPrompts?: string[];
  result?: Awaited<ReturnType<typeof loadPromptDepartures>>;
  responses?: DeparturesSuccessResponse[];
}

function createResponse(mode: Mode): DeparturesSuccessResponse {
  return {
    filterOptions: {
      destinations: [],
      lines: [],
    },
    mode,
    selectedStopId: null,
    station: {
      departures:
        mode === "TRAM"
          ? [
              {
                departureIso: "2026-03-21T10:05:00.000Z",
                destination: "Messukeskus via Kamppi",
                line: "2",
              },
              {
                departureIso: "2026-03-21T10:09:00.000Z",
                destination: "Olympiaterm. via Kauppatori",
                line: "2",
              },
            ]
          : [
              {
                departureIso: "2026-03-21T10:07:00.000Z",
                destination: "Torpparinmäki via Maunula",
                line: "67",
              },
            ],
      distanceMeters: 10,
      stopCode: mode === "TRAM" ? "H0301" : "H2050",
      stopCodes: [mode === "TRAM" ? "H0301" : "H2050"],
      stopName: mode === "TRAM" ? "Päärautatieasema" : "Rautatientori",
      type: "stop",
    },
    stops: [],
  };
}

function createClient(world: World): DeparturesClient {
  world.calls = [];
  return {
    async getDepartures(input) {
      world.calls?.push({
        coords: input.coords,
        destinations: input.destinations,
        lineIntent: input.lineIntent,
        lines: input.lines,
        mode: input.mode,
      });
      return world.responses?.shift() || createResponse(input.mode);
    },
  };
}

function createGeocodeClient(world: World): GeocodeClient {
  world.geocodeQueries = [];
  return {
    async resolve(input) {
      world.geocodeQueries?.push(input.query);
      return {
        ambiguous: false,
        choices: [],
        location: {
          confidence: 0.9,
          label: "Kampin kauppakeskus, Helsinki",
          latitude: 60.1695,
          longitude: 24.9321,
        },
        query: input.query,
      };
    },
  };
}

function createTravelIntentClient(world: World): TravelIntentClient {
  world.intentPrompts = [];
  return {
    async parse(input) {
      world.intentPrompts?.push(input.prompt);
      return {
        locationQuery: null,
        requests: [
          {
            destinations: ["Tripla"],
            lines: [],
            mode: "BUS",
          },
        ],
      };
    },
  };
}

defineFeature<World>(
  test,
  `
Feature: Prompt departures loading

  Scenario: A generated tram request forwards a destination filter
    Given a prompt departures client stub
    When prompt departures are loaded for tram 2 to Messukeskus
    Then the generated departures request includes tram line 2
    And the generated departures request includes destination Messukeskus

  Scenario: Mixed prompt departures are loaded in prompt order
    Given a prompt departures client stub
    When prompt departures are loaded for tram 2 to Messukeskus and bus 67
    Then the first generated departures request is tram
    And the second generated departures request is bus

  Scenario: A prompt location is geocoded before loading multiple modes
    Given a prompt departures client stub
    When prompt departures are loaded for buses and trams from Kampin kauppakeskus
    Then the prompt geocode query is Kampin kauppakeskus
    And the first generated departures request uses geocoded coordinates
    And the second generated departures request uses geocoded coordinates

  Scenario: A destination-only travel prompt requires a starting location
    Given a prompt departures client stub
    When prompt departures are loaded for bus to Elielinaukio
    Then prompt departures loading requires location
    And prompt departures loading makes no departures request

  Scenario: A travel prompt can use llm intent when the parser misses destination-before-mode phrasing
    Given a prompt departures client stub
    When prompt departures are loaded for go to Tripla by bus with llm intent
    Then prompt departures loading requires location
    And prompt departures loading makes no departures request
    And the prompt intent model receives i want to go to tripla by bus

  Scenario: A natural destination prompt still uses llm intent when local parsing finds nothing
    Given a prompt departures client stub
    When prompt departures are loaded for let's go to Mall of Tripla with llm intent
    Then prompt departures loading requires location
    And prompt departures loading makes no departures request
    And the prompt intent model receives let's go to Mall of Tripla

  Scenario: A typed starting place clears the location requirement for a natural destination prompt
    Given a prompt departures client stub
    When prompt departures are loaded for let's go to Mall of Tripla with a typed starting place
    Then prompt departures loading succeeds
    And prompt departures loading makes 1 departures request
    And the prompt geocode query is Kamppi

  Scenario: A low-confidence destination match requires clarification
    Given a prompt departures client stub
    And departures respond with low-confidence destination clarification
    When prompt departures are loaded for bus 59 from Talontie 17 to Tripla
    Then prompt departures loading requires destination clarification
    And prompt departures loading suggests Herttoniemi(M) via Pasila as.
    And prompt departures loading identifies bus destination Tripla
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a prompt departures client stub$/,
        run: ({ world }) => {
          world.calls = [];
          world.responses = [];
        },
      },
      {
        pattern: /^When prompt departures are loaded for tram 2 to Messukeskus$/,
        run: async ({ world }) => {
          world.result = await loadPromptDepartures({
            client: createClient(world),
            coords: { lat: 60.171, lon: 24.9414 },
            geocodeClient: createGeocodeClient(world),
            onPartial: () => {},
            prompt: "build board for tram 2 to Messukeskus",
            signal: new AbortController().signal,
          });
        },
      },
      {
        pattern: /^When prompt departures are loaded for tram 2 to Messukeskus and bus 67$/,
        run: async ({ world }) => {
          world.result = await loadPromptDepartures({
            client: createClient(world),
            coords: { lat: 60.171, lon: 24.9414 },
            geocodeClient: createGeocodeClient(world),
            onPartial: () => {},
            prompt: "build board for tram 2 to Messukeskus and bus 67",
            signal: new AbortController().signal,
          });
        },
      },
      {
        pattern: /^When prompt departures are loaded for buses and trams from Kampin kauppakeskus$/,
        run: async ({ world }) => {
          world.result = await loadPromptDepartures({
            client: createClient(world),
            coords: { lat: 60.171, lon: 24.9414 },
            geocodeClient: createGeocodeClient(world),
            onPartial: () => {},
            prompt: "build board for buses and trams from Kampin kauppakeskus",
            signal: new AbortController().signal,
          });
        },
      },
      {
        pattern: /^When prompt departures are loaded for bus to Elielinaukio$/,
        run: async ({ world }) => {
          world.result = await loadPromptDepartures({
            client: createClient(world),
            coords: { lat: 60.171, lon: 24.9414 },
            geocodeClient: createGeocodeClient(world),
            onPartial: () => {},
            prompt: "i want to take bus to Elielinaukio",
            signal: new AbortController().signal,
          });
        },
      },
      {
        pattern: /^When prompt departures are loaded for go to Tripla by bus with llm intent$/,
        run: async ({ world }) => {
          world.result = await loadPromptDepartures({
            client: createClient(world),
            coords: { lat: 60.171, lon: 24.9414 },
            geocodeClient: createGeocodeClient(world),
            onPartial: () => {},
            prompt: "i want to go to tripla by bus",
            signal: new AbortController().signal,
            travelIntentClient: createTravelIntentClient(world),
          });
        },
      },
      {
        pattern: /^When prompt departures are loaded for let's go to Mall of Tripla with llm intent$/,
        run: async ({ world }) => {
          world.result = await loadPromptDepartures({
            client: createClient(world),
            coords: { lat: 60.171, lon: 24.9414 },
            geocodeClient: createGeocodeClient(world),
            onPartial: () => {},
            prompt: "let's go to Mall of Tripla",
            signal: new AbortController().signal,
            travelIntentClient: createTravelIntentClient(world),
          });
        },
      },
      {
        pattern: /^When prompt departures are loaded for let's go to Mall of Tripla with a typed starting place$/,
        run: async ({ world }) => {
          world.result = await loadPromptDepartures({
            client: createClient(world),
            coords: { lat: 60.171, lon: 24.9414 },
            geocodeClient: createGeocodeClient(world),
            onPartial: () => {},
            originOverride: { query: "Kamppi", type: "typed-location" },
            prompt: "let's go to Mall of Tripla",
            signal: new AbortController().signal,
            travelIntentClient: createTravelIntentClient(world),
          });
        },
      },
      {
        pattern: /^When prompt departures are loaded for bus 59 from Talontie 17 to Tripla$/,
        run: async ({ world }) => {
          world.result = await loadPromptDepartures({
            client: createClient(world),
            coords: { lat: 60.171, lon: 24.9414 },
            geocodeClient: createGeocodeClient(world),
            onPartial: () => {},
            originOverride: { query: "Talontie 17", type: "typed-location" },
            prompt: "i want to take bus 59 to Tripla",
            signal: new AbortController().signal,
          });
        },
      },
      {
        pattern: /^(Given|And) departures respond with low-confidence destination clarification$/,
        run: ({ world }) => {
          world.responses = [
            {
              destinationResolution: {
                confidence: 0.62,
                input: "Tripla",
                suggestions: ["Herttoniemi(M) via Pasila as.", "Kamppi"],
                type: "needs-clarification",
              },
              filterOptions: {
                destinations: [],
                lines: [],
              },
              mode: "BUS",
              selectedStopId: "HSL:STOP_BUS",
              station: {
                departures: [],
                distanceMeters: 10,
                stopCode: "H1514",
                stopCodes: ["H1514"],
                stopName: "Talontie",
                type: "stop",
              },
              stops: [],
            },
          ];
        },
      },
      {
        pattern: /^Then the generated departures request includes tram line 2$/,
        run: ({ assert, world }) => {
          assert.equal(JSON.stringify(world.calls?.[0]?.lines), JSON.stringify(["2"]));
        },
      },
      {
        pattern: /^Then the first generated departures request is tram$/,
        run: ({ assert, world }) => {
          assert.equal(world.calls?.[0]?.mode, "TRAM");
        },
      },
      {
        pattern: /^(Then|And) the second generated departures request is bus$/,
        run: ({ assert, world }) => {
          assert.equal(world.calls?.[1]?.mode, "BUS");
        },
      },
      {
        pattern: /^(Then|And) the generated departures request includes destination Messukeskus$/,
        run: ({ assert, world }) => {
          assert.equal(
            JSON.stringify(world.calls?.[0]?.destinations),
            JSON.stringify(["Messukeskus"])
          );
        },
      },
      {
        pattern: /^(Then|And) the prompt geocode query is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.geocodeQueries?.[0], args[1]);
        },
      },
      {
        pattern: /^(Then|And) the first generated departures request uses geocoded coordinates$/,
        run: ({ assert, world }) => {
          assert.equal(JSON.stringify(world.calls?.[0]?.coords), JSON.stringify({ lat: 60.1695, lon: 24.9321 }));
        },
      },
      {
        pattern: /^(Then|And) the second generated departures request uses geocoded coordinates$/,
        run: ({ assert, world }) => {
          assert.equal(JSON.stringify(world.calls?.[1]?.coords), JSON.stringify({ lat: 60.1695, lon: 24.9321 }));
        },
      },
      {
        pattern: /^Then prompt departures loading requires location$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.status, "needs-location");
        },
      },
      {
        pattern: /^Then prompt departures loading succeeds$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.status, "ok");
        },
      },
      {
        pattern: /^(Then|And) prompt departures loading makes no departures request$/,
        run: ({ assert, world }) => {
          assert.equal(world.calls?.length || 0, 0);
        },
      },
      {
        pattern: /^(Then|And) prompt departures loading makes 1 departures request$/,
        run: ({ assert, world }) => {
          assert.equal(world.calls?.length || 0, 1);
        },
      },
      {
        pattern: /^(?:Then|And) the prompt intent model receives (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.intentPrompts?.[0], args[0]);
        },
      },
      {
        pattern: /^Then prompt departures loading requires destination clarification$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.status, "needs-destination-clarification");
        },
      },
      {
        pattern: /^(Then|And) prompt departures loading suggests Herttoniemi\(M\) via Pasila as\.$/,
        run: ({ assert, world }) => {
          if (world.result?.status !== "needs-destination-clarification") {
            throw new Error("Expected destination clarification result");
          }
          assert.equal(
            world.result.suggestions.includes("Herttoniemi(M) via Pasila as."),
            true
          );
        },
      },
      {
        pattern: /^(Then|And) prompt departures loading identifies bus destination Tripla$/,
        run: ({ assert, world }) => {
          if (world.result?.status !== "needs-destination-clarification") {
            throw new Error("Expected destination clarification result");
          }
          assert.equal(world.result.mode, "BUS");
          assert.equal(world.result.inputDestination, "Tripla");
        },
      },
    ],
  }
);
