const { test, expect } = require("@playwright/test");

function nextIso(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

function buildDeparturesPayload(requestUrl) {
  const mode = String(requestUrl.searchParams.get("mode") || "RAIL").toUpperCase();
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

async function installApiMocks(page) {
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
        body: JSON.stringify(buildDeparturesPayload(requestUrl)),
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
  await page.addInitScript(({ scriptedResponses }) => {
    const queue = Array.isArray(scriptedResponses) ? [...scriptedResponses] : [];
    window.__promptCalls = [];
    window.prompt = (message, defaultValue) => {
      window.__promptCalls.push({ message, defaultValue });
      return queue.length > 0 ? queue.shift() : null;
    };
  }, { scriptedResponses: responses });
}

async function installSpeechRecognitionMock(page, scenario) {
  await page.addInitScript((mockScenario) => {
    const scenarioValue = String(mockScenario || "success");

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

          const alternative = { transcript: "Kamppi Helsinki" };
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
  }, scenario);
}

test("falls back to typed query when voice recognition is unsupported", async ({ page }) => {
  await installPromptMock(page, ["Kamppi Helsinki"]);
  await installSpeechRecognitionMock(page, "unsupported");
  const calls = await installApiMocks(page);

  await page.goto("/");
  await expect(page.locator("#voiceLocateBtn")).toBeEnabled();

  await page.locator("#voiceLocateBtn").click();

  await expect.poll(() => calls.geocode.length).toBe(1);
  await expect(page.locator("#resolvedLocation")).toContainText("Resolved location: Kamppi, Helsinki");

  const promptCalls = await page.evaluate(() => window.__promptCalls.length);
  expect(promptCalls).toBeGreaterThan(0);

  expect(calls.geocode[0].text).toBe("Kamppi Helsinki");
});

test("shows a clear status when microphone permission is denied", async ({ page }) => {
  await installPromptMock(page, []);
  await installSpeechRecognitionMock(page, "error:not-allowed");
  const calls = await installApiMocks(page);

  await page.goto("/");
  await expect(page.locator("#voiceLocateBtn")).toBeEnabled();

  await page.locator("#voiceLocateBtn").click();

  await expect(page.locator("#status")).toHaveText("Microphone permission denied.");
  expect(calls.geocode.length).toBe(0);
});

test("shows a clear status when no microphone is available", async ({ page }) => {
  await installPromptMock(page, []);
  await installSpeechRecognitionMock(page, "error:audio-capture");
  const calls = await installApiMocks(page);

  await page.goto("/");
  await expect(page.locator("#voiceLocateBtn")).toBeEnabled();

  await page.locator("#voiceLocateBtn").click();

  await expect(page.locator("#status")).toHaveText("No microphone was found for voice location.");
  expect(calls.geocode.length).toBe(0);
});

test("uses speech transcript when recognition succeeds", async ({ page }) => {
  await installPromptMock(page, []);
  await installSpeechRecognitionMock(page, "success");
  const calls = await installApiMocks(page);

  await page.goto("/");
  await expect(page.locator("#voiceLocateBtn")).toBeEnabled();

  await page.locator("#voiceLocateBtn").click();

  await expect.poll(() => calls.geocode.length).toBe(1);
  await expect(page.locator("#resolvedLocation")).toContainText("from \"Kamppi Helsinki\"");
});
