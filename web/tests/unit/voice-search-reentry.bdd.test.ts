import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore } from "@client/app/app-store";
import { createAppController, type AppController } from "@client/app/app-controller";
import type { DeparturesClient } from "@client/services/departures-client";
import type { GeocodeClient } from "@client/services/geocode-client";
import type { LocationService } from "@client/services/location-service";
import type { SpeechTranscribeClient } from "@client/services/speech-transcribe-client";
import type { VoiceRecorder } from "@client/features/voice/browser-voice-recorder";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

interface World {
  captureCount?: number;
  controller?: AppController;
  transcriptDeferred?: Deferred<string>;
}

defineFeature<World>(
  test,
  `
Feature: Voice search re-entry

  Scenario: A second voice search request is ignored while one is already running
    Given the app controller has a slow voice transcription
    When voice search is requested twice quickly
    Then the recorder capture count is 1
    And the voice phase returns to idle
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the app controller has a slow voice transcription$/,
        run: ({ world }) => {
          world.captureCount = 0;
          world.transcriptDeferred = createDeferred<string>();

          const locationService: LocationService = {
            async getCurrentPosition() {
              return { code: "unavailable", ok: false };
            },
          };

          const departuresClient: DeparturesClient = {
            async getDepartures() {
              return {
                filterOptions: { destinations: [], lines: [] },
                mode: "BUS",
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
              world.captureCount = (world.captureCount || 0) + 1;
              return {
                content: "ZmFrZQ==",
                fileName: "voice-query.webm",
                mimeType: "audio/webm",
              };
            },
          };

          const speechTranscribeClient: SpeechTranscribeClient = {
            async transcribe() {
              return world.transcriptDeferred?.promise as Promise<string>;
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
        pattern: /^When voice search is requested twice quickly$/,
        run: async ({ world }) => {
          if (!world.controller || !world.transcriptDeferred) {
            throw new Error("Expected voice search re-entry world");
          }

          const firstRequest = world.controller.startVoiceSearch();
          const secondRequest = world.controller.startVoiceSearch();

          world.transcriptDeferred.resolve("Kamppi");

          await Promise.all([firstRequest, secondRequest]);
        },
      },
      {
        pattern: /^Then the recorder capture count is 1$/,
        run: ({ assert, world }) => {
          assert.equal(world.captureCount, 1);
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
