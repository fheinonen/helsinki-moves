const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const { createBareApp } = require("./helpers/frontend-app");
const { registerDataModule } = require("../scripts/app/03-data");

const featureText = `
Feature: Speech transcription voice capture

Scenario: Use speech transcription API even when browser speech recognition exists
  Given voice data API is booted
  And browser speech recognition support is available
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

Scenario: Keep final audio chunk when recorder delivers it after stop
  Given voice data API is booted
  And media recorder delivers audio after stop
  And speech transcription returns transcript "Kamppi Helsinki"
  When voice location is requested
  Then media recorder start call count equals 1
  And media recorder start timeslice equals 250
  And speech transcription request count equals 1
  And voice request result equals true

Scenario: Voice capture does not start Web Audio silence monitoring
  Given voice data API is booted
  And speech transcription returns transcript "Kamppi Helsinki"
  When voice location is requested
  Then web audio context start call count equals 0

Scenario: Strip punctuation from speech transcription before location lookup
  Given voice data API is booted
  And speech transcription returns transcript "Kamppi, Helsinki!"
  When voice location is requested
  Then last geocode text query equals "Kamppi Helsinki"

Scenario: Use provided voice runtime recorder override during capture
  Given voice data API is booted
  And voice runtime recorder override is available
  And speech transcription returns transcript "Kamppi Helsinki"
  When voice location is requested
  Then speech transcription request count equals 1
  And media recorder start call count equals 1

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

    start(timeslice) {
      this.state = "recording";
      world.mediaRecorderStartCalls.push({ timeslice: Number(timeslice) || 0 });
      setTimeout(() => {
        if (world.mediaRecorderDeliversAudioAfterStop) {
          this.stop();
          setTimeout(() => {
            this.emit("dataavailable", {
              data: new Blob([Buffer.from("voice-sample")], {
                type:
                  String(world.mediaRecorderConstructorOptions.at(-1)?.mimeType || "").trim() ||
                  "audio/webm",
              }),
            });
          }, 0);
          return;
        }
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
  const promptCalls = [];
  const browserSpeechStartCalls = [];
  const statusCalls = [];
  const speechTranscribeRequests = [];
  const geocodeRequests = [];
  const audioContextStartCalls = [];
  const { app, env } = createBareApp({
    api: {
      uniqueNonEmptyStrings: (items) =>
        [...new Set((Array.isArray(items) ? items : []).map((item) => String(item || "").trim()))].filter(
          Boolean
        ),
      setVoiceListening: (value) => {
        app.state.isVoiceListening = Boolean(value);
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
      voiceLocationAvailability: "available",
    },
    env: {
      windowRef: {
        __HM_TEST_VOICE_OVERRIDES__: world.useRuntimeRecorderOverride
          ? {
              MediaRecorder: createMediaRecorderClass(world),
            }
          : null,
        prompt: (message, defaultValue) => {
          promptCalls.push({ message: String(message || ""), defaultValue: String(defaultValue || "") });
          return world.promptResponse;
        },
        MediaRecorder: world.useRuntimeRecorderOverride ? null : createMediaRecorderClass(world),
        AudioContext: class MockAudioContext {
          constructor() {
            audioContextStartCalls.push({});
          }
        },
        SpeechRecognition: null,
        webkitSpeechRecognition: null,
      },
      navigatorRef: {
        language: "en-US",
        languages: ["en-US"],
        userAgent: world.userAgent,
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
      fetchImpl: async (url, options = {}) => {
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
          geocodeRequests.push(new URL(asText, "https://example.test"));
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
  world.window = env.windowRef;
  world.navigatorRef = env.navigatorRef;
  world.browserSpeechStartCalls = browserSpeechStartCalls;
  world.promptCalls = promptCalls;
  world.statusCalls = statusCalls;
  world.speechTranscribeRequests = speechTranscribeRequests;
  world.geocodeRequests = geocodeRequests;
  world.audioContextStartCalls = audioContextStartCalls;
}

defineFeature(test, featureText, {
  createWorld: () => ({
    api: null,
    window: null,
    navigatorRef: null,
    transcript: "Kamppi Helsinki",
    speechTranscribeStatus: 200,
    promptResponse: "",
    mediaRecorderStartCalls: [],
    mediaRecorderConstructorOptions: [],
    speechTranscribeRequestCount: 0,
    speechTranscribeRequests: [],
    geocodeRequests: [],
    browserSpeechStartCalls: [],
    promptCalls: [],
    statusCalls: [],
    audioContextStartCalls: [],
    browserSpeechTranscript: "",
    supportedMimeTypes: new Set([
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ]),
    mediaRecorderDeliversAudioAfterStop: false,
    userAgent: "Mozilla/5.0 Chrome/123.0",
    result: null,
    useRuntimeRecorderOverride: false,
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
      pattern: /^Given browser speech recognition support is available$/,
      run: ({ world }) => {
        const MockSpeechRecognition = class MockSpeechRecognition {
          constructor() {
            this.onresult = null;
            this.onerror = null;
            this.onend = null;
          }

          start() {
            world.browserSpeechStartCalls.push({});
            setTimeout(() => {
              if (world.browserSpeechTranscript) {
                this.onresult?.({
                  results: [
                    [
                      {
                        transcript: world.browserSpeechTranscript,
                      },
                    ],
                  ],
                });
              }
              this.onend?.();
            }, 0);
          }
        };
        world.window.SpeechRecognition = MockSpeechRecognition;
        world.window.webkitSpeechRecognition = MockSpeechRecognition;
      },
    },
    {
      pattern: /^Given browser user agent is "([^"]*)"$/,
      run: ({ args, world }) => {
        world.userAgent = args[0];
        if (world.navigatorRef) {
          world.navigatorRef.userAgent = args[0];
        }
      },
    },
    {
      pattern: /^Given browser speech recognition returns transcript "([^"]*)"$/,
      run: ({ args, world }) => {
        world.browserSpeechTranscript = args[0];
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
      pattern: /^Given media recorder delivers audio after stop$/,
      run: ({ world }) => {
        world.mediaRecorderDeliversAudioAfterStop = true;
      },
    },
    {
      pattern: /^Given voice runtime recorder override is available$/,
      run: ({ world }) => {
        world.useRuntimeRecorderOverride = true;
        bootVoiceDataApi(world);
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
      pattern: /^Then media recorder start timeslice equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.mediaRecorderStartCalls.at(-1)?.timeslice || 0, Number(args[0]));
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
    {
      pattern: /^Then web audio context start call count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.audioContextStartCalls.length, Number(args[0]));
      },
    },
    {
      pattern: /^Then last geocode text query equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.geocodeRequests.at(-1)?.searchParams.get("text") || "", args[0]);
      },
    },
  ],
});
