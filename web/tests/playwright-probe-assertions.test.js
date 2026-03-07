const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const { assertProbeAware } = require("./helpers/playwright-probe-assertions");

const featureText = `
Feature: Playwright fail-first probe assertions

Scenario: Real run waits before verifying the observed value
  Given observed value starts at 0 and later becomes 2
  When the observed value is verified without probe mode
  Then the wait hook was called
  And the verification succeeds

Scenario: Fail-first probe verifies immediately without waiting
  Given observed value starts at 0 and later becomes 2
  When the observed value is verified in probe mode
  Then the wait hook was not called
  And the verification fails immediately
`;

defineFeature(test, featureText, {
  createWorld: () => ({
    actualValue: 0,
    waitCalled: false,
    verificationPassed: false,
    verificationError: null,
    probe: false,
  }),
  stepDefinitions: [
    {
      pattern: /^Given observed value starts at 0 and later becomes 2$/,
      run: ({ world }) => {
        world.actualValue = 0;
        world.waitCalled = false;
        world.verificationPassed = false;
        world.verificationError = null;
      },
    },
    {
      pattern: /^When the observed value is verified without probe mode$/,
      run: async ({ world }) => {
        world.probe = false;
        try {
          await assertProbeAware({
            probe: world.probe,
            waitFor: async () => {
              world.waitCalled = true;
              world.actualValue = 2;
            },
            read: async () => world.actualValue,
            verify: (actual) => {
              if (actual !== 2) {
                throw new Error(`Expected 2, got ${actual}`);
              }
              world.verificationPassed = true;
            },
          });
        } catch (error) {
          world.verificationError = error;
        }
      },
    },
    {
      pattern: /^When the observed value is verified in probe mode$/,
      run: async ({ world }) => {
        world.probe = true;
        try {
          await assertProbeAware({
            probe: world.probe,
            waitFor: async () => {
              world.waitCalled = true;
              world.actualValue = 2;
            },
            read: async () => world.actualValue,
            verify: (actual) => {
              if (actual !== 2) {
                throw new Error(`Expected 2, got ${actual}`);
              }
              world.verificationPassed = true;
            },
          });
        } catch (error) {
          world.verificationError = error;
        }
      },
    },
    {
      pattern: /^Then the wait hook was called$/,
      run: ({ assert, world }) => {
        assert.equal(world.waitCalled, true);
      },
    },
    {
      pattern: /^Then the wait hook was not called$/,
      run: ({ assert, world }) => {
        assert.equal(world.waitCalled, false);
      },
    },
    {
      pattern: /^Then the verification succeeds$/,
      run: ({ assert, world }) => {
        assert.equal(world.verificationPassed, true);
        assert.equal(world.verificationError, null);
      },
    },
    {
      pattern: /^Then the verification fails immediately$/,
      run: ({ assert, world }) => {
        assert.equal(world.verificationPassed, false);
        assert.equal(world.verificationError instanceof Error, true);
        assert.equal(world.verificationError?.message, "Expected 2, got 0");
      },
    },
  ],
});
