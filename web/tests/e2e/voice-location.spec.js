const { test, expect } = require("@playwright/test");
const { defineFeature } = require("../helpers/playwright-bdd");

function nextIso(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

function createStopModePayload({ stopName, selectedStopId, stopCode, line, destination, departureMinutes }) {
  return {
    station: {
      stopName,
      distanceMeters: 210,
      stopCode,
      departures: [
        {
          line,
          destination,
          departureIso: nextIso(departureMinutes),
        },
      ],
    },
    stops: [
      {
        id: selectedStopId,
        name: stopName,
        code: stopCode,
        stopCodes: [stopCode],
        distanceMeters: 210,
      },
    ],
    selectedStopId,
    filterOptions: {
      lines: [{ value: line, count: 1 }],
      destinations: [{ value: destination, count: 1 }],
    },
  };
}

function buildDeparturesPayload(requestUrl, profile = "default") {
  const mode = String(requestUrl.searchParams.get("mode") || "RAIL").toUpperCase();
  const line = String(requestUrl.searchParams.get("line") || "").trim();
  const lineIntent = ["1", "true", "yes", "line"].includes(
    String(requestUrl.searchParams.get("lineIntent") || "").toLowerCase()
  );

  if (lineIntent && line) {
    if (profile === "line-intent-no-match" && mode === "TRAM" && line === "9") {
      return {
        mode: "TRAM",
        station: null,
        stops: [],
        selectedStopId: null,
        filterOptions: { lines: [], destinations: [] },
        message: "No nearby departures found for tram 9.",
      };
    }

    if (profile === "line-intent-multi-mode-67" && line === "67") {
      if (mode === "BUS") {
        return createStopModePayload({
          stopName: "Bus 67 Stop",
          selectedStopId: "HSL:BUS67",
          stopCode: "B67",
          line: "67",
          destination: "Pasila",
          departureMinutes: 5,
        });
      }
      if (mode === "TRAM") {
        return createStopModePayload({
          stopName: "Tram 67 Stop",
          selectedStopId: "HSL:TRAM67",
          stopCode: "T67",
          line: "67",
          destination: "Kamppi",
          departureMinutes: 2,
        });
      }
      return {
        mode,
        station: null,
        stops: [],
        selectedStopId: null,
        filterOptions: { lines: [], destinations: [] },
        message: `No nearby departures found for ${mode.toLowerCase()} ${line}.`,
      };
    }

    if (mode === "BUS" && line === "67") {
      return createStopModePayload({
        stopName: "Bus 67 Stop",
        selectedStopId: "HSL:BUS67",
        stopCode: "B67",
        line: "67",
        destination: "Pasila",
        departureMinutes: 3,
      });
    }

    if (mode === "TRAM" && line === "9") {
      return createStopModePayload({
        stopName: "Tram 9 Stop",
        selectedStopId: "HSL:TRAM9",
        stopCode: "T9",
        line: "9",
        destination: "Kallio",
        departureMinutes: 4,
      });
    }

    if (mode === "RAIL" && line === "A") {
      return createStopModePayload({
        stopName: "A Train Station",
        selectedStopId: "HSL:RAILA",
        stopCode: "A1",
        line: "A",
        destination: "Helsinki",
        departureMinutes: 6,
      });
    }
  }

  const primaryLine = mode === "TRAM" ? "4" : mode === "METRO" ? "M1" : mode === "BUS" ? "550" : "I";

  return {
    station: {
      stopName: "Kamppi",
      distanceMeters: 210,
      stopCode: mode === "BUS" || mode === "TRAM" || mode === "METRO" ? "H1234" : undefined,
      departures: [
        {
          line: primaryLine,
          destination: "Pasila",
          track: mode === "RAIL" ? "4" : undefined,
          departureIso: nextIso(2),
        },
        {
          line: primaryLine,
          destination: "Itakeskus",
          track: mode === "RAIL" ? "5" : undefined,
          departureIso: nextIso(8),
        },
      ],
    },
    stops:
      mode === "BUS" || mode === "TRAM" || mode === "METRO"
        ? [
            {
              id: "HSL:1234",
              name: "Kamppi",
              code: "H1234",
              stopCodes: ["H1234"],
              distanceMeters: 210,
            },
          ]
        : undefined,
    selectedStopId: mode === "BUS" || mode === "TRAM" || mode === "METRO" ? "HSL:1234" : undefined,
    filterOptions:
      mode === "BUS" || mode === "TRAM" || mode === "METRO"
        ? {
            lines: [{ value: primaryLine, count: 2 }],
            destinations: [
              { value: "Pasila", count: 1 },
              { value: "Itakeskus", count: 1 },
            ],
          }
        : undefined,
  };
}

async function installApiMocks(page, profile = "default") {
  const calls = {
    departures: [],
    geocode: [],
    clientError: [],
  };

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());

    if (requestUrl.pathname === "/api/v1/departures") {
      calls.departures.push(Object.fromEntries(requestUrl.searchParams.entries()));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "cache-control": "no-store" },
        body: JSON.stringify(buildDeparturesPayload(requestUrl, profile)),
      });
      return;
    }

    if (requestUrl.pathname === "/api/v1/geocode") {
      calls.geocode.push(Object.fromEntries(requestUrl.searchParams.entries()));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "cache-control": "no-store" },
        body: JSON.stringify({
          location: {
            lat: 60.1699,
            lon: 24.9384,
            label: "Kamppi, Helsinki",
          },
        }),
      });
      return;
    }

    if (requestUrl.pathname === "/api/v1/client-error") {
      let payload = {};
      try {
        payload = request.postDataJSON() || {};
      } catch {
        payload = {};
      }
      calls.clientError.push(payload);
      await route.fulfill({ status: 204, body: "" });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "Not found" }),
    });
  });

  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());

  return calls;
}

async function installPromptMock(page, responses) {
  await page.addInitScript(
    ({ scriptedResponses }) => {
      const queue = Array.isArray(scriptedResponses) ? [...scriptedResponses] : [];
      window.__promptCalls = [];
      window.prompt = (message, defaultValue) => {
        window.__promptCalls.push({ message, defaultValue });
        return queue.length > 0 ? queue.shift() : null;
      };
    },
    { scriptedResponses: responses }
  );
}

async function installMicrophonePreflightMock(page) {
  await page.addInitScript(() => {
    window.__voiceMicPreflightCalls = 0;

    const mockGetUserMedia = async () => {
      window.__voiceMicPreflightCalls += 1;
      return {
        getTracks: () => [
          {
            stop: () => {},
          },
        ],
      };
    };

    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", {
        value: { getUserMedia: mockGetUserMedia },
        configurable: true,
      });
      return;
    }

    try {
      navigator.mediaDevices.getUserMedia = mockGetUserMedia;
    } catch {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: mockGetUserMedia,
        configurable: true,
      });
    }
  });
}

async function installUserAgentMock(page, userAgentValue) {
  await page.addInitScript(({ ua }) => {
    try {
      Object.defineProperty(navigator, "userAgent", {
        value: String(ua || ""),
        configurable: true,
      });
    } catch {}
  }, { ua: userAgentValue });
}

async function installFirefoxRuntimeMarker(page) {
  await page.addInitScript(() => {
    window.InstallTrigger = window.InstallTrigger || {};
  });
}

async function installSpeechRecognitionMock(page, { scenario, transcript }) {
  await page.addInitScript((mockConfig) => {
    const scenarioValue = String(mockConfig?.scenario || "success");
    const transcriptValue = String(mockConfig?.transcript || "Kamppi Helsinki");
    window.__speechStartCalls = 0;

    if (scenarioValue === "unsupported") {
      try {
        window.SpeechRecognition = undefined;
      } catch {}
      try {
        window.webkitSpeechRecognition = undefined;
      } catch {}
      try {
        Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
        Object.defineProperty(window, "webkitSpeechRecognition", {
          value: undefined,
          configurable: true,
        });
      } catch {}
      return;
    }

    class MockSpeechRecognition {
      constructor() {
        this.lang = "fi-FI";
        this.continuous = false;
        this.interimResults = true;
        this.maxAlternatives = 1;
        this.onresult = null;
        this.onerror = null;
        this.onend = null;
        this.onspeechend = null;
        this.onsoundend = null;
        this.onaudioend = null;
        this.onnomatch = null;
      }

      start() {
        window.__speechStartCalls += 1;
        if (scenarioValue === "start-throw:not-supported") {
          const error = new Error("SpeechRecognition start failed");
          error.name = "NotSupportedError";
          throw error;
        }

        setTimeout(() => {
          if (scenarioValue === "error:not-allowed") {
            this.onerror?.({ error: "not-allowed" });
            return;
          }

          if (scenarioValue === "error:audio-capture") {
            this.onerror?.({ error: "audio-capture" });
            return;
          }

          if (scenarioValue === "error:network") {
            this.onerror?.({ error: "network" });
            return;
          }

          if (scenarioValue === "no-speech") {
            this.onend?.();
            return;
          }

          const alternative = { transcript: transcriptValue };
          const result = [alternative];
          result.isFinal = true;
          const results = [result];
          this.onresult?.({ resultIndex: 0, results });
          this.onend?.();
        }, 10);
      }

      stop() {
        setTimeout(() => this.onend?.(), 0);
      }

      abort() {
        setTimeout(() => this.onend?.(), 0);
      }
    }

    window.SpeechRecognition = MockSpeechRecognition;
    window.webkitSpeechRecognition = MockSpeechRecognition;
  }, { scenario, transcript });
}

const featureText = `
Feature: Voice location

Scenario: Detect bus line intent in English
  Given prompt responses are ""
  And speech transcript is "Bus 67"
  And speech recognition scenario is "success"
  And API mocks are installed
  When the user triggers voice location
  Then geocode request count equals 0
  And departures request count is at least 1
  And first departures mode query equals "BUS"
  And first departures line query equals "67"
  And selected stop label equals "Bus 67 Stop"
  And current URL mode query equals "bus"
  And current URL line query equals "67"

Scenario: Detect tram line intent in Finnish suffix form
  Given prompt responses are ""
  And speech transcript is "9-ratikka"
  And speech recognition scenario is "success"
  And API mocks are installed
  When the user triggers voice location
  Then geocode request count equals 0
  And first departures mode query equals "TRAM"
  And first departures line query equals "9"
  And selected stop label equals "Tram 9 Stop"
  And current URL mode query equals "tram"
  And current URL line query equals "9"

Scenario: Detect rail line intent with Finnish phrasing
  Given prompt responses are ""
  And speech transcript is "A-juna"
  And speech recognition scenario is "success"
  And API mocks are installed
  When the user triggers voice location
  Then geocode request count equals 0
  And first departures mode query equals "RAIL"
  And first departures line query equals "A"
  And selected stop label equals "A Train Station"
  And current URL line query equals "A"

Scenario: Mode-less line utterance resolves with nearest upcoming mode winner
  Given prompt responses are ""
  And speech transcript is "67"
  And speech recognition scenario is "success"
  And departures API mock profile is "line-intent-multi-mode-67"
  And API mocks are installed
  When the user triggers voice location
  Then geocode request count equals 0
  And departures request count is at least 2
  And selected stop label equals "Tram 67 Stop"
  And current URL mode query equals "tram"
  And current URL line query equals "67"

Scenario: No matching nearby line departure shows explicit status
  Given prompt responses are ""
  And speech transcript is "Tram 9"
  And speech recognition scenario is "success"
  And departures API mock profile is "line-intent-no-match"
  And API mocks are installed
  When the user triggers voice location
  Then geocode request count equals 0
  And status text equals "No nearby departures found for tram 9."

Scenario: Location utterance keeps geocode path
  Given prompt responses are ""
  And speech transcript is "Kamppi Helsinki"
  And speech recognition scenario is "success"
  And API mocks are installed
  When the user triggers voice location
  Then geocode request count equals 1
  And departures request count equals 1
  And resolved location text contains "Kamppi Helsinki"

Scenario: Mode keyword location utterance keeps geocode path
  Given prompt responses are ""
  And speech transcript is "Tram to Kamppi"
  And speech recognition scenario is "success"
  And API mocks are installed
  When the user triggers voice location
  Then geocode request count equals 1
  And departures request count equals 1
  And first departures line query equals ""
  And resolved location text contains "Tram to Kamppi"

Scenario: Fall back to typed query when speech recognition is unsupported
  Given prompt responses are "Kamppi Helsinki"
  And speech recognition scenario is "unsupported"
  And API mocks are installed
  When the user triggers voice location
  Then geocode request count equals 1
  And resolved location text contains "Resolved location: Kamppi, Helsinki"
  And prompt dialog was shown
  And first geocode query text equals "Kamppi Helsinki"

Scenario: Request microphone preflight before Firefox-style startup fallback
  Given prompt responses are ""
  And speech recognition scenario is "start-throw:not-supported"
  And microphone preflight is stubbed as granted
  And API mocks are installed
  When the user triggers voice location
  Then microphone preflight call count equals 1
  And prompt dialog was shown

Scenario: Firefox user agent still uses speech when constructor exists
  Given browser user agent is "Mozilla/5.0 Firefox/124.0"
  And prompt responses are ""
  And speech recognition scenario is "success"
  And API mocks are installed
  When the user triggers voice location
  Then speech recognition start call count equals 1
  And prompt dialog was not shown
  And geocode request count equals 1
  And first geocode query text equals "Kamppi Helsinki"

Scenario: Unsupported speech shows generic unsupported status
  Given browser user agent is "Mozilla/5.0 Firefox/124.0"
  And prompt responses are ""
  And speech recognition scenario is "unsupported"
  And API mocks are installed
  When the user triggers voice location
  Then speech recognition start call count equals 0
  And status text equals "This browser does not support speech recognition. Type your location or line (number or letter) instead."
  And geocode request count equals 0

Scenario: Runtime marker still shows generic unsupported status
  Given browser user agent is "Mozilla/5.0 (X11; Linux x86_64)"
  And browser has Firefox runtime marker
  And prompt responses are ""
  And speech recognition scenario is "unsupported"
  And API mocks are installed
  When the user triggers voice location
  Then speech recognition start call count equals 0
  And status text equals "This browser does not support speech recognition. Type your location or line (number or letter) instead."
  And geocode request count equals 0

Scenario: Show clear status when microphone permission is denied
  Given prompt responses are ""
  And speech recognition scenario is "error:not-allowed"
  And API mocks are installed
  When the user triggers voice location
  Then status text equals "Microphone permission denied."
  And geocode request count equals 0

Scenario: Show clear status when no microphone is available
  Given prompt responses are ""
  And speech recognition scenario is "error:audio-capture"
  And API mocks are installed
  When the user triggers voice location
  Then status text equals "No microphone was found for voice location."
  And geocode request count equals 0

Scenario: Use speech transcript when recognition succeeds
  Given prompt responses are ""
  And speech recognition scenario is "success"
  And API mocks are installed
  When the user triggers voice location
  Then geocode request count equals 1
  And departures request count equals 1
  And resolved location text contains "Kamppi Helsinki"
`;

defineFeature(test, featureText, {
  failFirstProbe: true,
  createWorld: ({ fixtures }) => ({
    page: fixtures.page,
    calls: null,
    speechScenario: "success",
    speechTranscript: "Kamppi Helsinki",
    apiProfile: "default",
    shouldStubMicPreflight: true,
    userAgentOverride:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    hasFirefoxRuntimeMarker: false,
  }),
  stepDefinitions: [
    {
      pattern: /^Given prompt responses are "([^"]*)"$/,
      run: async ({ args, world }) => {
        const responses = args[0]
          .split("|")
          .map((value) => value.trim())
          .filter(Boolean);
        await installPromptMock(world.page, responses);
      },
    },
    {
      pattern: /^Given speech transcript is "([^"]*)"$/,
      run: ({ args, world }) => {
        world.speechTranscript = args[0];
      },
    },
    {
      pattern: /^Given speech recognition scenario is "([^"]*)"$/,
      run: ({ args, world }) => {
        world.speechScenario = args[0];
      },
    },
    {
      pattern: /^Given browser user agent is "([^"]*)"$/,
      run: ({ args, world }) => {
        world.userAgentOverride = args[0];
      },
    },
    {
      pattern: /^Given microphone preflight is stubbed as granted$/,
      run: ({ world }) => {
        world.shouldStubMicPreflight = true;
      },
    },
    {
      pattern: /^Given browser has Firefox runtime marker$/,
      run: ({ world }) => {
        world.hasFirefoxRuntimeMarker = true;
      },
    },
    {
      pattern: /^Given departures API mock profile is "([^"]*)"$/,
      run: ({ args, world }) => {
        world.apiProfile = args[0];
      },
    },
    {
      pattern: /^Given API mocks are installed$/,
      run: async ({ world }) => {
        world.calls = await installApiMocks(world.page, world.apiProfile);
      },
    },
    {
      pattern: /^When the user triggers voice location$/,
      run: async ({ world }) => {
        if (world.shouldStubMicPreflight) {
          await installMicrophonePreflightMock(world.page);
        }
        if (world.hasFirefoxRuntimeMarker) {
          await installFirefoxRuntimeMarker(world.page);
        }
        await installUserAgentMock(world.page, world.userAgentOverride);
        await installSpeechRecognitionMock(world.page, {
          scenario: world.speechScenario,
          transcript: world.speechTranscript,
        });
        await world.page.goto("/");
        await expect(world.page.locator("#voiceLocateBtn")).toBeEnabled();
        await world.page.locator("#voiceLocateBtn").click();
      },
    },
    {
      pattern: /^Then geocode request count equals (\d+)$/,
      run: async ({ assert, args, world }) => {
        const expectedCount = Number(args[0]);
        if (expectedCount > 0) {
          await expect.poll(() => world.calls.geocode.length).toBe(expectedCount);
        }
        assert.equal(world.calls.geocode.length, expectedCount);
      },
    },
    {
      pattern: /^Then departures request count equals (\d+)$/,
      run: async ({ assert, args, world }) => {
        const expectedCount = Number(args[0]);
        if (expectedCount > 0) {
          await expect.poll(() => world.calls.departures.length).toBe(expectedCount);
        }
        assert.equal(world.calls.departures.length, expectedCount);
      },
    },
    {
      pattern: /^Then departures request count is at least (\d+)$/,
      run: async ({ assert, args, world }) => {
        const minimum = Number(args[0]);
        await expect.poll(() => world.calls.departures.length >= minimum).toBe(true);
        assert.ok(world.calls.departures.length >= minimum);
      },
    },
    {
      pattern: /^Then first departures mode query equals "([^"]*)"$/,
      run: async ({ assert, args, world }) => {
        await expect.poll(() => world.calls.departures.length).toBeGreaterThan(0);
        assert.equal(String(world.calls.departures[0]?.mode || "").toUpperCase(), args[0]);
      },
    },
    {
      pattern: /^Then first departures line query equals "([^"]*)"$/,
      run: async ({ assert, args, world }) => {
        await expect.poll(() => world.calls.departures.length).toBeGreaterThan(0);
        assert.equal(String(world.calls.departures[0]?.line || ""), args[0]);
      },
    },
    {
      pattern: /^Then resolved location text contains "(.+)"$/,
      run: async ({ args, world }) => {
        await expect(world.page.locator("#resolvedLocation")).toContainText(args[0]);
      },
    },
    {
      pattern: /^Then prompt dialog was shown$/,
      run: async ({ assert, world }) => {
        const promptCalls = await world.page.evaluate(() => window.__promptCalls.length);
        assert.ok(promptCalls > 0);
      },
    },
    {
      pattern: /^Then prompt dialog was not shown$/,
      run: async ({ assert, world }) => {
        const promptCalls = await world.page.evaluate(() => window.__promptCalls.length);
        assert.equal(promptCalls, 0);
      },
    },
    {
      pattern: /^Then microphone preflight call count equals (\d+)$/,
      run: async ({ assert, args, world }) => {
        const actualCount = await world.page.evaluate(() => Number(window.__voiceMicPreflightCalls || 0));
        assert.equal(actualCount, Number(args[0]));
      },
    },
    {
      pattern: /^Then speech recognition start call count equals (\d+)$/,
      run: async ({ assert, args, world }) => {
        const actualCount = await world.page.evaluate(() => Number(window.__speechStartCalls || 0));
        assert.equal(actualCount, Number(args[0]));
      },
    },
    {
      pattern: /^Then first geocode query text equals "([^"]*)"$/,
      run: async ({ assert, args, world }) => {
        assert.equal(world.calls.geocode[0]?.text, args[0]);
      },
    },
    {
      pattern: /^Then selected stop label equals "([^"]*)"$/,
      run: async ({ args, world }) => {
        await expect(world.page.locator("#busStopSelectLabel")).toHaveText(args[0]);
      },
    },
    {
      pattern: /^Then current URL mode query equals "([^"]*)"$/,
      run: async ({ assert, args, world }) => {
        const url = new URL(world.page.url());
        assert.equal(url.searchParams.get("mode"), args[0]);
      },
    },
    {
      pattern: /^Then current URL line query equals "([^"]*)"$/,
      run: async ({ assert, args, world }) => {
        const url = new URL(world.page.url());
        const lines = url.searchParams.getAll("line");
        assert.deepEqual(lines, [args[0]]);
      },
    },
    {
      pattern: /^Then status text equals "([^"]*)"$/,
      run: async ({ args, world }) => {
        await expect(world.page.locator("#status")).toHaveText(args[0]);
      },
    },
  ],
});
