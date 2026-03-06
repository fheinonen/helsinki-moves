const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { defineFeature } = require("./helpers/bdd");

const featureText = `
Feature: Voice location microphone preflight

Scenario: Request microphone permission before Firefox-style start failure fallback
  Given voice-location data API is booted
  And speech recognition start throws "NotSupportedError"
  And typed fallback prompt returns ""
  When voice location is requested
  Then microphone permission preflight call count equals 1
  And typed fallback prompt call count equals 1

Scenario: Use unsupported-browser fallback when speech start reports NotSupportedError on Edge macOS
  Given voice-location data API is booted
  And browser user agent is "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0"
  And speech recognition start throws "NotSupportedError"
  And typed fallback prompt returns ""
  When voice location is requested
  Then last prompt message equals "This browser does not support speech recognition. Type your location or line (number or letter) instead:\\nExample: Kamppi Helsinki, A-train, bus 52, 200"
  And last status equals "This browser does not support speech recognition. Type your location or line (number or letter) instead."

Scenario: Request microphone permission before unsupported-browser fallback
  Given voice-location data API is booted
  And speech recognition is unsupported
  And typed fallback prompt returns ""
  When voice location is requested
  Then microphone permission preflight call count equals 1
  And typed fallback prompt call count equals 1

Scenario: Detect support when browser exposes mozSpeechRecognition constructor
  Given voice-location data API is booted
  And browser exposes only moz speech recognition
  When voice recognition support is checked
  Then voice recognition support equals true

Scenario: Use generic unsupported message when speech API is unavailable
  Given voice-location data API is booted
  And browser user agent is "Mozilla/5.0 Firefox/124.0"
  And speech recognition is unsupported
  And typed fallback prompt returns ""
  When voice location is requested
  Then speech recognition start call count equals 0
  And typed fallback prompt call count equals 1
  And last status equals "This browser does not support speech recognition. Type your location or line (number or letter) instead."

Scenario: Do not block speech start only because browser user agent is Firefox
  Given voice-location data API is booted
  And browser user agent is "Mozilla/5.0 Firefox/124.0"
  And typed fallback prompt returns ""
  When voice location is requested
  Then speech recognition start call count is at least 1
  And typed fallback prompt call count equals 1

Scenario: Use generic unsupported message when runtime marker exists without Firefox user agent token
  Given voice-location data API is booted
  And browser user agent is "Mozilla/5.0 (X11; Linux x86_64)"
  And browser has Firefox runtime marker
  And speech recognition is unsupported
  And typed fallback prompt returns ""
  When voice location is requested
  Then last status equals "This browser does not support speech recognition. Type your location or line (number or letter) instead."

Scenario: Unsupported prompt includes location and line examples
  Given voice-location data API is booted
  And speech recognition is unsupported
  And typed fallback prompt returns ""
  When voice location is requested
  Then last prompt message equals "This browser does not support speech recognition. Type your location or line (number or letter) instead:\\nExample: Kamppi Helsinki, A-train, bus 52, 200"
`;

function bootVoiceDataApi(world) {
  const scriptPath = path.resolve(__dirname, "../scripts/app/03-data.js");
  const scriptText = fs.readFileSync(scriptPath, "utf8");

  const getUserMediaCalls = [];
  const promptCalls = [];
  const speechStartCalls = [];
  const statusCalls = [];

  const context = {
    window: {
      HMApp: {
        api: {
          uniqueNonEmptyStrings: (items) =>
            [...new Set((Array.isArray(items) ? items : []).map((item) => String(item || "").trim()))].filter(
              Boolean
            ),
          setVoiceListening: (value) => {
            context.window.HMApp.state.isVoiceListening = Boolean(value);
          },
          setStatus: (status) => {
            statusCalls.push(String(status || ""));
          },
          getVoiceLocationErrorStatus: (error) => {
            const code = String(error?.code || "").trim();
            if (code === "voice_unsupported") {
              return "This browser does not support speech recognition. Type your location or line (number or letter) instead.";
            }
            return String(error?.message || "voice-error");
          },
          reportClientError: () => {},
          reportClientMetric: () => {},
          setResolvedLocationHint: () => {},
          setPermissionRequired: () => {},
          safeString: (value) => String(value || ""),
          getActiveResultsLimit: () => 8,
          sanitizeStopSelections: () => {},
          render: () => {},
          setLastUpdated: () => {},
          buildStatusFromResponse: () => "",
          trackFirstSuccessfulRender: () => {},
          persistUiState: () => {},
          trackInitialNearestStopResolved: () => {},
          updateNextSummary: () => {},
          setLoading: () => {},
          getLoadErrorStatus: () => "load-error",
          updateModeButtons: () => {},
          updateModeLabels: () => {},
          renderResultsLimitControl: () => {},
          renderStopControls: () => {},
          updateDataScope: () => {},
        },
        dom: {},
        state: {
          isLoading: false,
          isVoiceListening: false,
          currentCoords: null,
          currentCoordsTimestampMs: null,
          currentCoordsAccuracyMeters: null,
          latestResponse: null,
          locationGranted: false,
          latestLoadToken: 0,
          mode: "rail",
          busStopId: null,
          hasCompletedInitialStopModeLoad: true,
          deferInitialStopContext: false,
        },
        constants: {
          MODE_RAIL: "rail",
          MODE_TRAM: "tram",
          MODE_METRO: "metro",
          MODE_BUS: "bus",
          FETCH_TIMEOUT_MS: 8000,
          VOICE_SILENCE_STOP_MS: 1200,
          VOICE_RECOGNITION_TIMEOUT_MS: 8000,
          VOICE_QUERY_MIN_LENGTH: 3,
        },
      },
      prompt: (message, defaultValue) => {
        promptCalls.push({ message: String(message || ""), defaultValue: String(defaultValue || "") });
        return world.promptResponse;
      },
      SpeechRecognition: class MockSpeechRecognition {
        start() {
          speechStartCalls.push({});
          const error = new Error("Mock start failure");
          error.name = world.startErrorName;
          throw error;
        }
      },
      webkitSpeechRecognition: null,
    },
    navigator: {
      language: "en-US",
      languages: ["en-US"],
      userAgent: world.userAgent,
      mediaDevices: {
        getUserMedia: async (constraints) => {
          getUserMediaCalls.push(constraints);
          return {
            getTracks: () => [
              {
                stop: () => {},
              },
            ],
          };
        },
      },
    },
    fetch: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ station: { departures: [] }, stops: [] }),
    }),
    document: {
      createElement: () => ({
        addEventListener: () => {},
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

  world.api = context.window.HMApp.api;
  world.window = context.window;
  world.navigator = context.navigator;
  world.getUserMediaCalls = getUserMediaCalls;
  world.promptCalls = promptCalls;
  world.speechStartCalls = speechStartCalls;
  world.statusCalls = statusCalls;
}

defineFeature(test, featureText, {
  createWorld: () => ({
    api: null,
    window: null,
    navigator: null,
    startErrorName: "NotSupportedError",
    userAgent: "Mozilla/5.0 Chrome/123.0",
    promptResponse: "",
    getUserMediaCalls: [],
    promptCalls: [],
    speechStartCalls: [],
    statusCalls: [],
    result: null,
    supportCheck: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given voice-location data API is booted$/,
      run: ({ world }) => {
        bootVoiceDataApi(world);
      },
    },
    {
      pattern: /^Given speech recognition start throws "([^"]*)"$/,
      run: ({ args, world }) => {
        world.startErrorName = args[0];
      },
    },
    {
      pattern: /^Given speech recognition is unsupported$/,
      run: ({ world }) => {
        world.window.SpeechRecognition = undefined;
        world.window.webkitSpeechRecognition = undefined;
      },
    },
    {
      pattern: /^Given browser exposes only moz speech recognition$/,
      run: ({ world }) => {
        world.window.SpeechRecognition = undefined;
        world.window.webkitSpeechRecognition = undefined;
        world.window.mozSpeechRecognition = class MockMozSpeechRecognition {};
      },
    },
    {
      pattern: /^Given browser user agent is "([^"]*)"$/,
      run: ({ args, world }) => {
        world.userAgent = args[0];
        world.navigator.userAgent = args[0];
      },
    },
    {
      pattern: /^Given browser has Firefox runtime marker$/,
      run: ({ world }) => {
        world.window.InstallTrigger = {};
      },
    },
    {
      pattern: /^Given typed fallback prompt returns "([^"]*)"$/,
      run: ({ args, world }) => {
        world.promptResponse = args[0];
      },
    },
    {
      pattern: /^When voice location is requested$/,
      run: async ({ world }) => {
        world.result = await world.api.requestVoiceLocationAndLoad();
      },
    },
    {
      pattern: /^When voice recognition support is checked$/,
      run: ({ world }) => {
        world.supportCheck = world.api.supportsVoiceLocation();
      },
    },
    {
      pattern: /^Then microphone permission preflight call count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.getUserMediaCalls.length, Number(args[0]));
      },
    },
    {
      pattern: /^Then typed fallback prompt call count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.promptCalls.length, Number(args[0]));
      },
    },
    {
      pattern: /^Then speech recognition start call count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.speechStartCalls.length, Number(args[0]));
      },
    },
    {
      pattern: /^Then speech recognition start call count is at least (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.ok(world.speechStartCalls.length >= Number(args[0]));
      },
    },
    {
      pattern: /^Then last status equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.statusCalls.at(-1), args[0]);
      },
    },
    {
      pattern: /^Then voice recognition support equals (true|false)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.supportCheck, args[0] === "true");
      },
    },
    {
      pattern: /^Then last prompt message equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(String(world.promptCalls.at(-1)?.message || ""), args[0].replace(/\\n/g, "\n"));
      },
    },
  ],
});
