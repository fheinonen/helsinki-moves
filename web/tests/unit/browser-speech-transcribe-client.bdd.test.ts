import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  createBrowserSpeechTranscribeClient,
  type SpeechTranscribeClient,
} from "@client/services/speech-transcribe-client";
import { getVoiceErrorCode } from "@client/features/voice/voice-errors";

interface FetchCall {
  init?: RequestInit;
  url: string;
}

interface World {
  client?: SpeechTranscribeClient;
  errorCode?: string;
  errorMessage?: string;
  fetchCalls?: FetchCall[];
  responsePayload?: { error?: string; transcript?: string };
  responseStatus?: number;
  transcript?: string;
}

function createClient(world: World): SpeechTranscribeClient {
  const fetchCalls: FetchCall[] = [];
  world.fetchCalls = fetchCalls;
  return createBrowserSpeechTranscribeClient({
    fetchImpl: async (url, init) => {
      fetchCalls.push({ init, url: String(url) });
      return {
        json: async () => world.responsePayload,
        ok: (world.responseStatus || 200) < 400,
        status: world.responseStatus || 200,
      } as Response;
    },
  });
}

defineFeature<World>(
  test,
  `
Feature: Browser speech transcribe client

  Scenario: Successful speech transcription returns the transcript
    Given the browser speech transcribe client has a successful transcript Kamppi
    When speech is transcribed from encoded audio
    Then the transcript equals Kamppi
    And the speech transcribe request uses JSON POST

  Scenario: Unsupported speech transcription statuses map to voice unsupported
    Given the browser speech transcribe client has a 503 error response with message Not configured
    When speech is transcribed from encoded audio
    Then the speech transcribe error code is voice_unsupported
    And the speech transcribe error message is Voice recognition is unavailable right now.

  Scenario: No speech errors map to voice no speech
    Given the browser speech transcribe client has a 422 error response with message No speech detected from audio
    When speech is transcribed from encoded audio
    Then the speech transcribe error code is voice_no_speech
    And the speech transcribe error message is No speech detected.

  Scenario: Other speech transcription failures map to voice not understood
    Given the browser speech transcribe client has a 500 error response with message Could not parse utterance
    When speech is transcribed from encoded audio
    Then the speech transcribe error code is voice_not_understood
    And the speech transcribe error message is Could not parse utterance
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the browser speech transcribe client has a successful transcript (.+)$/,
        run: ({ args, world }) => {
          world.responsePayload = { transcript: args[0] };
          world.responseStatus = 200;
          world.client = createClient(world);
        },
      },
      {
        pattern: /^Given the browser speech transcribe client has a (\d+) error response with message (.+)$/,
        run: ({ args, world }) => {
          world.responsePayload = { error: args[1] };
          world.responseStatus = Number(args[0]);
          world.client = createClient(world);
        },
      },
      {
        pattern: /^When speech is transcribed from encoded audio$/,
        run: async ({ world }) => {
          if (!world.client) {
            throw new Error("Expected speech client");
          }
          try {
            world.transcript = await world.client.transcribe({
              content: "ZmFrZS1hdWRpby1ieXRlcw==",
              fileName: "clip.webm",
              mimeType: "audio/webm",
            });
          } catch (error) {
            world.errorCode = getVoiceErrorCode(error);
            world.errorMessage = error instanceof Error ? error.message : String(error);
          }
        },
      },
      {
        pattern: /^Then the transcript equals (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.transcript, args[0]);
        },
      },
      {
        pattern: /^Then the speech transcribe request uses JSON POST$/,
        run: ({ assert, world }) => {
          assert.equal(world.fetchCalls?.[0]?.url, "/api/v1/speech-transcribe");
          assert.equal(world.fetchCalls?.[0]?.init?.method, "POST");
          assert.equal(
            (world.fetchCalls?.[0]?.init?.headers as Record<string, string>)?.["content-type"],
            "application/json"
          );
        },
      },
      {
        pattern: /^Then the speech transcribe error code is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.errorCode, args[0]);
        },
      },
      {
        pattern: /^Then the speech transcribe error message is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.errorMessage, args[0]);
        },
      },
    ],
  }
);
