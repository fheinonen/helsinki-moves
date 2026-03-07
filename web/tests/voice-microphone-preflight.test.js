const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const { createBareApp } = require("./helpers/frontend-app");
const { registerDataModule } = require("../scripts/app/03-data");

const featureText = `
Feature: Voice microphone preflight

Scenario: Request microphone permission before voice capture
  Given voice preflight data API is booted
  And speech transcription returns transcript "Kamppi Helsinki"
  When voice preflight location is requested
  Then microphone permission preflight call count equals 1
  And media recorder start call count equals 1
  And speech transcription request count equals 1
  And browser speech recognition start call count equals 0

Scenario: Use typed fallback prompt when speech transcription is unavailable
  Given voice preflight data API is booted
  And speech transcription responds with status 503
  And typed fallback prompt returns ""
  When voice preflight location is requested
  Then microphone permission preflight call count equals 1
  And typed fallback prompt call count equals 1
  And last prompt message equals "Voice recognition is unavailable right now. Type your location or line (number or letter) instead:\\nExample: Kamppi Helsinki, A-train, bus 52, 200"

Scenario: Request 16 kHz mono audio as microphone constraints
  Given voice preflight data API is booted
  And speech transcription returns transcript "Kamppi Helsinki"
  When voice preflight location is requested
  Then microphone permission preflight call count equals 1
  And requested microphone sample rate preference equals 16000
  And requested microphone channel count preference equals 1

Scenario: Request browser audio processing to reduce microphone feedback
  Given voice preflight data API is booted
  And speech transcription returns transcript "Kamppi Helsinki"
  When voice preflight location is requested
  Then requested microphone echo cancellation preference equals true
  And requested microphone noise suppression preference equals true
  And requested microphone auto gain control preference equals true

Scenario: Use provided voice runtime microphone override during preflight
  Given voice preflight data API is booted
  And voice runtime microphone override is available
  And speech transcription returns transcript "Kamppi Helsinki"
  When voice preflight location is requested
  Then microphone permission preflight call count equals 1
  And speech transcription request count equals 1
`;

function createMediaRecorderClass(world) {
  return class MockMediaRecorder {
    static isTypeSupported() {
      return true;
    }

    constructor() {
      this.listeners = new Map();
      this.state = "inactive";
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
          data: new Blob([Buffer.from("voice-sample")], { type: "audio/webm" }),
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
  const getUserMediaCalls = [];
  const promptCalls = [];
  const browserSpeechStartCalls = [];
  const { app, env } = createBareApp({
    api: {
      uniqueNonEmptyStrings: (items) =>
        [...new Set((Array.isArray(items) ? items : []).map((item) => String(item || "").trim()))].filter(
          Boolean
        ),
      setVoiceListening: (value) => {
        app.state.isVoiceListening = Boolean(value);
      },
      setStatus: () => {},
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
      voiceLocationAvailability: "available",
    },
    env: {
      windowRef: {
        __HM_ENABLE_VOICE_RECORDER_FALLBACK__: true,
        __HM_TEST_VOICE_OVERRIDES__: world.useRuntimeMicrophoneOverride
          ? {
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
            }
          : null,
        prompt: (message, defaultValue) => {
          promptCalls.push({ message: String(message || ""), defaultValue: String(defaultValue || "") });
          return world.promptResponse;
        },
        MediaRecorder: createMediaRecorderClass(world),
        SpeechRecognition: null,
        webkitSpeechRecognition: null,
      },
      navigatorRef: {
        language: "en-US",
        languages: ["en-US"],
        userAgent: "Mozilla/5.0 Chrome/123.0",
        mediaDevices: world.useRuntimeMicrophoneOverride
          ? null
          : {
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
      fetchImpl: async (url) => {
        const asText = String(url || "");
        if (asText.startsWith("/api/v1/speech-transcribe")) {
          world.speechTranscribeRequestCount += 1;
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
      documentRef: {
        createElement: () => ({
          addEventListener() {},
        }),
      },
    },
  });
  registerDataModule(app, env);

  world.api = app.api;
  world.getUserMediaCalls = getUserMediaCalls;
  world.promptCalls = promptCalls;
  world.browserSpeechStartCalls = browserSpeechStartCalls;
}

defineFeature(test, featureText, {
  createWorld: () => ({
    api: null,
    transcript: "Kamppi Helsinki",
    speechTranscribeStatus: 200,
    promptResponse: "",
    getUserMediaCalls: [],
    promptCalls: [],
    mediaRecorderStartCalls: [],
    speechTranscribeRequestCount: 0,
    browserSpeechStartCalls: [],
    result: null,
    useRuntimeMicrophoneOverride: false,
  }),
  stepDefinitions: [
    {
      pattern: /^Given voice preflight data API is booted$/,
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
      pattern: /^Given voice runtime microphone override is available$/,
      run: ({ world }) => {
        world.useRuntimeMicrophoneOverride = true;
        bootVoiceDataApi(world);
      },
    },
    {
      pattern: /^When voice preflight location is requested$/,
      run: async ({ world }) => {
        world.result = await world.api.requestVoiceLocationAndLoad();
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
      pattern: /^Then media recorder start call count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.mediaRecorderStartCalls.length, Number(args[0]));
      },
    },
    {
      pattern: /^Then speech transcription request count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.speechTranscribeRequestCount, Number(args[0]));
      },
    },
    {
      pattern: /^Then browser speech recognition start call count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.browserSpeechStartCalls.length, Number(args[0]));
      },
    },
    {
      pattern: /^Then last prompt message equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(String(world.promptCalls.at(-1)?.message || ""), args[0].replace(/\\n/g, "\n"));
      },
    },
    {
      pattern: /^Then requested microphone sample rate preference equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.getUserMediaCalls.at(-1)?.audio?.sampleRate?.ideal, Number(args[0]));
      },
    },
    {
      pattern: /^Then requested microphone channel count preference equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.getUserMediaCalls.at(-1)?.audio?.channelCount?.ideal, Number(args[0]));
      },
    },
    {
      pattern: /^Then requested microphone echo cancellation preference equals (true|false)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.getUserMediaCalls.at(-1)?.audio?.echoCancellation?.ideal, args[0] === "true");
      },
    },
    {
      pattern: /^Then requested microphone noise suppression preference equals (true|false)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.getUserMediaCalls.at(-1)?.audio?.noiseSuppression?.ideal, args[0] === "true");
      },
    },
    {
      pattern: /^Then requested microphone auto gain control preference equals (true|false)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.getUserMediaCalls.at(-1)?.audio?.autoGainControl?.ideal, args[0] === "true");
      },
    },
  ],
});
