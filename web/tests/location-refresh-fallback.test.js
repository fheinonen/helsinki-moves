const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { defineFeature } = require("./helpers/bdd");

const featureText = `
Feature: Location refresh fallback

Scenario: Retry with high accuracy when coarse location is unavailable
  Given browser geolocation is available
  And the first location attempt fails with code 2
  When the user refreshes location
  Then the refresh retries once with high accuracy

Scenario: Do not retry when location permission is denied
  Given browser geolocation is available
  And the first location attempt fails with code 1
  When the user refreshes location
  Then the refresh does not retry and permission is required

Scenario: Use watched location update when one-shot refresh returns stale fix
  Given browser geolocation is available
  And current location is 60.19, 24.93 with timestamp 5000 and accuracy 25
  And the first location attempt returns 60.19, 24.93 with accuracy 25 and timestamp 5000
  And a watched location update returns 60.21, 24.95 with accuracy 20 and timestamp 15000
  When the user refreshes location
  Then the refresh uses a watched location update
  And departures are requested for latitude 60.21 and longitude 24.95

Scenario: Use last known location when refresh cannot get a new fix
  Given browser geolocation is available
  And current location is 60.18, 24.92 with timestamp 4000 and accuracy 30
  And the first location attempt fails with code 2
  And the high accuracy retry fails with code 2
  When the user refreshes location
  Then departures are requested for latitude 60.18 and longitude 24.92
  And status updates include "Location temporarily unavailable. Showing last known nearby stops."
`;

function bootDataApi(world) {
  const scriptPath = path.resolve(__dirname, "../scripts/app/03-data.js");
  const scriptText = fs.readFileSync(scriptPath, "utf8");

  const geolocationCalls = [];
  const watchCalls = [];
  const clearWatchCalls = [];
  let watchId = 0;
  const geolocation = {
    getCurrentPosition(success, error, options) {
      geolocationCalls.push({ success, error, options });
    },
    watchPosition(success, error, options) {
      watchId += 1;
      watchCalls.push({ id: watchId, success, error, options });
      return watchId;
    },
    clearWatch(id) {
      clearWatchCalls.push(id);
    },
  };

  const permissionRequiredCalls = [];
  const statusCalls = [];
  const fetchCalls = [];

  const context = {
    window: {
      HMApp: {
        api: {
          setResolvedLocationHint: () => {},
          setStatus: (status) => statusCalls.push(status),
          setPermissionRequired: (required) => permissionRequiredCalls.push(Boolean(required)),
          setLoading: () => {},
          setStorageItem: () => {},
          getGeolocationErrorStatus: (error) => `geo:${error?.code ?? "unknown"}`,
          updateNextSummary: () => {},
          uniqueNonEmptyStrings: (items) =>
            [...new Set((Array.isArray(items) ? items : []).filter((item) => String(item || "").trim()))],
          sanitizeStopSelections: () => {},
          getActiveResultsLimit: () => 8,
          render: () => {},
          setLastUpdated: () => {},
          buildStatusFromResponse: () => "",
          trackFirstSuccessfulRender: () => {},
          persistUiState: () => {},
          trackInitialNearestStopResolved: () => {},
          reportClientError: () => {},
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
      geolocation,
      language: "en-US",
      languages: ["en-US"],
    },
    fetch: async (url) => {
      fetchCalls.push(String(url || ""));
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ station: { departures: [] }, stops: [] }),
      };
    },
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
  world.geolocationCalls = geolocationCalls;
  world.watchCalls = watchCalls;
  world.clearWatchCalls = clearWatchCalls;
  world.permissionRequiredCalls = permissionRequiredCalls;
  world.statusCalls = statusCalls;
  world.fetchCalls = fetchCalls;
}

function createPosition(lat, lon, accuracy, timestamp) {
  return {
    coords: {
      latitude: Number(lat),
      longitude: Number(lon),
      accuracy: Number(accuracy),
    },
    timestamp: Number(timestamp),
  };
}

function getLatestRequestedCoords(world) {
  const latestUrl = world.fetchCalls.at(-1);
  if (!latestUrl) return null;
  const query = latestUrl.split("?")[1] || "";
  const params = new URLSearchParams(query);
  return {
    lat: Number(params.get("lat")),
    lon: Number(params.get("lon")),
  };
}

defineFeature(test, featureText, {
  createWorld: () => ({
    api: null,
    state: null,
    geolocationCalls: [],
    watchCalls: [],
    clearWatchCalls: [],
    firstErrorCode: null,
    secondErrorCode: null,
    firstSuccessPosition: null,
    watchSuccessPosition: null,
    permissionRequiredCalls: [],
    statusCalls: [],
    fetchCalls: [],
  }),
  stepDefinitions: [
    {
      pattern: /^Given browser geolocation is available$/,
      run: ({ world }) => {
        bootDataApi(world);
      },
    },
    {
      pattern: /^Given the first location attempt fails with code (\d+)$/,
      run: ({ args, world }) => {
        world.firstErrorCode = Number(args[0]);
      },
    },
    {
      pattern: /^Given the high accuracy retry fails with code (\d+)$/,
      run: ({ args, world }) => {
        world.secondErrorCode = Number(args[0]);
      },
    },
    {
      pattern:
        /^Given current location is (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?) with timestamp (\d+) and accuracy (\d+)$/,
      run: ({ args, world }) => {
        const [lat, lon, timestamp, accuracy] = args;
        world.state.currentCoords = {
          lat: Number(lat),
          lon: Number(lon),
        };
        world.state.currentCoordsTimestampMs = Number(timestamp);
        world.state.currentCoordsAccuracyMeters = Number(accuracy);
      },
    },
    {
      pattern:
        /^Given the first location attempt returns (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?) with accuracy (\d+) and timestamp (\d+)$/,
      run: ({ args, world }) => {
        const [lat, lon, accuracy, timestamp] = args;
        world.firstSuccessPosition = createPosition(lat, lon, accuracy, timestamp);
      },
    },
    {
      pattern:
        /^Given a watched location update returns (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?) with accuracy (\d+) and timestamp (\d+)$/,
      run: ({ args, world }) => {
        const [lat, lon, accuracy, timestamp] = args;
        world.watchSuccessPosition = createPosition(lat, lon, accuracy, timestamp);
      },
    },
    {
      pattern: /^When the user refreshes location$/,
      run: async ({ assert, world }) => {
        const started = world.api.requestLocationAndLoad();
        assert.equal(started, true);
        if (world.firstSuccessPosition) {
          world.geolocationCalls[0].success(world.firstSuccessPosition);
        } else {
          world.geolocationCalls[0].error({ code: world.firstErrorCode });
        }

        if (Number.isInteger(world.secondErrorCode)) {
          world.geolocationCalls[1].error({ code: world.secondErrorCode });
        }

        if (world.watchSuccessPosition && world.watchCalls[0]) {
          world.watchCalls[0].success(world.watchSuccessPosition);
        }

        await new Promise((resolve) => setTimeout(resolve, 0));
      },
    },
    {
      pattern: /^Then the refresh retries once with high accuracy$/,
      run: ({ assert, world }) => {
        assert.equal(world.geolocationCalls.length, 2);
        assert.equal(world.geolocationCalls[1].options.enableHighAccuracy, true);
      },
    },
    {
      pattern: /^Then the refresh does not retry and permission is required$/,
      run: ({ assert, world }) => {
        assert.equal(world.geolocationCalls.length, 1);
        assert.equal(world.permissionRequiredCalls.at(-1), true);
        assert.equal(world.statusCalls.at(-1), "geo:1");
      },
    },
    {
      pattern: /^Then the refresh uses a watched location update$/,
      run: ({ assert, world }) => {
        assert.equal(world.watchCalls.length, 1);
        assert.equal(world.watchCalls[0].options.enableHighAccuracy, true);
        assert.equal(world.clearWatchCalls.length, 1);
      },
    },
    {
      pattern:
        /^Then departures are requested for latitude (-?\d+(?:\.\d+)?) and longitude (-?\d+(?:\.\d+)?)$/,
      run: ({ assert, args, world }) => {
        const coords = getLatestRequestedCoords(world);
        assert.ok(coords, "Expected departures request to be sent.");
        assert.equal(coords.lat, Number(args[0]));
        assert.equal(coords.lon, Number(args[1]));
      },
    },
    {
      pattern: /^Then status updates include "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.statusCalls.includes(args[0]), true);
      },
    },
  ],
});
