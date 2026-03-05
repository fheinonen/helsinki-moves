const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { defineFeature } = require("./helpers/bdd");

const featureText = `
Feature: Voice line-intent stale response handling

Scenario: Ignore stale voice line-intent response when a newer load supersedes it
  Given voice line-intent data API is booted
  And voice line-intent upstream response is deferred
  When voice line-intent lookup starts for mode "bus" and line "67"
  And a newer load supersedes the lookup
  And the deferred voice line-intent response resolves
  Then voice line-intent lookup result equals false
  And active mode remains "rail"
  And render call count equals 0
  And persist-ui call count equals 0
`;

function createLineIntentResponse(stopId) {
  return {
    mode: "BUS",
    station: {
      stopName: "Bus 67 Stop",
      distanceMeters: 120,
      stopCode: "B67",
      stopCodes: ["B67"],
      departures: [
        {
          line: "67",
          destination: "Pasila",
          departureIso: new Date(Date.now() + 3 * 60_000).toISOString(),
        },
      ],
    },
    stops: [
      {
        id: stopId,
        name: "Bus 67 Stop",
        code: "B67",
        memberStopIds: [stopId],
        stopCodes: ["B67"],
        distanceMeters: 120,
      },
    ],
    selectedStopId: stopId,
    filterOptions: {
      lines: [{ value: "67", count: 1 }],
      destinations: [{ value: "Pasila", count: 1 }],
    },
  };
}

function bootVoiceLineIntentApi(world) {
  const scriptPath = path.resolve(__dirname, "../scripts/app/03-data.js");
  const scriptText = fs.readFileSync(scriptPath, "utf8");

  const renderCalls = [];
  let persistCalls = 0;
  const deferredFetchResolvers = [];

  const context = {
    window: {
      HMApp: {
        api: {
          uniqueNonEmptyStrings: (items) =>
            [...new Set((Array.isArray(items) ? items : []).map((item) => String(item || "").trim()))].filter(
              Boolean
            ),
          getActiveResultsLimit: () => 8,
          persistUiState: () => {
            persistCalls += 1;
          },
          render: (payload) => {
            renderCalls.push(payload);
          },
          sanitizeStopSelections: () => {},
          setStatus: () => {},
          safeString: (value) => String(value || ""),
          setResolvedLocationHint: () => {},
          setPermissionRequired: () => {},
          setLastUpdated: () => {},
          trackFirstSuccessfulRender: () => {},
          trackInitialNearestStopResolved: () => {},
          reportClientMetric: () => {},
          reportClientError: () => {},
          updateModeButtons: () => {},
          updateModeLabels: () => {},
          renderResultsLimitControl: () => {},
          renderStopControls: () => {},
          updateDataScope: () => {},
          updateNextSummary: () => {},
          setLoading: () => {},
          getLoadErrorStatus: () => "load-error",
        },
        dom: {
          resultEl: {
            classList: {
              add: () => {},
            },
          },
        },
        state: {
          mode: "rail",
          busStops: [],
          busStopId: null,
          busLineFilters: [],
          busDestinationFilters: [],
          busFilterOptions: { lines: [], destinations: [] },
          stopFilterPinned: false,
          busStopMemberFilterId: null,
          hasCompletedInitialStopModeLoad: true,
          deferInitialStopContext: false,
          latestLoadToken: 0,
          currentCoords: { lat: 60.1699, lon: 24.9384 },
          currentCoordsTimestampMs: Date.now(),
          currentCoordsAccuracyMeters: null,
          latestResponse: null,
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
    },
    navigator: {
      language: "en-US",
      languages: ["en-US"],
    },
    fetch: () =>
      new Promise((resolve) => {
        deferredFetchResolvers.push(() =>
          resolve({
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => createLineIntentResponse("HSL:BUS67"),
          })
        );
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
  world.state = context.window.HMApp.state;
  world.renderCalls = renderCalls;
  world.getPersistCalls = () => persistCalls;
  world.deferredFetchResolvers = deferredFetchResolvers;
}

defineFeature(test, featureText, {
  createWorld: () => ({
    api: null,
    state: null,
    renderCalls: [],
    getPersistCalls: () => 0,
    deferredFetchResolvers: [],
    lookupPromise: null,
    lookupResult: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given voice line-intent data API is booted$/,
      run: ({ world }) => {
        bootVoiceLineIntentApi(world);
      },
    },
    {
      pattern: /^Given voice line-intent upstream response is deferred$/,
      run: ({ assert, world }) => {
        assert.equal(world.deferredFetchResolvers.length, 0);
      },
    },
    {
      pattern: /^When voice line-intent lookup starts for mode "([^"]*)" and line "([^"]*)"$/,
      run: ({ args, assert, world }) => {
        world.lookupPromise = world.api.resolveVoiceLineIntentAndLoad("voice", {
          type: "line-intent",
          mode: args[0],
          line: args[1],
          explicitMode: true,
        });
        assert.equal(world.deferredFetchResolvers.length, 1);
      },
    },
    {
      pattern: /^When a newer load supersedes the lookup$/,
      run: ({ world }) => {
        world.state.latestLoadToken += 1;
      },
    },
    {
      pattern: /^When the deferred voice line-intent response resolves$/,
      run: async ({ world }) => {
        const resolveFetch = world.deferredFetchResolvers.shift();
        resolveFetch();
        world.lookupResult = await world.lookupPromise;
      },
    },
    {
      pattern: /^Then voice line-intent lookup result equals (true|false)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.lookupResult, args[0] === "true");
      },
    },
    {
      pattern: /^Then active mode remains "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.state.mode, args[0]);
      },
    },
    {
      pattern: /^Then render call count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.renderCalls.length, Number(args[0]));
      },
    },
    {
      pattern: /^Then persist-ui call count equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.getPersistCalls(), Number(args[0]));
      },
    },
  ],
});
