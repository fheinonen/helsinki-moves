const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const { createBareApp } = require("./helpers/frontend-app");
const { registerDataModule } = require("../scripts/app/03-data");

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
  const { app, env } = createBareApp({
    api: {
      uniqueNonEmptyStrings(values) {
        if (!Array.isArray(values)) return [];
        return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
      },
    },
  });
  registerDataModule(app, env);
  return app.api;
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
