import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore } from "@client/app/app-store";
import { createAppController, type AppController } from "@client/app/app-controller";
import type { DeparturesClient } from "@client/services/departures-client";
import type { GeocodeClient } from "@client/services/geocode-client";
import type { LocationService } from "@client/services/location-service";
import type { SpeechTranscribeClient } from "@client/services/speech-transcribe-client";
import type { VoiceRecorder } from "@client/features/voice/browser-voice-recorder";
import { createVoiceError } from "@client/features/voice/voice-errors";
import { createBrowserVoiceTypedFallbackPrompt } from "@client/features/voice/voice-typed-fallback";

interface PromptCall {
  defaultValue: string;
  message: string;
}

interface World {
  controller?: AppController;
  promptCalls?: PromptCall[];
}

defineFeature<World>(
  test,
  `
Feature: Voice typed fallback

  Scenario: Voice search uses typed fallback when transcription is unavailable
    Given the app controller has voice typed fallback available
    When voice search is requested
    Then the typed fallback prompt call count equals 1
    And the last typed fallback prompt message equals "Voice recognition is unavailable right now. Type your location or line (number or letter) instead:\\nExample: Kamppi Helsinki, A-train, bus 52, 200"
    And the pending voice query is Kamppi Helsinki
    And the current station name is Kamppi
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app controller has voice typed fallback available$/,
        run: ({ world }) => {
          world.promptCalls = [];

          const locationService: LocationService = {
            async getCurrentPosition() {
              return { code: "unavailable", ok: false };
            },
          };
          const departuresClient: DeparturesClient = {
            async getDepartures(input) {
              return {
                filterOptions: {
                  destinations: [{ count: 1, value: "Kamppi" }],
                  lines: [{ count: 1, value: "550" }],
                },
                mode: input.mode,
                selectedStopId: "HSL:STOP_A",
                station: {
                  departures: [
                    {
                      departureIso: "2026-03-07T10:10:00.000Z",
                      destination: "Kamppi",
                      line: "550",
                    },
                  ],
                  distanceMeters: 80,
                  stopCode: "A1",
                  stopCodes: ["A1"],
                  stopName: "Kamppi",
                  type: "stop",
                },
                stops: [],
              };
            },
          };
          const voiceRecorder: VoiceRecorder = {
            async capture() {
              return {
                content: "ZmFrZQ==",
                fileName: "voice-query.webm",
                mimeType: "audio/webm",
              };
            },
          };
          const speechTranscribeClient: SpeechTranscribeClient = {
            async transcribe() {
              throw createVoiceError(
                "voice_unsupported",
                "Voice recognition is unavailable right now."
              );
            },
          };
          const geocodeClient: GeocodeClient = {
            async resolve() {
              return {
                ambiguous: false,
                choices: [],
                location: {
                  confidence: 0.9,
                  label: "Kamppi",
                  latitude: 60.17,
                  longitude: 24.94,
                },
                query: "Kamppi Helsinki",
              };
            },
          };

          world.controller = createAppController({
            departuresClient,
            geocodeClient,
            locationService,
            speechTranscribeClient,
            store: createAppStore({ activeMode: "BUS" }),
            voiceAvailability: "available",
            voiceRecorder,
            voiceTypedFallbackPrompt: createBrowserVoiceTypedFallbackPrompt({
              promptImpl(message, defaultValue) {
                world.promptCalls?.push({
                  defaultValue: String(defaultValue || ""),
                  message: String(message || ""),
                });
                return "Kamppi Helsinki";
              },
            }),
          });
        },
      },
      {
        pattern: /^When voice search is requested$/,
        run: async ({ world }) => {
          if (!world.controller) {
            throw new Error("Expected app controller");
          }
          await world.controller.startVoiceSearch();
        },
      },
      {
        pattern: /^Then the typed fallback prompt call count equals (\d+)$/,
        run: ({ assert, args, world }) => {
          assert.equal(world.promptCalls?.length, Number(args[0]));
        },
      },
      {
        pattern:
          /^(?:Then|And) the last typed fallback prompt message equals "([^"]*)"$/,
        run: ({ assert, args, world }) => {
          assert.equal(
            String(world.promptCalls?.at(-1)?.message || ""),
            args[0].replace(/\\n/g, "\n")
          );
        },
      },
      {
        pattern: /^(?:Then|And) the pending voice query is Kamppi Helsinki$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.controller?.store.getState().voice.pendingQuery,
            "Kamppi Helsinki"
          );
        },
      },
      {
        pattern: /^(?:Then|And) the current station name is Kamppi$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().station?.stopName, "Kamppi");
        },
      },
    ],
  }
);
