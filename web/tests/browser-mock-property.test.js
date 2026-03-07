const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const {
  installMockProperty,
  installMockGetUserMedia,
} = require("./helpers/browser-mock-property");

const featureText = `
Feature: Browser global mock installation

Scenario: Override a getter-only browser global
  Given a window-like target exposes "MediaRecorder" through a getter-only property
  When a browser mock named "MediaRecorder" is installed
  Then the mock installation succeeds
  And reading "MediaRecorder" returns the mock

Scenario: Override a browser global when assignment throws
  Given a window-like target throws when "prompt" is assigned
  When a browser mock named "prompt" is installed
  Then the mock installation succeeds
  And reading "prompt" returns the mock

Scenario: Replace mediaDevices when getUserMedia cannot be overridden directly
  Given a navigator-like target blocks "getUserMedia" replacement on "mediaDevices"
  When a getUserMedia mock is installed
  Then the mock installation succeeds
  And reading "mediaDevices.getUserMedia" returns the mock
`;

function createGetterOnlyTarget(propertyName) {
  const target = {};
  Object.defineProperty(target, propertyName, {
    configurable: true,
    enumerable: true,
    get() {
      return null;
    },
  });
  return target;
}

function createThrowingAssignmentTarget(propertyName) {
  const target = {};
  Object.defineProperty(target, propertyName, {
    configurable: true,
    enumerable: true,
    get() {
      return null;
    },
    set() {
      throw new Error("assignment blocked");
    },
  });
  return target;
}

function createNavigatorWithLockedGetUserMedia() {
  const mediaDevices = {};
  Object.defineProperty(mediaDevices, "getUserMedia", {
    configurable: false,
    enumerable: true,
    get() {
      return null;
    },
    set() {
      throw new Error("assignment blocked");
    },
  });

  const navigatorTarget = {};
  Object.defineProperty(navigatorTarget, "mediaDevices", {
    configurable: true,
    enumerable: true,
    get() {
      return mediaDevices;
    },
  });

  return navigatorTarget;
}

defineFeature(test, featureText, {
  createWorld: () => ({
    propertyName: "",
    target: null,
    mockValue: null,
    installResult: false,
  }),
  stepDefinitions: [
    {
      pattern: /^Given a window-like target exposes "([^"]*)" through a getter-only property$/,
      run: ({ args, world }) => {
        world.propertyName = args[0];
        world.target = createGetterOnlyTarget(world.propertyName);
        world.mockValue = function mockBrowserGlobal() {};
      },
    },
    {
      pattern: /^Given a window-like target throws when "([^"]*)" is assigned$/,
      run: ({ args, world }) => {
        world.propertyName = args[0];
        world.target = createThrowingAssignmentTarget(world.propertyName);
        world.mockValue = function mockBrowserGlobal() {};
      },
    },
    {
      pattern: /^When a browser mock named "([^"]*)" is installed$/,
      run: ({ assert, args, world }) => {
        assert.equal(args[0], world.propertyName);
        world.installResult = installMockProperty(world.target, world.propertyName, world.mockValue);
      },
    },
    {
      pattern: /^Given a navigator-like target blocks "([^"]*)" replacement on "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(args[0], "getUserMedia");
        assert.equal(args[1], "mediaDevices");
        world.propertyName = "mediaDevices.getUserMedia";
        world.target = createNavigatorWithLockedGetUserMedia();
        world.mockValue = async function mockGetUserMedia() {
          return null;
        };
      },
    },
    {
      pattern: /^When a getUserMedia mock is installed$/,
      run: ({ world }) => {
        world.installResult = installMockGetUserMedia(world.target, world.mockValue);
      },
    },
    {
      pattern: /^Then the mock installation succeeds$/,
      run: ({ assert, world }) => {
        assert.equal(world.installResult, true);
      },
    },
    {
      pattern: /^Then reading "([^"]*)" returns the mock$/,
      run: ({ assert, args, world }) => {
        assert.equal(args[0], world.propertyName);
        if (world.propertyName === "mediaDevices.getUserMedia") {
          assert.equal(world.target.mediaDevices.getUserMedia, world.mockValue);
          return;
        }
        assert.equal(world.target[world.propertyName], world.mockValue);
      },
    },
  ],
});
