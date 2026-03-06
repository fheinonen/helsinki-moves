const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { defineFeature } = require("./helpers/bdd");

const featureText = `
Feature: Azure speech voice location

Scenario: Prefer Azure speech transcript when Azure speech token is available
  Given voice-location data API is booted with Azure speech support
  And Azure speech token API returns token "azure-token" for region "northeurope"
  And Azure speech transcript is "Kamppi Helsinki"
  When voice location is requested
  Then Azure speech recognize call count equals 1
  And browser speech recognition start call count equals 0
  And last geocode query equals "Kamppi Helsinki"

Scenario: Fall back to browser speech recognition when Azure speech token API is unavailable
  Given voice-location data API is booted with Azure speech support
  And Azure speech token API fails with status 503 and message "Voice transcription is not configured."
  And browser speech recognition transcript is "Kamppi Helsinki"
  When voice location is requested
  Then Azure speech recognize call count equals 0
  And browser speech recognition start call count equals 1
  And last geocode query equals "Kamppi Helsinki"
`;

function bootVoiceDataApi(world) {
  const scriptPath = path.resolve(__dirname, "../scripts/app/03-data.js");
  const scriptText = fs.readFileSync(scriptPath, "utf8");

  const getUserMediaCalls = [];
  const promptCalls = [];
  const speechStartCalls = [];
  const azureRecognizeCalls = [];
  const geocodeQueries = [];

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
          setStatus: () => {},
          getVoiceLocationErrorStatus: (error) => String(error?.message || "voice-error"),
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
        azureSpeech: {
          recognizeOnce: async ({ token, region, language }) => {
            azureRecognizeCalls.push({ token, region, language });
            return {
              reason: "recognized",
              transcript: world.azureTranscript,
            };
          },
        },
        dom: {
          resultEl: {
            classList: {
              add: () => {},
            },
          },
        },
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
        return null;
      },
      SpeechRecognition: class MockSpeechRecognition {
        start() {
          speechStartCalls.push({});
          const transcript = String(world.browserTranscript || "Kamppi Helsinki");
          setTimeout(() => {
            const alternative = { transcript };
            const result = [alternative];
            result.isFinal = true;
            const results = [result];
            this.onresult?.({ resultIndex: 0, results });
            this.onend?.();
          }, 0);
        }
      },
      webkitSpeechRecognition: null,
    },
    navigator: {
      language: "en-US",
      languages: ["en-US"],
      userAgent: "Mozilla/5.0 Chrome/123.0",
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
    fetch: async (url) => {
      const href = String(url || "");
      if (href.startsWith("/api/v1/speech-token")) {
        if (world.tokenFailureStatus) {
          return {
            ok: false,
            status: world.tokenFailureStatus,
            headers: { get: () => "application/json" },
            json: async () => ({ error: world.tokenFailureMessage }),
          };
        }

        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({
            token: world.azureToken,
            region: world.azureRegion,
          }),
        };
      }

      if (href.startsWith("/api/v1/geocode")) {
        const requestUrl = new URL(href, "https://example.test");
        geocodeQueries.push(String(requestUrl.searchParams.get("text") || ""));
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({
            location: {
              lat: 60.1699,
              lon: 24.9384,
              label: "Kamppi, Helsinki",
            },
          }),
        };
      }

      if (href.startsWith("/api/v1/departures")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({
            station: { departures: [] },
            stops: [],
          }),
        };
      }

      throw new Error(`Unexpected fetch: ${href}`);
    },
    document: {
      createElement: () => ({
        addEventListener: () => {},
      }),
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
  world.getUserMediaCalls = getUserMediaCalls;
  world.promptCalls = promptCalls;
  world.speechStartCalls = speechStartCalls;
  world.azureRecognizeCalls = azureRecognizeCalls;
  world.geocodeQueries = geocodeQueries;
}

defineFeature(test, featureText, {
  createWorld: () => ({
    api: null,
    azureToken: "azure-token",
    azureRegion: "northeurope",
    azureTranscript: "Kamppi Helsinki",
    browserTranscript: "Kamppi Helsinki",
    tokenFailureStatus: 0,
    tokenFailureMessage: "",
    getUserMediaCalls: [],
    promptCalls: [],
    speechStartCalls: [],
    azureRecognizeCalls: [],
    geocodeQueries: [],
    result: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given voice-location data API is booted with Azure speech support$/,
      run: ({ world }) => {
        bootVoiceDataApi(world);
      },
    },
    {
      pattern: /^Given Azure speech token API returns token "([^"]*)" for region "([^"]*)"$/,
      run: ({ args, world }) => {
        world.azureToken = args[0];
        world.azureRegion = args[1];
        world.tokenFailureStatus = 0;
        world.tokenFailureMessage = "";
      },
    },
    {
      pattern: /^Given Azure speech transcript is "([^"]*)"$/,
      run: ({ args, world }) => {
        world.azureTranscript = args[0];
      },
    },
    {
      pattern: /^Given Azure speech token API fails with status (\d+) and message "([^"]*)"$/,
      run: ({ args, world }) => {
        world.tokenFailureStatus = Number(args[0]);
        world.tokenFailureMessage = args[1];
      },
    },
    {
      pattern: /^Given browser speech recognition transcript is "([^"]*)"$/,
      run: ({ args, world }) => {
        world.browserTranscript = args[0];
      },
    },
    {
      pattern: /^When voice location is requested$/,
      run: async ({ world }) => {
        world.result = await world.api.requestVoiceLocationAndLoad();
      },
    },
    {
      pattern: /^Then Azure speech recognize call count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.azureRecognizeCalls.length, Number(args[0]));
      },
    },
    {
      pattern: /^Then browser speech recognition start call count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.speechStartCalls.length, Number(args[0]));
      },
    },
    {
      pattern: /^Then last geocode query equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.geocodeQueries.at(-1), args[0]);
      },
    },
  ],
});
