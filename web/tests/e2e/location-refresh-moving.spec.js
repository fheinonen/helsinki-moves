const { test, expect } = require("@playwright/test");
const { defineFeature } = require("../helpers/playwright-bdd");

function nextIso(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildDeparturesPayload({ stopName, stopCode, stopId, distanceMeters, line }) {
  return {
    mode: "BUS",
    station: {
      stopName,
      stopCode,
      stopCodes: [stopCode],
      type: "stop",
      distanceMeters,
      departures: [
        {
          line,
          destination: "Pasila",
          departureIso: nextIso(3),
          stopId,
          stopCode,
          stopName,
        },
      ],
    },
    stops: [
      {
        id: stopId,
        name: stopName,
        code: stopCode,
        stopCodes: [stopCode],
        distanceMeters,
      },
    ],
    selectedStopId: stopId,
    filterOptions: {
      lines: [{ value: line, count: 1 }],
      destinations: [{ value: "Pasila", count: 1 }],
    },
  };
}

function classifyLocation(lat, lon) {
  const nearPasila =
    Math.abs(lat - 60.1997) < 0.01 &&
    Math.abs(lon - 24.9354) < 0.02;

  if (nearPasila) {
    return {
      stopName: "Pasila station",
      stopCode: "P100",
      stopId: "HSL:PASILA",
      distanceMeters: 120,
      line: "23",
    };
  }

  return {
    stopName: "Huopalahti station",
    stopCode: "H200",
    stopId: "HSL:HUOPA",
    distanceMeters: 980,
    line: "52",
  };
}

const featureText = `
Feature: Moving location refresh

Scenario: Refresh location updates nearest stop after movement
  Given geolocation permission is pre-granted
  And departures API uses request coordinates for nearest stop response
  And browser geolocation is at 60.2220, 24.8990
  When the page is opened in bus mode
  Then selected stop label equals "Huopalahti station"
  And station distance text equals "980m away"
  When browser geolocation moves to 60.1997, 24.9354
  And the user taps refresh location
  Then latest departures request latitude is 60.1997
  And latest departures request longitude is 24.9354
  And selected stop label equals "Pasila station"
  And station distance text equals "120m away"

Scenario: Refresh falls back to last known location when geolocation is unavailable
  Given geolocation permission is pre-granted
  And departures API uses request coordinates for nearest stop response
  And browser geolocation is at 60.2220, 24.8990
  When the page is opened in bus mode
  Then selected stop label equals "Huopalahti station"
  And station distance text equals "980m away"
  When geolocation becomes temporarily unavailable
  And the user taps refresh location
  Then geolocation refresh retries once with high accuracy
  And latest departures request latitude is 60.2220
  And latest departures request longitude is 24.8990
  And selected stop label equals "Huopalahti station"
  And station distance text equals "980m away"
`;

defineFeature(test, featureText, {
  failFirstProbe: true,
  createWorld: ({ fixtures }) => ({
    page: fixtures.page,
    departuresCalls: [],
  }),
  stepDefinitions: [
    {
      pattern: /^Given geolocation permission is pre-granted$/,
      run: async ({ world }) => {
        await world.page.addInitScript(() => {
          window.localStorage.setItem("location:granted", "1");
          window.localStorage.setItem("prefs:mode", "bus");

          const ensureState = () => {
            const existing = window.__testGeoState || {};
            window.__testGeoState = {
              lat: Number.isFinite(Number(existing.lat)) ? Number(existing.lat) : 60.1699,
              lon: Number.isFinite(Number(existing.lon)) ? Number(existing.lon) : 24.9384,
              accuracy: Number.isFinite(Number(existing.accuracy)) ? Number(existing.accuracy) : 20,
              mode: String(existing.mode || "ok"),
              timestamp: Number.isFinite(Number(existing.timestamp))
                ? Number(existing.timestamp)
                : Date.now(),
            };
            return window.__testGeoState;
          };

          const readPosition = () => {
            const state = ensureState();
            return {
              coords: {
                latitude: state.lat,
                longitude: state.lon,
                accuracy: state.accuracy,
              },
              timestamp: state.timestamp,
            };
          };

          let watchIdCounter = 0;
          const watchers = new Map();
          window.__testGeoCalls = [];
          const geolocationMock = {
            getCurrentPosition(success, error, options) {
              setTimeout(() => {
                const state = ensureState();
                window.__testGeoCalls.push({
                  type: "getCurrentPosition",
                  enableHighAccuracy: Boolean(options?.enableHighAccuracy),
                  mode: state.mode,
                });
                if (state.mode === "unavailable") {
                  error?.({ code: 2 });
                  return;
                }
                success(readPosition());
              }, 0);
            },
            watchPosition(success, error, options) {
              watchIdCounter += 1;
              watchers.set(watchIdCounter, success);
              setTimeout(() => {
                const state = ensureState();
                window.__testGeoCalls.push({
                  type: "watchPosition",
                  enableHighAccuracy: Boolean(options?.enableHighAccuracy),
                  mode: state.mode,
                });
                if (state.mode === "unavailable") {
                  error?.({ code: 2 });
                  return;
                }
                success(readPosition());
              }, 0);
              return watchIdCounter;
            },
            clearWatch(id) {
              watchers.delete(id);
            },
          };

          Object.defineProperty(navigator, "geolocation", {
            configurable: true,
            value: geolocationMock,
          });

          window.__setTestGeolocation = (nextLat, nextLon, nextAccuracy = 20) => {
            const lat = Number(nextLat);
            const lon = Number(nextLon);
            const accuracy = Number(nextAccuracy);
            window.__testGeoState = {
              lat: Number.isFinite(lat) ? lat : window.__testGeoState?.lat || 60.1699,
              lon: Number.isFinite(lon) ? lon : window.__testGeoState?.lon || 24.9384,
              accuracy: Number.isFinite(accuracy) ? accuracy : 20,
              mode: String(window.__testGeoState?.mode || "ok"),
              timestamp: Date.now(),
            };
            const position = readPosition();
            for (const notify of watchers.values()) {
              notify(position);
            }
          };

          window.__setTestGeolocationMode = (mode) => {
            const nextMode = String(mode || "ok").trim().toLowerCase();
            const normalizedMode = nextMode === "unavailable" ? "unavailable" : "ok";
            const state = ensureState();
            window.__testGeoState = {
              ...state,
              mode: normalizedMode,
              timestamp: Date.now(),
            };
          };
        });
      },
    },
    {
      pattern: /^Given departures API uses request coordinates for nearest stop response$/,
      run: async ({ world }) => {
        await world.page.route("**/api/v1/**", async (route) => {
          const requestUrl = new URL(route.request().url());
          if (requestUrl.pathname === "/api/v1/departures") {
            const lat = toNumber(requestUrl.searchParams.get("lat"));
            const lon = toNumber(requestUrl.searchParams.get("lon"));
            world.departuresCalls.push({ lat, lon });
            const nearest = classifyLocation(lat, lon);
            await route.fulfill({
              status: 200,
              contentType: "application/json",
              headers: { "cache-control": "no-store" },
              body: JSON.stringify(buildDeparturesPayload(nearest)),
            });
            return;
          }

          if (requestUrl.pathname === "/api/v1/client-error") {
            await route.fulfill({ status: 204, body: "" });
            return;
          }

          await route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ error: "Not found" }),
          });
        });

        await world.page.route("https://fonts.googleapis.com/**", (route) => route.abort());
        await world.page.route("https://fonts.gstatic.com/**", (route) => route.abort());
      },
    },
    {
      pattern: /^Given browser geolocation is at (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)$/,
      run: async ({ args, world }) => {
        const lat = Number(args[0]);
        const lon = Number(args[1]);
        await world.page.addInitScript(
          ({ initialLat, initialLon }) => {
            const nextState = window.__testGeoState || {};
            window.__testGeoState = {
              ...nextState,
              lat: initialLat,
              lon: initialLon,
              mode: String(nextState.mode || "ok"),
              timestamp: Date.now(),
            };
          },
          { initialLat: lat, initialLon: lon }
        );
      },
    },
    {
      pattern: /^When the page is opened in bus mode$/,
      run: async ({ world }) => {
        await world.page.goto("/?mode=bus");
      },
    },
    {
      pattern: /^Then selected stop label equals "([^"]*)"$/,
      run: async ({ assert, args, world }) => {
        assert.ok(true);
        await expect(world.page.locator("#busStopSelectLabel")).toHaveText(args[0]);
      },
    },
    {
      pattern: /^Then station distance text equals "([^"]*)"$/,
      run: async ({ assert, args, world }) => {
        assert.ok(true);
        await expect(world.page.locator("#stationMeta")).toHaveText(args[0]);
      },
    },
    {
      pattern: /^When browser geolocation moves to (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)$/,
      run: async ({ args, world }) => {
        const lat = Number(args[0]);
        const lon = Number(args[1]);
        await world.page.evaluate(
          ({ nextLat, nextLon }) => {
            if (typeof window.__setTestGeolocation === "function") {
              window.__setTestGeolocation(nextLat, nextLon, 20);
            }
          },
          { nextLat: lat, nextLon: lon }
        );
      },
    },
    {
      pattern: /^When geolocation becomes temporarily unavailable$/,
      run: async ({ world }) => {
        await world.page.evaluate(() => {
          if (typeof window.__setTestGeolocationMode === "function") {
            window.__setTestGeolocationMode("unavailable");
          }
        });
      },
    },
    {
      pattern: /^When the user taps refresh location$/,
      run: async ({ world }) => {
        const callsBefore = world.departuresCalls.length;
        await world.page.click("#locateBtn");
        await expect
          .poll(() => world.departuresCalls.length)
          .toBeGreaterThan(callsBefore);
      },
    },
    {
      pattern: /^Then geolocation refresh retries once with high accuracy$/,
      run: async ({ assert, world }) => {
        const calls = await world.page.evaluate(() =>
          Array.isArray(window.__testGeoCalls) ? [...window.__testGeoCalls] : []
        );
        const getCalls = calls.filter((call) => call.type === "getCurrentPosition");
        assert.equal(getCalls.length >= 3, true);
        const latestPair = getCalls.slice(-2);
        assert.equal(latestPair[0]?.enableHighAccuracy, false);
        assert.equal(latestPair[1]?.enableHighAccuracy, true);
      },
    },
    {
      pattern: /^Then latest departures request latitude is (-?\d+(?:\.\d+)?)$/,
      run: async ({ assert, args, world }) => {
        const last = world.departuresCalls.at(-1);
        assert.ok(last, "Expected at least one departures request.");
        assert.equal(last.lat, Number(args[0]));
      },
    },
    {
      pattern: /^Then latest departures request longitude is (-?\d+(?:\.\d+)?)$/,
      run: async ({ assert, args, world }) => {
        const last = world.departuresCalls.at(-1);
        assert.ok(last, "Expected at least one departures request.");
        assert.equal(last.lon, Number(args[0]));
      },
    },
  ],
});
