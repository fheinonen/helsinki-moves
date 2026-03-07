const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const { createApp } = require("../scripts/app/main");
const { createTestEnvironment } = require("./helpers/frontend-app");

const featureText = `
Feature: Voice availability indicator

Scenario: Startup marks voice as unavailable when voice recording is unsupported
  Given the voice availability app is booted
  And voice recording support is unavailable
  When the voice availability initializer runs
  Then the voice action button label is "Voice Unavailable"
  And the voice action aria-label is "Voice Unavailable"
  And the voice action button disabled state is false
  And the speech transcription startup call count equals 0

Scenario: Startup enables voice search when voice recording is supported
  Given the voice availability app is booted
  When the voice availability initializer runs
  Then the voice action button label is "Voice Search"
  And the voice action aria-label is "Voice Search"
  And the voice action button disabled state is false
  And the speech transcription startup call count equals 0

Scenario: Startup enables voice search when Firefox recorder support is available
  Given the voice availability app is booted
  And Firefox voice recording support is available
  When the voice availability initializer runs
  Then the voice action button label is "Voice Search"
  And the voice action aria-label is "Voice Search"
  And the voice action button disabled state is false
  And the speech transcription startup call count equals 0
`;

function createHarness(world) {
  const harness = createTestEnvironment({
    mediaRecorderEnabled: world.mediaRecorderEnabled,
    mozMediaRecorderEnabled: world.mozMediaRecorderEnabled,
    speechRecognitionEnabled: world.speechRecognitionEnabled,
    userAgent: world.userAgent,
    voiceRecorderFallbackEnabled: world.voiceRecorderFallbackEnabled,
  });
  return {
    dom: harness.byId,
    runInitializer() {
      world.app = createApp({
        env: harness.env,
      });
    },
    async settle() {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await Promise.resolve();
    },
  };
}

defineFeature(test, featureText, {
  createWorld: () => ({
    harness: null,
    mediaRecorderEnabled: true,
    mozMediaRecorderEnabled: false,
    userAgent: "test-agent",
    speechTranscribeStartupCalls: 0,
  }),
  stepDefinitions: [
    {
      pattern: /^Given the voice availability app is booted$/,
      run: ({ world }) => {
        world.harness = createHarness(world);
      },
    },
    {
      pattern: /^Given voice recording support is unavailable$/,
      run: ({ world }) => {
        world.mediaRecorderEnabled = false;
        world.harness = createHarness(world);
      },
    },
    {
      pattern: /^Given Firefox voice recording support is available$/,
      run: ({ world }) => {
        world.mediaRecorderEnabled = false;
        world.mozMediaRecorderEnabled = true;
        world.harness = createHarness(world);
      },
    },
    {
      pattern: /^When the voice availability initializer runs$/,
      run: async ({ world }) => {
        world.harness.runInitializer();
        world.app.initialize();
        await world.harness.settle();
      },
    },
    {
      pattern: /^Then the voice action button label is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.harness.dom.voiceLocateBtnLabel.textContent, args[0]);
      },
    },
    {
      pattern: /^Then the voice action aria-label is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.harness.dom.voiceLocateBtn.getAttribute("aria-label"), args[0]);
      },
    },
    {
      pattern: /^Then the voice action button disabled state is (true|false)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.harness.dom.voiceLocateBtn.disabled, args[0] === "true");
      },
    },
    {
      pattern: /^Then the speech transcription startup call count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.speechTranscribeStartupCalls, Number(args[0]));
      },
    },
  ],
});
