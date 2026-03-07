import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore } from "@client/app/app-store";
import { createAppController, type AppController } from "@client/app/app-controller";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";
import type { SpeechTranscribeClient } from "@client/services/speech-transcribe-client";
import type { VoiceRecorder } from "@client/features/voice/browser-voice-recorder";
import type { Mode } from "@shared/domain/mode";

interface World {
  controller?: AppController;
  departuresCalls: Array<{ lineIntent?: boolean; mode: Mode }>;
}

function createLineIntentResponse(input: {
  departureMinutes: number;
  mode: Mode;
  stationName: string;
  stopId: string;
}): Awaited<ReturnType<DeparturesClient["getDepartures"]>> {
  return {
    filterOptions: {
      destinations: [{ count: 1, value: "Pasila" }],
      lines: [{ count: 1, value: "67" }],
    },
    mode: input.mode,
    selectedStopId: input.stopId,
    station: {
      departures: [
        {
          departureIso: new Date(Date.now() + input.departureMinutes * 60_000).toISOString(),
          destination: "Pasila",
          line: "67",
        },
      ],
      distanceMeters: 120,
      stopCode: "X1",
      stopCodes: ["X1"],
      stopName: input.stationName,
      type: "stop",
    },
    stops: [],
  };
}

defineFeature<World>(
  test,
  `
Feature: Voice line intent resolution

  Scenario: Mode-less line intent picks the soonest nearby matching mode
    Given the app controller has voice line-intent matches in bus and tram modes
    When voice search is requested
    Then the active mode is TRAM
    And the current station name is Tram 67 Stop
    And all voice line-intent requests set line intent to true
  `,
  {
    createWorld: () => ({
      departuresCalls: [],
    }),
    stepDefinitions: [
      {
        pattern: /^Given the app controller has voice line-intent matches in bus and tram modes$/,
        run: ({ world }) => {
          const locationService: LocationService = {
            async getCurrentPosition() {
              return { code: "unavailable", ok: false };
            },
          };

          const departuresClient: DeparturesClient = {
            async getDepartures(input) {
              world.departuresCalls.push({
                lineIntent: (input as typeof input & { lineIntent?: boolean }).lineIntent,
                mode: input.mode,
              });
              if (input.mode === "BUS") {
                return createLineIntentResponse({
                  departureMinutes: 5,
                  mode: "BUS",
                  stationName: "Bus 67 Stop",
                  stopId: "HSL:BUS67",
                });
              }
              if (input.mode === "TRAM") {
                return createLineIntentResponse({
                  departureMinutes: 2,
                  mode: "TRAM",
                  stationName: "Tram 67 Stop",
                  stopId: "HSL:TRAM67",
                });
              }
              return {
                filterOptions: { destinations: [], lines: [] },
                message: `No nearby departures found for ${input.mode.toLowerCase()} 67.`,
                mode: input.mode,
                selectedStopId: null,
                station: null,
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
              return "67";
            },
          };

          world.controller = createAppController({
            departuresClient,
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
        pattern: /^Then the active mode is TRAM$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().activeMode, "TRAM");
        },
      },
      {
        pattern: /^Then the current station name is Tram 67 Stop$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.store.getState().station?.stopName, "Tram 67 Stop");
        },
      },
      {
        pattern: /^Then all voice line-intent requests set line intent to true$/,
        run: ({ assert, world }) => {
          assert.equal(world.departuresCalls.length >= 2, true);
          assert.equal(
            world.departuresCalls.every((call) => call.lineIntent === true),
            true
          );
        },
      },
    ],
  }
);
