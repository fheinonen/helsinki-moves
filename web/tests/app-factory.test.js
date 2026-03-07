const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");

const featureText = `
Feature: Explicit frontend app construction

Scenario: Creating the app leaves initialization explicit without VM script ordering
  Given a frontend app environment with unsupported voice recording
  When the frontend app is created
  Then browser interval registration count equals 0
  And the frontend app is initialized
  And browser interval registration count equals 2
  Then the voice action button label is "Voice Unavailable"
  And the voice action aria-label is "Voice Unavailable"
`;

defineFeature(test, featureText, {
  createWorld: () => ({
    app: null,
    dom: {},
    harness: null,
    intervalCount: 0,
  }),
  stepDefinitions: [
    {
      pattern: /^Given a frontend app environment with unsupported voice recording$/,
      run: ({ world }) => {
        const { createTestEnvironment } = require("./helpers/frontend-app");
        world.harness = createTestEnvironment({
          mediaRecorderEnabled: false,
        });
      },
    },
    {
      pattern: /^When the frontend app is created$/,
      run: ({ world }) => {
        const { createApp } = require("../scripts/app/main");
        world.app = createApp({
          env: world.harness.env,
        });
        world.dom = world.app.dom;
      },
    },
    {
      pattern: /^(?:Then|And) the frontend app is initialized$/,
      run: ({ world }) => {
        world.app.initialize();
        world.intervalCount = world.harness.intervalCalls.length;
      },
    },
    {
      pattern: /^Then the voice action button label is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.dom.voiceLocateBtnLabel.textContent, args[0]);
      },
    },
    {
      pattern: /^Then the voice action aria-label is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.dom.voiceLocateBtn.getAttribute("aria-label"), args[0]);
      },
    },
    {
      pattern: /^(?:Then|And) browser interval registration count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        if (world.app && world.harness && world.intervalCount === 0) {
          world.intervalCount = world.harness.intervalCalls.length;
        }
        assert.equal(world.intervalCount, Number(args[0]));
      },
    },
  ],
});
