const test = require("node:test");
const assert = require("node:assert/strict");

const { defineFeature } = require("./helpers/bdd");
const { createMockRequest, createMockResponse } = require("./helpers/http-mocks");

const speechTranscribeModule = require("../api/v1/speech-transcribe");

const {
  createSpeechTranscribeHandler,
  normalizeTranscriptionApiUrl,
  decodeBase64AudioContent,
  createAudioFile,
  extractTranscript,
  transcribeSpeech,
} = speechTranscribeModule._private;

const TEST_TRANSCRIPTION_API_URL = "https://speech.fheinonen.eu/v1/audio/transcriptions";
const TEST_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

async function runHandler({
  method = "POST",
  body = {
    content: Buffer.from("fake-audio").toString("base64"),
  },
  fetchImpl = async () => {
    throw new Error("fetch should be stubbed");
  },
  apiUrl = TEST_TRANSCRIPTION_API_URL,
  apiKey = "",
  model = TEST_TRANSCRIPTION_MODEL,
  language = "fi",
} = {}) {
  const handler = createSpeechTranscribeHandler({
    fetchImpl,
    getApiUrl: () => apiUrl,
    getApiKey: () => apiKey,
    getModel: () => model,
    getLanguage: () => language,
  });
  const req = createMockRequest({ method, body });
  const res = createMockResponse();
  await handler(req, res);
  return { req, res };
}

const featureText = `
Feature: Speech transcription API behavior

Scenario: Reject non-POST methods
  Given speech transcription request method is "GET"
  When the speech transcription API is called
  Then the speech transcription response status is 405
  And the speech transcription payload error is "Method not allowed"
  And the speech transcription allow header is "POST"

Scenario: Report missing speech transcription configuration
  Given speech transcription configuration is missing
  When the speech transcription API is called
  Then the speech transcription response status is 503
  And the speech transcription payload error is "Speech transcription is not configured"

Scenario: Report missing transcription endpoint configuration
  Given speech transcription configuration is present
  And the transcription endpoint is missing
  When the speech transcription API is called
  Then the speech transcription response status is 503
  And the speech transcription payload error is "Speech transcription is not configured"

Scenario: Report missing transcription model configuration
  Given speech transcription configuration is present
  And the transcription model is missing
  When the speech transcription API is called
  Then the speech transcription response status is 503
  And the speech transcription payload error is "Speech transcription is not configured"

Scenario: Return transcript from the configured transcription service
  Given speech transcription configuration is present
  And the transcription service returns transcript "Kamppi Helsinki"
  When the speech transcription API is called
  Then the speech transcription response status is 200
  And the speech transcription payload transcript is "Kamppi Helsinki"
  And the upstream transcription request URL is "https://speech.fheinonen.eu/v1/audio/transcriptions"
  And the upstream transcription authorization header is "Bearer speech-api-key"
  And the upstream transcription form field "model" equals "gpt-4o-mini-transcribe"
  And the upstream transcription form field "language" equals "fi"
  And the upstream transcription file name is "voice-query.webm"
  And the upstream transcription file type is "audio/webm"

Scenario: Route requests to a custom transcription endpoint
  Given speech transcription configuration is present
  And the transcription endpoint URL is "https://example.test/v1/audio/transcriptions"
  And the transcription service returns transcript "Pasila"
  When the speech transcription API is called
  Then the speech transcription response status is 200
  And the upstream transcription request URL is "https://example.test/v1/audio/transcriptions"

Scenario: Reject requests without audio content
  Given speech transcription configuration is present
  And speech transcription request body content is ""
  When the speech transcription API is called
  Then the speech transcription response status is 400
  And the speech transcription payload error is "Audio content is required"

Scenario: Report no speech when transcription result is empty
  Given speech transcription configuration is present
  And the transcription service returns no transcript
  When the speech transcription API is called
  Then the speech transcription response status is 422
  And the speech transcription payload error is "No speech detected"

Scenario: Report upstream transcription failures as bad gateway
  Given speech transcription configuration is present
  And the transcription service request fails with status 401
  When the speech transcription API is called
  Then the speech transcription response status is 502
  And the speech transcription payload error is "Could not transcribe speech"
`;

defineFeature(test, featureText, {
  createWorld: () => ({
    method: "POST",
    body: {
      content: Buffer.from("fake-audio").toString("base64"),
    },
    apiUrl: TEST_TRANSCRIPTION_API_URL,
    apiKey: "speech-api-key",
    model: TEST_TRANSCRIPTION_MODEL,
    language: "fi",
    upstreamStatus: 200,
    upstreamPayload: { text: "Kamppi Helsinki" },
    response: null,
    upstreamRequests: [],
  }),
  stepDefinitions: [
    {
      pattern: /^Given speech transcription request method is "([^"]*)"$/,
      run: ({ args, world }) => {
        world.method = args[0];
      },
    },
    {
      pattern: /^Given speech transcription configuration is missing$/,
      run: ({ world }) => {
        world.apiKey = "";
      },
    },
    {
      pattern: /^Given speech transcription configuration is present$/,
      run: ({ world }) => {
        world.apiUrl = TEST_TRANSCRIPTION_API_URL;
        world.apiKey = "speech-api-key";
        world.model = TEST_TRANSCRIPTION_MODEL;
        world.language = "fi";
      },
    },
    {
      pattern: /^Given the transcription endpoint is missing$/,
      run: ({ world }) => {
        world.apiUrl = "";
      },
    },
    {
      pattern: /^Given the transcription model is missing$/,
      run: ({ world }) => {
        world.model = "";
      },
    },
    {
      pattern: /^Given the transcription endpoint URL is "([^"]*)"$/,
      run: ({ args, world }) => {
        world.apiUrl = args[0];
      },
    },
    {
      pattern: /^Given the transcription service returns transcript "([^"]*)"$/,
      run: ({ args, world }) => {
        world.upstreamStatus = 200;
        world.upstreamPayload = { text: args[0] };
      },
    },
    {
      pattern: /^Given speech transcription request body content is "([^"]*)"$/,
      run: ({ args, world }) => {
        world.body = { content: args[0] };
      },
    },
    {
      pattern: /^Given the transcription service returns no transcript$/,
      run: ({ world }) => {
        world.upstreamStatus = 200;
        world.upstreamPayload = { text: "" };
      },
    },
    {
      pattern: /^Given the transcription service request fails with status (\d+)$/,
      run: ({ args, world }) => {
        world.upstreamStatus = Number(args[0]);
        world.upstreamPayload = { error: { message: "unauthorized" } };
      },
    },
    {
      pattern: /^When the speech transcription API is called$/,
      run: async ({ world }) => {
        world.response = await runHandler({
          method: world.method,
          body: world.body,
          apiUrl: world.apiUrl,
          apiKey: world.apiKey,
          model: world.model,
          language: world.language,
          fetchImpl: async (url, options = {}) => {
            world.upstreamRequests.push({
              url: String(url || ""),
              options,
            });
            return {
              ok: world.upstreamStatus >= 200 && world.upstreamStatus < 300,
              status: world.upstreamStatus,
              headers: {
                get(name) {
                  return String(name || "").toLowerCase() === "content-type"
                    ? "application/json"
                    : null;
                },
              },
              async json() {
                return world.upstreamPayload;
              },
            };
          },
        });
      },
    },
    {
      pattern: /^Then the speech transcription response status is (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.res.statusCode, Number(args[0]));
      },
    },
    {
      pattern: /^Then the speech transcription payload error is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.deepEqual(world.response.res.payload, { error: args[0] });
      },
    },
    {
      pattern: /^Then the speech transcription allow header is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.res.headers.get("allow"), args[0]);
      },
    },
    {
      pattern: /^Then the speech transcription payload transcript is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.res.payload?.transcript, args[0]);
      },
    },
    {
      pattern: /^Then the upstream transcription request URL is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.upstreamRequests.at(-1)?.url, args[0]);
      },
    },
    {
      pattern: /^Then the upstream transcription authorization header is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.upstreamRequests.at(-1)?.options?.headers?.authorization, args[0]);
      },
    },
    {
      pattern: /^Then the upstream transcription form field "([^"]*)" equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const [, expectedValue] = args;
        const fieldName = args[0];
        const body = world.upstreamRequests.at(-1)?.options?.body;
        assert.equal(body.get(fieldName), expectedValue);
      },
    },
    {
      pattern: /^Then the upstream transcription file name is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const file = world.upstreamRequests.at(-1)?.options?.body?.get("file");
        assert.equal(file?.name, args[0]);
      },
    },
    {
      pattern: /^Then the upstream transcription file type is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const file = world.upstreamRequests.at(-1)?.options?.body?.get("file");
        assert.equal(file?.type, args[0]);
      },
    },
  ],
});

test("normalizeTranscriptionApiUrl accepts absolute http urls and trims whitespace", () => {
  assert.equal(
    normalizeTranscriptionApiUrl("  https://speech.fheinonen.eu/v1/audio/transcriptions  "),
    "https://speech.fheinonen.eu/v1/audio/transcriptions"
  );
});

test("normalizeTranscriptionApiUrl rejects invalid values", () => {
  assert.equal(normalizeTranscriptionApiUrl(""), "");
  assert.equal(normalizeTranscriptionApiUrl("speech.fheinonen.eu/v1/audio/transcriptions"), "");
  assert.equal(normalizeTranscriptionApiUrl("ftp://speech.fheinonen.eu/v1/audio/transcriptions"), "");
});

test("decodeBase64AudioContent decodes audio bytes", () => {
  const decoded = decodeBase64AudioContent(Buffer.from("voice-sample").toString("base64"));
  assert.equal(Buffer.from(decoded).toString("utf8"), "voice-sample");
});

test("createAudioFile builds an audio file from base64 content", async () => {
  const file = createAudioFile({
    content: Buffer.from("voice-sample").toString("base64"),
    fileName: "clip.ogg",
    mimeType: "audio/ogg",
  });
  assert.equal(file.name, "clip.ogg");
  assert.equal(file.type, "audio/ogg");
  assert.equal(Buffer.from(await file.arrayBuffer()).toString("utf8"), "voice-sample");
});

test("extractTranscript prefers text and falls back to transcript", () => {
  assert.equal(extractTranscript({ text: "Kamppi" }), "Kamppi");
  assert.equal(extractTranscript({ transcript: "Pasila" }), "Pasila");
  assert.equal(extractTranscript({}), "");
});

test("transcribeSpeech rejects unsuccessful upstream responses", async () => {
  await assert.rejects(
    transcribeSpeech({
      apiUrl: TEST_TRANSCRIPTION_API_URL,
      apiKey: "speech-api-key",
      model: TEST_TRANSCRIPTION_MODEL,
      language: "fi",
      audioFile: createAudioFile({
        content: Buffer.from("voice-sample").toString("base64"),
      }),
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        async json() {
          return {
            error: { message: "unauthorized" },
          };
        },
      }),
    }),
    /HTTP 401/
  );
});
