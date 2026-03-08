import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore } from "@client/app/app-store";
import { createAppController, type AppController } from "@client/app/app-controller";
import type { DeparturesClient } from "@client/services/departures-client";
import type { GeocodeClient } from "@client/services/geocode-client";
import type { LocationService } from "@client/services/location-service";
import type { SpeechTranscribeClient } from "@client/services/speech-transcribe-client";
import type { VoiceRecorder } from "@client/features/voice/browser-voice-recorder";

interface World {
  controller?: AppController;
  geocodeCallCount?: number;
}

defineFeature<World>(
  test,
  `
Feature: Voice search geocode retry

  Scenario: A transient geocode failure is retried once during voice search
    Given the app controller has a transient geocode failure
    When voice search is requested
    Then geocode is requested twice
    And the current station name is Kamppi
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app controller has a transient geocode failure$/,
        run: ({ world }) => {
          world.geocodeCallCount = 0;

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
                  departures: [],
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
              return "Kamppi";
            },
          };

          const geocodeClient: GeocodeClient = {
            async resolve() {
              world.geocodeCallCount = (world.geocodeCallCount || 0) + 1;
              if (world.geocodeCallCount === 1) {
                throw new Error("temporary geocode failure");
              }
              return {
                ambiguous: false,
                choices: [],
                location: {
                  confidence: 0.9,
                  label: "Kamppi",
                  latitude: 60.17,
                  longitude: 24.94,
                },
                query: "Kamppi",
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
        pattern: /^Then geocode is requested twice$/,
        run: ({ assert, world }) => {
          assert.equal(world.geocodeCallCount, 2);
        },
      },
      {
        pattern: /^Then the current station name is Kamppi$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().station?.stopName, "Kamppi");
        },
      },
    ],
  }
);
