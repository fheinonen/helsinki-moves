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
}

defineFeature<World>(
  test,
  `
Feature: Voice search resolution

  Scenario: Voice search resolves a spoken place and loads departures there
    Given the app controller has a resolved voice place query
    When voice search is requested
    Then the stored coordinates equal 60.17 and 24.94
    And the current station name is Kamppi
    And the voice choices are empty
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app controller has a resolved voice place query$/,
        run: ({ world }) => {
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
              return "Kamppi";
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
        pattern: /^Then the stored coordinates equal 60\.17 and 24\.94$/,
        run: ({ assert, world }) => {
          const coords = world.controller?.store.getState().coords;
          assert.equal(`${coords?.lat}|${coords?.lon}`, "60.17|24.94");
        },
      },
      {
        pattern: /^Then the current station name is Kamppi$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().station?.stopName, "Kamppi");
        },
      },
      {
        pattern: /^Then the voice choices are empty$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().voice.choices.length || 0, 0);
        },
      },
    ],
  }
);
