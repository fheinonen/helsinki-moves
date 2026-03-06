const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { defineFeature } = require("./helpers/bdd");

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
`;

function createClassList(initialClasses = []) {
  const set = new Set(initialClasses);
  return {
    add: (...names) => names.forEach((name) => set.add(name)),
    remove: (...names) => names.forEach((name) => set.delete(name)),
    toggle(name, force) {
      if (force === true) {
        set.add(name);
        return true;
      }
      if (force === false) {
        set.delete(name);
        return false;
      }
      if (set.has(name)) {
        set.delete(name);
        return false;
      }
      set.add(name);
      return true;
    },
    contains: (name) => set.has(name),
  };
}

function createMockElement(tagName = "div", initialClasses = []) {
  const attributes = new Map();
  const listeners = new Map();
  const classList = createClassList(initialClasses);
  return {
    tagName: String(tagName || "div").toUpperCase(),
    textContent: "",
    innerHTML: "",
    disabled: false,
    onclick: null,
    classList,
    style: {
      setProperty() {},
    },
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    replaceChildren(...nodes) {
      this.children = [...nodes];
    },
    setAttribute(name, value) {
      attributes.set(String(name), String(value));
    },
    getAttribute(name) {
      return attributes.has(String(name)) ? attributes.get(String(name)) : null;
    },
    removeAttribute(name) {
      attributes.delete(String(name));
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    dispatch(type, event = {}) {
      for (const handler of listeners.get(type) || []) {
        handler(event);
      }
    },
    contains() {
      return false;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    focus() {},
  };
}

function createHarness(world) {
  const byId = {
    locateBtn: createMockElement("button"),
    voiceLocateBtn: createMockElement("button"),
    voiceLocateBtnLabel: createMockElement("span"),
    skeleton: createMockElement("div", ["hidden"]),
    locationPromptCard: createMockElement("section", ["hidden"]),
    locationPromptAllow: createMockElement("button"),
    permissionCard: createMockElement("section", ["hidden"]),
    permissionRetryBtn: createMockElement("button"),
    result: createMockElement("section", ["hidden"]),
    status: createMockElement("p", ["hidden"]),
    resolvedLocation: createMockElement("p", ["hidden"]),
    modeRailBtn: createMockElement("button"),
    modeTramBtn: createMockElement("button"),
    modeMetroBtn: createMockElement("button"),
    modeBusBtn: createMockElement("button"),
    modeEyebrow: createMockElement("p"),
    resultsLimitSelect: createMockElement("button"),
    resultsLimitSelectWrap: createMockElement("div"),
    resultsLimitSelectList: createMockElement("ul"),
    busStopSelect: createMockElement("button"),
    busStopSelectWrap: createMockElement("div"),
    busStopSelectList: createMockElement("ul"),
    stopFiltersToggleBtn: createMockElement("button"),
    busControls: createMockElement("section", ["hidden"]),
    dataScope: createMockElement("p", ["hidden"]),
    nowClock: createMockElement("p"),
    voiceLocationChoices: createMockElement("section", ["hidden"]),
    voiceLocationChoicesTitle: createMockElement("p"),
    voiceLocationChoicesOptions: createMockElement("div"),
    voiceLocationChoicesCancel: createMockElement("button"),
  };

  const localStorageMap = new Map();
  const intervalCalls = [];
  const rafQueue = [];

  const context = {
    window: {
      HMApp: {},
      MediaRecorder: world.mediaRecorderEnabled
        ? class MockMediaRecorder {
            static isTypeSupported() {
              return true;
            }
          }
        : null,
      localStorage: {
        getItem(key) {
          return localStorageMap.has(key) ? localStorageMap.get(key) : null;
        },
        setItem(key, value) {
          localStorageMap.set(String(key), String(value));
        },
        removeItem(key) {
          localStorageMap.delete(String(key));
        },
      },
      location: { search: "", pathname: "/", hash: "" },
      history: {
        replaceState() {},
      },
      requestAnimationFrame(callback) {
        rafQueue.push(callback);
        return rafQueue.length;
      },
      setInterval(handler) {
        intervalCalls.push(handler);
        return intervalCalls.length;
      },
      addEventListener() {},
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    },
    navigator: {
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [],
        }),
      },
    },
    fetch: async (url) => {
      const requestUrl = new URL(String(url), "https://example.test");
      if (requestUrl.pathname === "/api/v1/speech-transcribe") {
        world.speechTranscribeStartupCalls += 1;
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          async json() {
            return { transcript: "Kamppi Helsinki" };
          },
        };
      }

      throw new Error(`Unexpected fetch: ${requestUrl.pathname}`);
    },
    document: {
      getElementById(id) {
        return byId[id] || null;
      },
      querySelector() {
        return null;
      },
      addEventListener() {},
      createElement(tagName) {
        return createMockElement(tagName);
      },
    },
    URL,
    URLSearchParams,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Object,
    Array,
    Set,
    JSON,
    Promise,
    RegExp,
    Error,
    AbortController,
    setTimeout,
    clearTimeout,
    setInterval(handler) {
      intervalCalls.push(handler);
      return intervalCalls.length;
    },
    clearInterval() {},
    console,
  };

  vm.createContext(context);

  function runScript(relativePath) {
    const scriptPath = path.resolve(__dirname, relativePath);
    const scriptText = fs.readFileSync(scriptPath, "utf8");
    vm.runInContext(scriptText, context, { filename: scriptPath });
  }

  runScript("../scripts/app/01-state.js");
  runScript("../scripts/app/03-data.js");
  Object.assign(context.window.HMApp.api, {
    updateModeButtons() {},
    updateModeLabels() {},
    renderResultsLimitControl() {},
    renderStopControls() {},
    updateDataScope() {},
    updateClock() {},
  });

  return {
    dom: byId,
    runInitializer() {
      runScript("../scripts/app/04-init.js");
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
      pattern: /^When the voice availability initializer runs$/,
      run: async ({ world }) => {
        world.harness.runInitializer();
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
