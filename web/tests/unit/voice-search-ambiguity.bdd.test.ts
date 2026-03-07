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
Feature: Voice search ambiguity

  Scenario: Voice search stores ambiguous location choices until the user picks one
    Given the app controller has an ambiguous voice place query
    When voice search is requested
    Then two voice choices are available
    And the status message is Multiple matches found. Choose one below.
    When the user chooses the second voice location
    Then the stored coordinates equal 60.18 and 24.95
    And the voice choices are cleared
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app controller has an ambiguous voice place query$/,
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
                  destinations: [{ count: 1, value: "Ruoholahti" }],
                  lines: [{ count: 1, value: "560" }],
                },
                mode: input.mode,
                selectedStopId: "HSL:STOP_B",
                station: {
                  departures: [],
                  distanceMeters: 90,
                  stopCode: "B1",
                  stopCodes: ["B1"],
                  stopName: "Ruoholahti",
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
        pattern: /^Then two voice choices are available$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().voice.choices.length, 2);
        },
      },
      {
        pattern: /^Then the status message is Multiple matches found\. Choose one below\.$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().statusMessage, "Multiple matches found. Choose one below.");
        },
      },
      {
        pattern: /^When the user chooses the second voice location$/,
        run: async ({ world }) => {
          if (!world.controller) {
            throw new Error("Expected app controller");
          }
          await world.controller.chooseVoiceLocation(1);
        },
      },
      {
        pattern: /^Then the stored coordinates equal 60\.18 and 24\.95$/,
        run: ({ assert, world }) => {
          const coords = world.controller?.store.getState().coords;
          assert.equal(`${coords?.lat}|${coords?.lon}`, "60.18|24.95");
        },
      },
      {
        pattern: /^Then the voice choices are cleared$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().voice.choices.length || 0, 0);
        },
      },
    ],
  }
);
