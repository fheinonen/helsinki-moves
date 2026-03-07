const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const { createMockElement } = require("./helpers/frontend-app");
const { registerInitModule } = require("../scripts/app/04-init");

const featureText = `
Feature: Firefox interaction performance contracts

Scenario: Mode switch lets UI paint before data refresh
  Given the mode initializer script is booted with a selected location
  When the mode switch to "bus" is clicked
  Then mode state updates run before departures refresh work
  And departures refresh work is queued to the next animation frame

Scenario: Skeleton shimmer uses transform-driven animation hooks
  Given the departures stylesheet
  When skeleton loading styles are inspected
  Then skeleton blocks expose a pseudo-element shimmer layer
  And skeleton shimmer keyframes animate transform instead of background position

Scenario: Firefox drops heavy glass blur on cards
  Given the shell stylesheet
  When Firefox performance overrides are inspected
  Then the stylesheet defines a Firefox-specific supports block
  And card backdrop blur is disabled inside the Firefox block

Scenario: Legacy realtime pulse styles are removed
  Given the departures stylesheet
  When legacy realtime pulse styles are inspected
  Then the stylesheet does not include live-pill pulse styles
`;

function createEventTarget() {
  const listeners = new Map();
  const attributes = new Map();
  return {
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    dispatch(type, event = {}) {
      const handlers = listeners.get(type) || [];
      for (const handler of handlers) {
        handler(event);
      }
    },
    setAttribute(name, value) {
      attributes.set(String(name), String(value));
    },
    getAttribute(name) {
      return attributes.has(String(name)) ? attributes.get(String(name)) : null;
    },
    focus() {},
  };
}

function createModeInitHarness() {
  const calls = [];
  const rafQueue = [];
  const modeBusBtn = createEventTarget();

  const app = {
    api: {
      trackFirstManualInteraction: () => calls.push("track"),
      applyModeUiState: () => calls.push("apply"),
      persistUiState: () => calls.push("persist"),
      load: () => calls.push("load"),
      requestLocationAndLoad: () => calls.push("request-location"),
      toggleResultsLimitDropdown: () => {},
      toggleStopDropdown: () => {},
      selectResultsLimit: () => {},
      selectStop: () => {},
      toggleStopFiltersPanel: () => {},
      render: () => {},
      setStatus: () => {},
      buildStatusFromResponse: () => "",
      hideLocationPrompt: () => {},
      hydrateInitialState: () => {},
      updateClock: () => {},
      getStorageItem: () => "1",
      requestVoiceLocationAndLoad: () => {},
      reportClientError: () => {},
      refreshDeparturesOnly: () => {},
    },
    dom: {
      modeBusBtn,
      modeRailBtn: createEventTarget(),
      modeTramBtn: createEventTarget(),
      modeMetroBtn: createEventTarget(),
      locateBtn: createEventTarget(),
      voiceLocateBtn: createEventTarget(),
      resultsLimitSelectEl: createEventTarget(),
      resultsLimitSelectWrapEl: { contains: () => false },
      busStopSelectEl: createEventTarget(),
      busStopSelectWrapEl: { contains: () => false },
      stopFiltersToggleBtnEl: createEventTarget(),
      locationPromptAllowEl: createEventTarget(),
      permissionRetryBtnEl: createEventTarget(),
      busStopSelectListEl: createMockElement("ul", ["hidden"]),
      resultsLimitSelectListEl: createMockElement("ul", ["hidden"]),
      resultsLimitSelectLabelEl: { textContent: "" },
      modeEyebrowEl: { textContent: "" },
      nextLabelEl: { textContent: "" },
      skeletonEl: { classList: { add() {}, remove() {} } },
      resultEl: { classList: { add() {}, remove() {} } },
    },
    state: {
      mode: "rail",
      currentCoords: { lat: 60.1, lon: 24.9 },
      latestResponse: null,
      isVoiceListening: false,
      isLoading: false,
      stopFiltersPanelOpen: false,
    },
    constants: {
      MODE_RAIL: "rail",
      MODE_TRAM: "tram",
      MODE_METRO: "metro",
      MODE_BUS: "bus",
    },
  };

  registerInitModule(app, {
    windowRef: {
      addEventListener: () => {},
      location: { search: "", pathname: "/", hash: "" },
      history: { replaceState() {} },
      matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
      requestAnimationFrame: (callback) => {
        rafQueue.push(callback);
        return rafQueue.length;
      },
    },
    documentRef: {
      addEventListener: () => {},
      getElementById: () => null,
    },
    setIntervalRef: () => 1,
    setTimeoutRef: setTimeout,
    clearTimeoutRef: clearTimeout,
  });
  app.initialize();

  return {
    clickBusMode() {
      modeBusBtn.dispatch("click");
    },
    runNextFrame() {
      const callback = rafQueue.shift();
      if (typeof callback === "function") callback();
    },
    calls,
    rafQueue,
  };
}

defineFeature(test, featureText, {
  createWorld: () => ({
    harness: null,
    css: "",
    shellCss: "",
    callIndex: {},
    hasPseudoLayer: false,
    hasTransformShimmer: false,
    hasFirefoxBlock: false,
    hasFirefoxBackdropDisable: false,
    hasLivePillPulseStyles: false,
  }),
  stepDefinitions: [
    {
      pattern: /^Given the mode initializer script is booted with a selected location$/,
      run: ({ world }) => {
        world.harness = createModeInitHarness();
      },
    },
    {
      pattern: /^When the mode switch to "([^"]*)" is clicked$/,
      run: ({ args, world }) => {
        if (args[0] !== "bus") {
          throw new Error(`Unsupported mode in test harness: ${args[0]}`);
        }
        world.harness.clickBusMode();
      },
    },
    {
      pattern: /^Then mode state updates run before departures refresh work$/,
      run: ({ assert, world }) => {
        const applyIndex = world.harness.calls.indexOf("apply");
        const loadIndex = world.harness.calls.indexOf("load");
        world.callIndex = { applyIndex, loadIndex };
        assert.ok(applyIndex >= 0, "Expected mode UI apply to run");
        assert.equal(loadIndex, -1, "Expected departures refresh to be deferred");
      },
    },
    {
      pattern: /^Then departures refresh work is queued to the next animation frame$/,
      run: ({ assert, world }) => {
        assert.equal(world.harness.rafQueue.length > 0, true);
        world.harness.runNextFrame();
        assert.equal(world.harness.calls.includes("load"), true);
      },
    },
    {
      pattern: /^Given the departures stylesheet$/,
      run: ({ world }) => {
        world.css = fs.readFileSync(path.resolve(__dirname, "../styles/departures.css"), "utf8");
      },
    },
    {
      pattern: /^When skeleton loading styles are inspected$/,
      run: ({ world }) => {
        world.hasPseudoLayer =
          /\.skeleton-next::after/.test(world.css) && /\.skeleton-row::after/.test(world.css);
        world.hasTransformShimmer =
          /@keyframes\s+skeleton-shimmer[\s\S]*transform:\s*translateX\(/.test(world.css) &&
          !/@keyframes\s+skeleton-shimmer[\s\S]*background-position/.test(world.css);
      },
    },
    {
      pattern: /^Then skeleton blocks expose a pseudo-element shimmer layer$/,
      run: ({ assert, world }) => {
        assert.equal(world.hasPseudoLayer, true);
      },
    },
    {
      pattern: /^Then skeleton shimmer keyframes animate transform instead of background position$/,
      run: ({ assert, world }) => {
        assert.equal(world.hasTransformShimmer, true);
      },
    },
    {
      pattern: /^Given the shell stylesheet$/,
      run: ({ world }) => {
        world.shellCss = fs.readFileSync(path.resolve(__dirname, "../styles/shell.css"), "utf8");
      },
    },
    {
      pattern: /^When Firefox performance overrides are inspected$/,
      run: ({ world }) => {
        const firefoxBlockMatch = world.shellCss.match(
          /@supports\s*\(\s*-moz-appearance:\s*none\s*\)\s*\{([\s\S]*?)\}\s*$/
        );
        world.hasFirefoxBlock = Boolean(firefoxBlockMatch);
        world.hasFirefoxBackdropDisable = Boolean(
          firefoxBlockMatch && /\.card\s*\{[\s\S]*backdrop-filter:\s*none;/.test(firefoxBlockMatch[1])
        );
      },
    },
    {
      pattern: /^Then the stylesheet defines a Firefox-specific supports block$/,
      run: ({ assert, world }) => {
        assert.equal(world.hasFirefoxBlock, true);
      },
    },
    {
      pattern: /^Then card backdrop blur is disabled inside the Firefox block$/,
      run: ({ assert, world }) => {
        assert.equal(world.hasFirefoxBackdropDisable, true);
      },
    },
    {
      pattern: /^When legacy realtime pulse styles are inspected$/,
      run: ({ world }) => {
        world.hasLivePillPulseStyles = /\.live-pill::before/.test(world.css);
      },
    },
    {
      pattern: /^Then the stylesheet does not include live-pill pulse styles$/,
      run: ({ assert, world }) => {
        assert.equal(world.hasLivePillPulseStyles, false);
      },
    },
  ],
});
