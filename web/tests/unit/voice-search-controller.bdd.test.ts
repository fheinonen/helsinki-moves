import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore } from "@client/app/app-store";
import { createAppController, type AppController } from "@client/app/app-controller";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";
import type { SpeechTranscribeClient } from "@client/services/speech-transcribe-client";
import type { VoiceRecorder } from "@client/features/voice/browser-voice-recorder";

interface World {
  controller?: AppController;
}

defineFeature<World>(
  test,
  `
Feature: Voice search controller

  Scenario: Voice search captures and stores a transcribed query
    Given the app controller has available voice recording and transcription
    When voice search is requested
    Then the voice phase returns to idle
    And the pending voice query is Kamppi
    And the status message is Captured voice query: Kamppi
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app controller has available voice recording and transcription$/,
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
          const store = createAppStore();
          world.controller = createAppController({
            departuresClient,
            locationService,
            speechTranscribeClient,
            store,
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
        pattern: /^Then the voice phase returns to idle$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().voice.phase, "idle");
        },
      },
      {
        pattern: /^Then the pending voice query is Kamppi$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().voice.pendingQuery, "Kamppi");
        },
      },
      {
        pattern: /^Then the status message is Captured voice query: Kamppi$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().statusMessage, "Captured voice query: Kamppi");
        },
      },
    ],
  }
);
