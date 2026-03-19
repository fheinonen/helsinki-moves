import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  parsePromptDepartureRequests,
  parsePromptLocationQuery,
  type PromptDepartureRequest,
} from "@client/create/prompt-departure-requests";

interface World {
  locationQuery?: string | null;
  prompt?: string;
  requests?: PromptDepartureRequest[];
}

defineFeature<World>(
  test,
  `
Feature: Prompt departure requests

  Scenario: A prompt can request tram and bus lines together
    Given the prompt asks for tram lines 6 and 2 and bus 67
    When the prompt departure requests are parsed
    Then the parsed requests include tram lines 6 and 2
    And the parsed requests include bus line 67

  Scenario: A prompt with plural mode names still keeps all requested lines
    Given the prompt asks for trams 6 and 2 and buses 67 and 23
    When the prompt departure requests are parsed
    Then the parsed requests include tram lines 6 and 2
    And the parsed requests include bus lines 67 and 23

  Scenario: A prompt can request a single destination for one line
    Given the prompt asks for tram 2 to Messukeskus
    When the prompt departure requests are parsed
    Then the parsed requests include tram line 2
    And the parsed requests include tram destination Messukeskus

  Scenario: A prompt can say only one destination from a line
    Given the prompt asks for only Messukeskus destination from tram 2
    When the prompt departure requests are parsed
    Then the parsed requests include tram line 2
    And the parsed requests include tram destination Messukeskus

  Scenario: A prompt can request multiple modes from a named place
    Given the prompt asks for buses and trams from Kampin kauppakeskus
    When the prompt departure requests are parsed
    Then the parsed requests include tram without line filters
    And the parsed requests include bus without line filters
    And the parsed prompt location is Kampin kauppakeskus

  Scenario: An address-like location does not leak its street number into the bus line
    Given the prompt asks for bus 59 towards Pasila from Talontie 17
    When the prompt departure requests are parsed
    Then the parsed requests include bus line 59 only
    And the parsed requests include bus destination Pasila
    And the parsed prompt location is Talontie 17

  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the prompt asks for tram lines 6 and 2 and bus 67$/,
        run: ({ world }) => {
          world.prompt = "build board for tram lines 6 and 2 and bus 67";
        },
      },
      {
        pattern: /^When the prompt departure requests are parsed$/,
        run: ({ world }) => {
          const prompt = String(world.prompt || "");
          world.requests = parsePromptDepartureRequests(prompt);
          world.locationQuery = parsePromptLocationQuery(prompt);
        },
      },
      {
        pattern: /^Then the parsed requests include tram lines 6 and 2$/,
        run: ({ assert, world }) => {
          assert.equal(
            JSON.stringify(world.requests?.find((request) => request.mode === "TRAM")?.lines),
            JSON.stringify(["6", "2"])
          );
        },
      },
      {
        pattern: /^Then the parsed requests include bus line 67$/,
        run: ({ assert, world }) => {
          assert.equal(
            JSON.stringify(world.requests?.find((request) => request.mode === "BUS")?.lines),
            JSON.stringify(["67"])
          );
        },
      },
      {
        pattern: /^Given the prompt asks for trams 6 and 2 and buses 67 and 23$/,
        run: ({ world }) => {
          world.prompt = "build board for trams 6 and 2 and buses 67 and 23";
        },
      },
      {
        pattern: /^Then the parsed requests include bus lines 67 and 23$/,
        run: ({ assert, world }) => {
          assert.equal(
            JSON.stringify(world.requests?.find((request) => request.mode === "BUS")?.lines),
            JSON.stringify(["67", "23"])
          );
        },
      },
      {
        pattern: /^Given the prompt asks for tram 2 to Messukeskus$/,
        run: ({ world }) => {
          world.prompt = "build board for tram 2 to Messukeskus";
        },
      },
      {
        pattern: /^Given the prompt asks for only Messukeskus destination from tram 2$/,
        run: ({ world }) => {
          world.prompt = "build board for only Messukeskus destination from tram 2";
        },
      },
      {
        pattern: /^Given the prompt asks for buses and trams from Kampin kauppakeskus$/,
        run: ({ world }) => {
          world.prompt = "build board for buses and trams from Kampin kauppakeskus";
        },
      },
      {
        pattern: /^Given the prompt asks for bus 59 towards Pasila from Talontie 17$/,
        run: ({ world }) => {
          world.prompt = "i want to take the bus from talontie 17 with bus 59 towards pasila";
        },
      },
      {
        pattern: /^Then the parsed requests include tram line 2$/,
        run: ({ assert, world }) => {
          assert.equal(
            JSON.stringify(world.requests?.find((request) => request.mode === "TRAM")?.lines),
            JSON.stringify(["2"])
          );
        },
      },
      {
        pattern: /^(Then|And) the parsed requests include tram destination Messukeskus$/,
        run: ({ assert, world }) => {
          assert.equal(
            JSON.stringify(world.requests?.find((request) => request.mode === "TRAM")?.destinations),
            JSON.stringify(["Messukeskus"])
          );
        },
      },
      {
        pattern: /^Then the parsed requests include tram without line filters$/,
        run: ({ assert, world }) => {
          assert.equal(
            JSON.stringify(world.requests?.find((request) => request.mode === "TRAM")?.lines),
            JSON.stringify([])
          );
        },
      },
      {
        pattern: /^(Then|And) the parsed requests include bus without line filters$/,
        run: ({ assert, world }) => {
          assert.equal(
            JSON.stringify(world.requests?.find((request) => request.mode === "BUS")?.lines),
            JSON.stringify([])
          );
        },
      },
      {
        pattern: /^(Then|And) the parsed prompt location is Kampin kauppakeskus$/,
        run: ({ assert, world }) => {
          assert.equal(world.locationQuery, "Kampin kauppakeskus");
        },
      },
      {
        pattern: /^Then the parsed requests include bus line 59 only$/,
        run: ({ assert, world }) => {
          assert.equal(
            JSON.stringify(world.requests?.find((request) => request.mode === "BUS")?.lines),
            JSON.stringify(["59"])
          );
        },
      },
      {
        pattern: /^(Then|And) the parsed requests include bus destination Pasila$/,
        run: ({ assert, world }) => {
          assert.equal(
            JSON.stringify(world.requests?.find((request) => request.mode === "BUS")?.destinations),
            JSON.stringify(["pasila"])
          );
        },
      },
      {
        pattern: /^(Then|And) the parsed prompt location is Talontie 17$/,
        run: ({ assert, world }) => {
          assert.equal(world.locationQuery, "talontie 17");
        },
      },
    ],
  }
);
