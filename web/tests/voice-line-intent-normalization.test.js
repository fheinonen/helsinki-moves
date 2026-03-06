const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { defineFeature } = require("./helpers/bdd");

const featureText = `
Feature: Voice line intent normalization

Scenario: Treat numeric transcript with trailing period as a line number
  Given voice line-intent parsing is booted
  When voice line intent is parsed from "10."
  Then parsed voice line equals "10"
  And parsed voice line mode equals ""

Scenario: Treat explicit bus transcript with trailing period as a line number
  Given voice line-intent parsing is booted
  When voice line intent is parsed from "bus 10."
  Then parsed voice line equals "10"
  And parsed voice line mode equals "bus"

Scenario: Treat letter transcript with trailing period as a line token
  Given voice line-intent parsing is booted
  When voice line intent is parsed from "A."
  Then parsed voice line equals "A"
  And parsed voice line mode equals ""
`;

function bootVoiceLineIntentApi() {
  const scriptPath = path.resolve(__dirname, "../scripts/app/03-data.js");
  const scriptText = fs.readFileSync(scriptPath, "utf8");
  const context = {
    window: {
      HMApp: {
        api: {
          uniqueNonEmptyStrings(values) {
            if (!Array.isArray(values)) return [];
            return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
          },
        },
        dom: {},
        state: {
          mode: "rail",
          currentCoords: null,
        },
        constants: {
          MODE_RAIL: "rail",
          MODE_TRAM: "tram",
          MODE_METRO: "metro",
          MODE_BUS: "bus",
          FETCH_TIMEOUT_MS: 8000,
          VOICE_SILENCE_STOP_MS: 1200,
          VOICE_RECOGNITION_TIMEOUT_MS: 1000,
          VOICE_QUERY_MIN_LENGTH: 3,
        },
      },
    },
    navigator: {},
    fetch: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      async json() {
        return {};
      },
    }),
    document: {
      createElement: () => ({
        addEventListener() {},
      }),
    },
    URLSearchParams,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Object,
    Array,
    Set,
    Promise,
    RegExp,
    Error,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
  };

  vm.createContext(context);
  vm.runInContext(scriptText, context, { filename: scriptPath });
  return context.window.HMApp.api;
}

defineFeature(test, featureText, {
  createWorld: () => ({
    api: null,
    parsedIntent: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given voice line-intent parsing is booted$/,
      run: ({ world }) => {
        world.api = bootVoiceLineIntentApi();
      },
    },
    {
      pattern: /^When voice line intent is parsed from "([^"]*)"$/,
      run: ({ args, world }) => {
        world.parsedIntent = world.api.parseVoiceLineIntent(args[0]);
      },
    },
    {
      pattern: /^Then parsed voice line equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(String(world.parsedIntent?.line || ""), args[0]);
      },
    },
    {
      pattern: /^Then parsed voice line mode equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(String(world.parsedIntent?.mode || ""), args[0]);
      },
    },
  ],
});
