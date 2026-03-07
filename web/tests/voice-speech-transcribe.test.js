const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { defineFeature } = require("./helpers/bdd");

const featureText = `
Feature: Speech transcription voice capture

Scenario: Use speech transcription API even when browser speech recognition exists
  Given voice data API is booted
  And speech transcription returns transcript "Kamppi Helsinki"
  When voice location is requested
  Then speech transcription request count equals 1
  And media recorder start call count equals 1
  And browser speech recognition start call count equals 0
  And voice request result equals true

Scenario: Keep typed fallback when speech transcription is unavailable
  Given voice data API is booted
  And speech transcription responds with status 503
  And typed fallback prompt returns ""
  When voice location is requested
  Then speech transcription request count equals 1
  And media recorder start call count equals 1
  And browser speech recognition start call count equals 0
  And last status equals "Voice recognition is unavailable right now. Type your location or line (number or letter) instead."

Scenario: Use Safari-compatible recording metadata for speech transcription
  Given voice data API is booted
  And supported voice recording mime types are "audio/mp4"
  And speech transcription returns transcript "Kamppi Helsinki"
  When voice location is requested
  Then media recorder start call count equals 1
  And media recorder requested mime type is "audio/mp4"
  And speech transcription request mime type is "audio/mp4"
  And speech transcription request file name is "voice-query.m4a"
`;

function createMediaRecorderClass(world) {
  return class MockMediaRecorder {
    static isTypeSupported(mimeType) {
      return world.supportedMimeTypes.has(String(mimeType || "").trim().toLowerCase());
    }

    constructor(_stream, options = {}) {
      this.listeners = new Map();
      this.state = "inactive";
      world.mediaRecorderConstructorOptions.push(options);
    }

    addEventListener(type, handler) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(handler);
    }

    emit(type, event = {}) {
      for (const handler of this.listeners.get(type) || []) {
        handler(event);
      }
    }

    start() {
      this.state = "recording";
      world.mediaRecorderStartCalls.push({});
      setTimeout(() => {
        this.emit("dataavailable", {
          data: new Blob([Buffer.from("voice-sample")], {
            type:
              String(world.mediaRecorderConstructorOptions.at(-1)?.mimeType || "").trim() ||
              "audio/webm",
          }),
        });
        this.stop();
      }, 0);
    }

    stop() {
      if (this.state === "inactive") return;
      this.state = "inactive";
      this.emit("stop");
    }

    requestData() {}
  };
}

function bootVoiceDataApi(world) {
  const scriptPath = path.resolve(__dirname, "../scripts/app/03-data.js");
  const scriptText = fs.readFileSync(scriptPath, "utf8");

  const promptCalls = [];
  const browserSpeechStartCalls = [];
  const statusCalls = [];
  const speechTranscribeRequests = [];

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
              return "Voice recognition is unavailable right now. Type your location or line (number or letter) instead.";
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
        dom: {
          resultEl: {
            classList: {
              add() {},
            },
          },
        },
        state: {
          isLoading: false,
          isVoiceListening: false,
          voiceLocationAvailability: "available",
          currentCoords: null,
          currentCoordsTimestampMs: null,
          currentCoordsAccuracyMeters: null,
          latestResponse: null,
          locationGranted: false,
          latestLoadToken: 0,
          mode: "rail",
          busStopId: null,
          busStops: [],
          busLineFilters: [],
          busDestinationFilters: [],
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
          VOICE_RECOGNITION_TIMEOUT_MS: 1000,
          VOICE_QUERY_MIN_LENGTH: 3,
        },
      },
      prompt: (message, defaultValue) => {
        promptCalls.push({ message: String(message || ""), defaultValue: String(defaultValue || "") });
        return world.promptResponse;
      },
      MediaRecorder: createMediaRecorderClass(world),
      SpeechRecognition: class MockSpeechRecognition {
        start() {
          browserSpeechStartCalls.push({});
        }
      },
      webkitSpeechRecognition: class MockSpeechRecognition {
        start() {
          browserSpeechStartCalls.push({});
        }
      },
    },
    navigator: {
      language: "en-US",
      languages: ["en-US"],
      userAgent: "Mozilla/5.0 Chrome/123.0",
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [
            {
              stop: () => {},
            },
          ],
        }),
      },
    },
    fetch: async (url, options = {}) => {
      const asText = String(url || "");
      if (asText.startsWith("/api/v1/speech-transcribe")) {
        world.speechTranscribeRequestCount += 1;
        speechTranscribeRequests.push(JSON.parse(String(options.body || "{}")));
        return {
          ok: world.speechTranscribeStatus === 200,
          status: world.speechTranscribeStatus,
          headers: { get: () => "application/json" },
          async json() {
            if (world.speechTranscribeStatus === 200) {
              return {
                transcript: world.transcript,
              };
            }
            return { error: "Speech transcription is not configured" };
          },
        };
      }

      if (asText.startsWith("/api/v1/geocode")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          async json() {
            return {
              location: {
                lat: 60.1699,
                lon: 24.9384,
                label: "Kamppi, Helsinki",
              },
            };
          },
        };
      }

      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        async json() {
          return { station: { departures: [] }, stops: [] };
        },
      };
    },
    document: {
      createElement: () => ({
        addEventListener() {},
      }),
    },
    Blob,
    Buffer,
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
  world.browserSpeechStartCalls = browserSpeechStartCalls;
  world.promptCalls = promptCalls;
  world.statusCalls = statusCalls;
  world.speechTranscribeRequests = speechTranscribeRequests;
}

defineFeature(test, featureText, {
  createWorld: () => ({
    api: null,
    window: null,
    transcript: "Kamppi Helsinki",
    speechTranscribeStatus: 200,
    promptResponse: "",
    mediaRecorderStartCalls: [],
    mediaRecorderConstructorOptions: [],
    speechTranscribeRequestCount: 0,
    speechTranscribeRequests: [],
    browserSpeechStartCalls: [],
    promptCalls: [],
    statusCalls: [],
    supportedMimeTypes: new Set([
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ]),
    result: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given voice data API is booted$/,
      run: ({ world }) => {
        bootVoiceDataApi(world);
      },
    },
    {
      pattern: /^Given speech transcription returns transcript "([^"]*)"$/,
      run: ({ args, world }) => {
        world.transcript = args[0];
        world.speechTranscribeStatus = 200;
      },
    },
    {
      pattern: /^Given speech transcription responds with status (\d+)$/,
      run: ({ args, world }) => {
        world.speechTranscribeStatus = Number(args[0]);
      },
    },
    {
      pattern: /^Given typed fallback prompt returns "([^"]*)"$/,
      run: ({ args, world }) => {
        world.promptResponse = args[0];
      },
    },
    {
      pattern: /^Given supported voice recording mime types are "([^"]*)"$/,
      run: ({ args, world }) => {
        world.supportedMimeTypes = new Set(
          args[0]
            .split(",")
            .map((item) => String(item || "").trim().toLowerCase())
            .filter(Boolean)
        );
      },
    },
    {
      pattern: /^When voice location is requested$/,
      run: async ({ world }) => {
        world.result = await world.api.requestVoiceLocationAndLoad();
      },
    },
    {
      pattern: /^Then speech transcription request count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.speechTranscribeRequestCount, Number(args[0]));
      },
    },
    {
      pattern: /^Then media recorder start call count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.mediaRecorderStartCalls.length, Number(args[0]));
      },
    },
    {
      pattern: /^Then browser speech recognition start call count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.browserSpeechStartCalls.length, Number(args[0]));
      },
    },
    {
      pattern: /^Then media recorder requested mime type is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.mediaRecorderConstructorOptions.at(-1)?.mimeType || "", args[0]);
      },
    },
    {
      pattern: /^Then speech transcription request mime type is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.speechTranscribeRequests.at(-1)?.mimeType || "", args[0]);
      },
    },
    {
      pattern: /^Then speech transcription request file name is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.speechTranscribeRequests.at(-1)?.fileName || "", args[0]);
      },
    },
    {
      pattern: /^Then voice request result equals (true|false)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.result, args[0] === "true");
      },
    },
    {
      pattern: /^Then last status equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.statusCalls.at(-1), args[0]);
      },
    },
  ],
});
