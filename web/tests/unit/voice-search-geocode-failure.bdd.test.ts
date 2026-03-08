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
Feature: Voice search geocode failure

  Scenario: Voice search shows a stable location error after geocode fails
    Given the app controller has a failing geocode service
    When voice search is requested
    Then the status message is Could not approximate location. Please try again.
    And the voice phase returns to idle
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app controller has a failing geocode service$/,
        run: ({ world }) => {
          const locationService: LocationService = {
            async getCurrentPosition() {
              return { code: "unavailable", ok: false };
            },
          };

          const departuresClient: DeparturesClient = {
            async getDepartures() {
              throw new Error("Departures client should not be called");
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
              throw new Error("low-level geocode failure");
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
        pattern: /^Then the status message is Could not approximate location\. Please try again\.$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.controller?.store.getState().statusMessage,
            "Could not approximate location. Please try again."
          );
        },
      },
      {
        pattern: /^Then the voice phase returns to idle$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().voice.phase, "idle");
        },
      },
    ],
  }
);
