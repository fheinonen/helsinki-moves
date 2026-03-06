const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const { createMockRequest, createMockResponse } = require("./helpers/http-mocks");
const speechTokenModule = require("../api/v1/speech-token");

const { createSpeechTokenHandler } = speechTokenModule._private;

async function runHandler({
  method = "GET",
  fetchImpl = async () => ({
    ok: true,
    status: 200,
    text: async () => "token",
  }),
  getSpeechKey = () => "speech-key",
  getSpeechRegion = () => "northeurope",
} = {}) {
  const handler = createSpeechTokenHandler({
    fetchImpl,
    getSpeechKey,
    getSpeechRegion,
    logError: () => {},
  });
  const req = createMockRequest({ method });
  const res = createMockResponse();
  await handler(req, res);
  return res;
}

const featureText = `
Feature: Azure speech token API behavior

Scenario: Reject non-GET speech token methods
  Given a speech-token request method "POST"
  When the speech-token API is called
  Then the speech-token response status is 405
  And the speech-token payload error is "Method not allowed"
  And the speech-token allow header is "GET"

Scenario: Return speech token payload when Azure speech is configured
  Given Azure speech token upstream succeeds with token "azure-token"
  When the speech-token API is called
  Then the speech-token response status is 200
  And the speech-token payload token is "azure-token"
  And the speech-token payload region is "northeurope"

Scenario: Return unavailable response when Azure speech is not configured
  Given Azure speech key is missing
  When the speech-token API is called
  Then the speech-token response status is 503
  And the speech-token payload error is "Voice transcription is not configured."

Scenario: Return unavailable response when Azure speech region is invalid
  Given Azure speech region is invalid
  When the speech-token API is called
  Then the speech-token response status is 503
  And the speech-token payload error is "Voice transcription is not configured."

Scenario: Return gateway error when Azure speech upstream token request fails
  Given Azure speech token upstream fails with status 401
  When the speech-token API is called
  Then the speech-token response status is 502
  And the speech-token payload error is "Could not start voice transcription."

Scenario: Return gateway error when Azure speech upstream token response is empty
  Given Azure speech token upstream succeeds with empty token body
  When the speech-token API is called
  Then the speech-token response status is 502
  And the speech-token payload error is "Could not start voice transcription."

Scenario: Truncate oversized helper strings
  Given an oversized speech-token helper string
  When speech-token helper sanitization runs
  Then speech-token helper output length equals 40
`;

defineFeature(test, featureText, {
  createWorld: () => ({
    request: {
      method: "GET",
    },
    response: null,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => "azure-token",
    }),
    getSpeechKey: () => "speech-key",
    getSpeechRegion: () => "northeurope",
    helperInput: "",
    helperOutput: "",
  }),
  stepDefinitions: [
    {
      pattern: /^Given a speech-token request method "([^"]*)"$/,
      run: ({ args, world }) => {
        world.request.method = args[0];
      },
    },
    {
      pattern: /^Given Azure speech token upstream succeeds with token "([^"]*)"$/,
      run: ({ args, world }) => {
        world.fetchImpl = async () => ({
          ok: true,
          status: 200,
          text: async () => args[0],
        });
      },
    },
    {
      pattern: /^Given Azure speech key is missing$/,
      run: ({ world }) => {
        world.getSpeechKey = () => "";
      },
    },
    {
      pattern: /^Given Azure speech region is invalid$/,
      run: ({ world }) => {
        world.getSpeechRegion = () => "North Europe";
      },
    },
    {
      pattern: /^Given Azure speech token upstream fails with status (\d+)$/,
      run: ({ args, world }) => {
        world.fetchImpl = async () => ({
          ok: false,
          status: Number(args[0]),
          text: async () => "upstream failure",
        });
      },
    },
    {
      pattern: /^Given Azure speech token upstream succeeds with empty token body$/,
      run: ({ world }) => {
        world.fetchImpl = async () => ({
          ok: true,
          status: 200,
          text: async () => "   ",
        });
      },
    },
    {
      pattern: /^Given an oversized speech-token helper string$/,
      run: ({ world }) => {
        world.helperInput = "x".repeat(100);
      },
    },
    {
      pattern: /^When the speech-token API is called$/,
      run: async ({ world }) => {
        world.response = await runHandler({
          method: world.request.method,
          fetchImpl: world.fetchImpl,
          getSpeechKey: world.getSpeechKey,
          getSpeechRegion: world.getSpeechRegion,
        });
      },
    },
    {
      pattern: /^When speech-token helper sanitization runs$/,
      run: ({ world }) => {
        world.helperOutput = speechTokenModule._private.safeString(world.helperInput, 40);
      },
    },
    {
      pattern: /^Then the speech-token response status is (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.statusCode, Number(args[0]));
      },
    },
    {
      pattern: /^Then the speech-token payload error is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.deepEqual(world.response.payload, { error: args[0] });
      },
    },
    {
      pattern: /^Then the speech-token allow header is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.headers.get("allow"), args[0]);
      },
    },
    {
      pattern: /^Then the speech-token payload token is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.payload?.token, args[0]);
      },
    },
    {
      pattern: /^Then the speech-token payload region is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.payload?.region, args[0]);
      },
    },
    {
      pattern: /^Then speech-token helper output length equals (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.helperOutput.length, Number(args[0]));
      },
    },
  ],
});
