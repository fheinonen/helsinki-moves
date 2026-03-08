import { test } from "@playwright/test";
import { definePlaywrightFeature } from "@tests/helpers/playwright-bdd-runner";

function buildDeparturesPayload(input: {
  destination?: string;
  line?: string;
  minutesFromNow?: number;
  mode?: string;
  stationName?: string;
  stopId?: string;
} = {}): Record<string, unknown> {
  const {
    destination = "Kamppi",
    line = "550",
    minutesFromNow = 5,
    mode = "BUS",
    stationName = "Kamppi",
    stopId = "HSL:STOP_A",
  } = input;
  return {
    filterOptions: {
      destinations: [{ count: 1, value: destination }],
      lines: [{ count: 1, value: line }],
    },
    mode,
    selectedStopId: stopId,
    station: {
      departures: [
        {
          departureIso: new Date(Date.now() + minutesFromNow * 60_000).toISOString(),
          destination,
          line,
        },
      ],
      distanceMeters: 80,
      stopCode: "A1",
      stopCodes: ["A1"],
      stopName: stationName,
      type: "stop",
    },
    stops: [
      {
        code: "A1",
        distanceMeters: 80,
        id: stopId,
        memberStopIds: [stopId],
        name: stationName,
        stopCodes: ["A1"],
      },
    ],
  };
}

definePlaywrightFeature(
  test,
  `
Feature: Voice search

  Scenario: Voice action is unavailable when browser recording support is missing
    Given departures are mocked for voice search
    And browser voice APIs are unavailable
    When the user opens the app
    Then the voice action label is Voice Unavailable
    And the voice action is disabled

  Scenario: Voice search captures and transcribes a short query
    Given departures are mocked for voice search
    And browser voice APIs are available
    And speech transcription returns Kamppi
    And geocode resolves Kamppi
    When the user opens the app
    And the user starts voice search
    Then the station title is Kamppi

  Scenario: Voice search shows transcription failure status
    Given departures are mocked for voice search
    And browser voice APIs are available
    And speech transcription fails
    When the user opens the app
    And the user starts voice search
    Then the status message is Could not transcribe speech

  Scenario: Voice search falls back to typed input when transcription is unavailable
    Given departures are mocked for voice search
    And browser voice APIs are available
    And typed voice fallback returns Ruoholahti
    And speech transcription is unavailable
    And geocode resolves typed fallback location
    When the user opens the app
    And the user starts voice search
    Then the station title is Ruoholahti
    And the typed voice fallback prompt call count is 1
    And the last typed voice fallback prompt is "Voice recognition is unavailable right now. Type your location or line (number or letter) instead:\\nExample: Kamppi Helsinki, A-train, bus 52, 200"

  Scenario: Voice search shows a stable geocode failure message
    Given departures are mocked for voice search
    And browser voice APIs are available
    And speech transcription returns Kamppi
    And geocode fails
    When the user opens the app
    And the user starts voice search
    Then the status message is Could not approximate location. Please try again.

  Scenario: Voice search resolves a spoken line intent to the winning nearby mode
    Given line-intent departures are mocked for voice search
    And browser voice APIs are available
    And speech transcription returns line 67
    And geocode fails
    When the user opens the app
    And the user starts voice search
    Then the station title is Tram 67 Stop
    And the TRAM mode button is active

  Scenario: Voice search shows ambiguous location choices
    Given departures are mocked for voice search
    And browser voice APIs are available
    And speech transcription returns Kamppi
    And geocode returns ambiguous Kamppi choices
    When the user opens the app
    And the user starts voice search
    Then the status message is Multiple matches found. Choose one below.
    And two voice choices are visible
    When the user chooses the second voice choice
    Then the station title is Ruoholahti
  `,
  {
    createWorld: async () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given departures are mocked for voice search$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/departures**", async (route) => {
            const requestUrl = new URL(route.request().url());
            const lat = requestUrl.searchParams.get("lat");
            const lon = requestUrl.searchParams.get("lon");
            const isEspooChoice = lat === "60.18" && lon === "24.95";
            await route.fulfill({
              body: JSON.stringify(
                isEspooChoice
                  ? buildDeparturesPayload({
                      destination: "Ruoholahti",
                      line: "560",
                      stationName: "Ruoholahti",
                      stopId: "HSL:STOP_B",
                    })
                  : buildDeparturesPayload()
              ),
              contentType: "application/json",
              status: 200,
            });
          });
        },
      },
      {
        pattern: /^Given line-intent departures are mocked for voice search$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/departures**", async (route) => {
            const requestUrl = new URL(route.request().url());
            const lineIntent = requestUrl.searchParams.get("lineIntent");
            const mode = String(requestUrl.searchParams.get("mode") || "").toUpperCase();
            const line = requestUrl.searchParams.get("line");

            if (lineIntent === "1" && line === "67") {
              const payload =
                mode === "TRAM"
                  ? buildDeparturesPayload({
                      destination: "Kamppi",
                      line: "67",
                      minutesFromNow: 3,
                      mode: "TRAM",
                      stationName: "Tram 67 Stop",
                      stopId: "HSL:TRAM67",
                    })
                  : mode === "BUS"
                    ? buildDeparturesPayload({
                        destination: "Pasila",
                        line: "67",
                        minutesFromNow: 5,
                        mode: "BUS",
                        stationName: "Bus 67 Stop",
                        stopId: "HSL:BUS67",
                      })
                    : {
                        filterOptions: { destinations: [], lines: [] },
                        message: `No nearby departures found for ${mode.toLowerCase()} 67.`,
                        mode,
                        selectedStopId: null,
                        station: null,
                        stops: [],
                      };

              await route.fulfill({
                body: JSON.stringify(payload),
                contentType: "application/json",
                status: 200,
              });
              return;
            }

            await route.fulfill({
              body: JSON.stringify(buildDeparturesPayload()),
              contentType: "application/json",
              status: 200,
            });
          });
        },
      },
      {
        pattern: /^Given browser voice APIs are unavailable$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.addInitScript(() => {
            Object.defineProperty(window, "MediaRecorder", {
              configurable: true,
              value: undefined,
            });
            Object.defineProperty(navigator, "mediaDevices", {
              configurable: true,
              value: {},
            });
          });
        },
      },
      {
        pattern: /^Given browser voice APIs are available$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.addInitScript(() => {
            class FakeMediaRecorder extends EventTarget {
              static isTypeSupported() {
                return true;
              }

              mimeType = "audio/webm";
              state = "inactive";

              start() {
                this.state = "recording";
              }

              requestData() {
                const event = new Event("dataavailable") as Event & { data?: Blob };
                event.data = new Blob(["voice"], { type: "audio/webm" });
                this.dispatchEvent(event);
              }

              stop() {
                this.requestData();
                this.state = "inactive";
                this.dispatchEvent(new Event("stop"));
              }
            }

            Object.defineProperty(window, "MediaRecorder", {
              configurable: true,
              value: FakeMediaRecorder,
            });
            Object.defineProperty(navigator, "mediaDevices", {
              configurable: true,
              value: {
                async getUserMedia() {
                  return {
                    getTracks() {
                      return [
                        {
                          stop() {},
                        },
                      ];
                    },
                  };
                },
              },
            });
          });
        },
      },
      {
        pattern: /^Given typed voice fallback returns Ruoholahti$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.addInitScript(() => {
            const calls: string[] = [];
            Object.defineProperty(window, "__voicePromptCalls", {
              configurable: true,
              value: calls,
              writable: false,
            });
            Object.defineProperty(window, "prompt", {
              configurable: true,
              value(message?: string) {
                calls.push(String(message || ""));
                return "Ruoholahti";
              },
            });
          });
        },
      },
      {
        pattern: /^Given speech transcription returns Kamppi$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/speech-transcribe", async (route) => {
            await route.fulfill({
              body: JSON.stringify({
                transcript: "Kamppi",
              }),
              contentType: "application/json",
              status: 200,
            });
          });
        },
      },
      {
        pattern: /^Given speech transcription is unavailable$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/speech-transcribe", async (route) => {
            await route.fulfill({
              body: JSON.stringify({
                error: "Speech transcription is not configured",
              }),
              contentType: "application/json",
              status: 503,
            });
          });
        },
      },
      {
        pattern: /^Given speech transcription returns line 67$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/speech-transcribe", async (route) => {
            await route.fulfill({
              body: JSON.stringify({
                transcript: "67",
              }),
              contentType: "application/json",
              status: 200,
            });
          });
        },
      },
      {
        pattern: /^Given geocode resolves typed fallback location$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/geocode**", async (route) => {
            await route.fulfill({
              body: JSON.stringify({
                ambiguous: false,
                choices: [],
                location: {
                  confidence: 0.9,
                  label: "Ruoholahti",
                  latitude: 60.18,
                  longitude: 24.95,
                },
                query: "Ruoholahti",
              }),
              contentType: "application/json",
              status: 200,
            });
          });
        },
      },
      {
        pattern: /^Given geocode resolves Kamppi$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/geocode**", async (route) => {
            await route.fulfill({
              body: JSON.stringify({
                ambiguous: false,
                choices: [],
                location: {
                  confidence: 0.9,
                  label: "Kamppi",
                  latitude: 60.17,
                  longitude: 24.94,
                },
                query: "Kamppi",
              }),
              contentType: "application/json",
              status: 200,
            });
          });
        },
      },
      {
        pattern: /^Given geocode returns ambiguous Kamppi choices$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/geocode**", async (route) => {
            await route.fulfill({
              body: JSON.stringify({
                ambiguous: true,
                choices: [
                  {
                    confidence: 0.8,
                    label: "Kamppi, Helsinki",
                    latitude: 60.17,
                    longitude: 24.94,
                  },
                  {
                    confidence: 0.79,
                    label: "Kamppi, Espoo",
                    latitude: 60.18,
                    longitude: 24.95,
                  },
                ],
                location: null,
                message: "Multiple matches found. Choose one below.",
                query: "Kamppi",
              }),
              contentType: "application/json",
              status: 200,
            });
          });
        },
      },
      {
        pattern: /^Given geocode fails$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/geocode**", async (route) => {
            await route.fulfill({
              body: JSON.stringify({
                error: "Could not approximate location. Please try again.",
              }),
              contentType: "application/json",
              status: 500,
            });
          });
        },
      },
      {
        pattern: /^Given speech transcription fails$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.route("**/api/v1/speech-transcribe", async (route) => {
            await route.fulfill({
              body: JSON.stringify({
                error: "Could not transcribe speech",
              }),
              contentType: "application/json",
              status: 502,
            });
          });
        },
      },
      {
        pattern: /^When the user opens the app$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.goto("/");
        },
      },
      {
        pattern: /^When the user starts voice search$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.locator("[data-voice-action]").click();
        },
      },
      {
        pattern: /^Then the voice action label is Voice Unavailable$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          assert.equal(await page.locator("[data-voice-label]").textContent(), "Voice Unavailable");
        },
      },
      {
        pattern: /^Then the voice action is disabled$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          assert.equal(await page.locator("[data-voice-action]").isDisabled(), true);
        },
      },
      {
        pattern: /^Then the status message is Captured voice query: Kamppi$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForFunction(() => {
            const element = document.querySelector("[data-status]");
            return element?.textContent === "Captured voice query: Kamppi";
          });
          assert.equal(await page.locator("[data-status]").textContent(), "Captured voice query: Kamppi");
        },
      },
      {
        pattern: /^Then the station title is Kamppi$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForFunction(() => {
            const element = document.querySelector("[data-station-title]");
            return element?.textContent === "Kamppi";
          });
          assert.equal(await page.locator("[data-station-title]").textContent(), "Kamppi");
        },
      },
      {
        pattern: /^Then the station title is Tram 67 Stop$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForFunction(() => {
            const element = document.querySelector("[data-station-title]");
            return element?.textContent === "Tram 67 Stop";
          });
          assert.equal(await page.locator("[data-station-title]").textContent(), "Tram 67 Stop");
        },
      },
      {
        pattern: /^Then the TRAM mode button is active$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          assert.equal(await page.locator('[data-mode="TRAM"]').getAttribute("aria-checked"), "true");
        },
      },
      {
        pattern: /^Then the status message is Could not transcribe speech$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForFunction(() => {
            const element = document.querySelector("[data-status]");
            return element?.textContent === "Could not transcribe speech";
          });
          assert.equal(await page.locator("[data-status]").textContent(), "Could not transcribe speech");
        },
      },
      {
        pattern: /^(?:Then|And) the typed voice fallback prompt call count is (\d+)$/,
        run: async ({ assert, args, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForFunction(
            () =>
              ((window as typeof window & { __voicePromptCalls?: string[] }).__voicePromptCalls || [])
                .length > 0
          );
          assert.equal(
            await page.evaluate(
              () => ((window as typeof window & { __voicePromptCalls?: string[] }).__voicePromptCalls || []).length
            ),
            Number(args[0])
          );
        },
      },
      {
        pattern: /^(?:Then|And) the last typed voice fallback prompt is "([^"]*)"$/,
        run: async ({ assert, args, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          assert.equal(
            await page.evaluate(
              () =>
                (
                  (window as typeof window & { __voicePromptCalls?: string[] }).__voicePromptCalls || []
                ).at(-1) || ""
            ),
            args[0].replace(/\\n/g, "\n")
          );
        },
      },
      {
        pattern: /^Then the status message is Could not approximate location\. Please try again\.$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForFunction(() => {
            const element = document.querySelector("[data-status]");
            return element?.textContent === "Could not approximate location. Please try again.";
          });
          assert.equal(
            await page.locator("[data-status]").textContent(),
            "Could not approximate location. Please try again."
          );
        },
      },
      {
        pattern: /^Then the status message is Multiple matches found\. Choose one below\.$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForFunction(() => {
            const element = document.querySelector("[data-status]");
            return element?.textContent === "Multiple matches found. Choose one below.";
          });
          assert.equal(await page.locator("[data-status]").textContent(), "Multiple matches found. Choose one below.");
        },
      },
      {
        pattern: /^Then two voice choices are visible$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForSelector("[data-voice-choice='1']");
          assert.equal(await page.locator("[data-voice-choice]").count(), 2);
        },
      },
      {
        pattern: /^When the user chooses the second voice choice$/,
        run: async ({ fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.locator("[data-voice-choice='1']").click();
        },
      },
      {
        pattern: /^Then the station title is Ruoholahti$/,
        run: async ({ assert, fixtures }) => {
          const page = fixtures.page as import("@playwright/test").Page;
          await page.waitForFunction(() => {
            const element = document.querySelector("[data-station-title]");
            return element?.textContent === "Ruoholahti";
          });
          assert.equal(await page.locator("[data-station-title]").textContent(), "Ruoholahti");
        },
      },
    ],
  }
);
