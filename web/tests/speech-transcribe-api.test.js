const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const { defineFeature } = require("./helpers/bdd");
const { createMockRequest, createMockResponse } = require("./helpers/http-mocks");

const speechTranscribeModule = require("../api/v1/speech-transcribe");

const {
  createSpeechTranscribeHandler,
  normalizeLocation,
  parseServiceAccountJson,
  loadServiceAccount,
  base64UrlEncode,
  createAssertion,
  fetchGoogleAccessToken,
  extractTranscript,
  getSpeechApiBaseUrl,
  recognizeSpeech,
} = speechTranscribeModule._private;

async function runHandler({
  method = "POST",
  body = {
    content: Buffer.from("fake-audio").toString("base64"),
  },
  fetchImpl = async () => {
    throw new Error("fetch should be stubbed");
  },
  serviceAccountJson = "",
  serviceAccountPath = "",
  projectId = "",
  location = "eu",
} = {}) {
  const handler = createSpeechTranscribeHandler({
    fetchImpl,
    getServiceAccountJson: () => serviceAccountJson,
    getServiceAccountPath: () => serviceAccountPath,
    getProjectId: () => projectId,
    getLocation: () => location,
    createAssertionFn: () => "signed-jwt",
  });
  const req = createMockRequest({ method, body });
  const res = createMockResponse();
  await handler(req, res);
  return { req, res };
}

const featureText = `
Feature: Google Speech transcription API behavior

Scenario: Reject non-POST methods
  Given Google Speech request method "GET"
  When the Google Speech transcription API is called
  Then the Google Speech response status is 405
  And the Google Speech payload error is "Method not allowed"
  And the Google Speech allow header is "POST"

Scenario: Report missing Google Speech configuration
  Given Google Speech configuration is missing
  When the Google Speech transcription API is called
  Then the Google Speech response status is 503
  And the Google Speech payload error is "Google Speech is not configured"

Scenario: Return transcript from Google Chirp
  Given Google Speech is configured
  And Google Speech upstream returns transcript "Kamppi Helsinki"
  When the Google Speech transcription API is called
  Then the Google Speech response status is 200
  And the Google Speech payload transcript is "Kamppi Helsinki"

Scenario: Load service account from configured file path
  Given Google Speech service account file is configured
  And Google Speech upstream returns transcript "Pasila"
  When the Google Speech transcription API is called
  Then the Google Speech response status is 200
  And the Google Speech payload transcript is "Pasila"

Scenario: Route regional requests to the matching Google Speech hostname
  Given Google Speech is configured
  And Google Speech location is "eu"
  And Google Speech upstream returns transcript "Kamppi"
  When the Google Speech transcription API is called
  Then the Google Speech response status is 200
  And the Google Speech recognize URL starts with "https://eu-speech.googleapis.com/"

Scenario: Reject requests without audio content
  Given Google Speech is configured
  And Google Speech request body content is ""
  When the Google Speech transcription API is called
  Then the Google Speech response status is 400
  And the Google Speech payload error is "Audio content is required"

Scenario: Report no speech when transcription result is empty
  Given Google Speech is configured
  And Google Speech upstream returns no transcript
  When the Google Speech transcription API is called
  Then the Google Speech response status is 422
  And the Google Speech payload error is "No speech detected"

Scenario: Report upstream token failures as bad gateway
  Given Google Speech is configured
  And Google Speech access token request fails
  When the Google Speech transcription API is called
  Then the Google Speech response status is 502
  And the Google Speech payload error is "Could not transcribe speech"

Scenario: Report upstream recognition failures as bad gateway
  Given Google Speech is configured
  And Google Speech recognition request fails
  When the Google Speech transcription API is called
  Then the Google Speech response status is 502
  And the Google Speech payload error is "Could not transcribe speech"
`;

defineFeature(test, featureText, {
  createWorld: () => ({
    method: "POST",
    body: {
      content: Buffer.from("fake-audio").toString("base64"),
    },
    serviceAccountJson: JSON.stringify({
      client_email: "voice@example.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n",
      token_uri: "https://oauth2.googleapis.com/token",
    }),
    serviceAccountPath: "",
    projectId: "voice-project",
    location: "eu",
    fetchImpl: async (url) => {
      const targetUrl = String(url || "");
      if (targetUrl === "https://oauth2.googleapis.com/token") {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              access_token: "google-access-token",
              expires_in: 3600,
            };
          },
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            results: [
              {
                alternatives: [
                  {
                    transcript: "Kamppi Helsinki",
                  },
                ],
              },
            ],
          };
        },
      };
    },
    response: null,
    calledUrls: [],
  }),
  stepDefinitions: [
    {
      pattern: /^Given Google Speech request method "([^"]*)"$/,
      run: ({ args, world }) => {
        world.method = args[0];
      },
    },
    {
      pattern: /^Given Google Speech configuration is missing$/,
      run: ({ world }) => {
        world.serviceAccountJson = "";
        world.projectId = "";
      },
    },
    {
      pattern: /^Given Google Speech is configured$/,
      run: () => {},
    },
    {
      pattern: /^Given Google Speech location is "([^"]*)"$/,
      run: ({ args, world }) => {
        world.location = args[0];
      },
    },
    {
      pattern: /^Given Google Speech service account file is configured$/,
      run: ({ world }) => {
        const tempPath = path.join(os.tmpdir(), `speech-service-account-${Date.now()}.json`);
        fs.writeFileSync(
          tempPath,
          JSON.stringify({
            client_email: "voice@example.iam.gserviceaccount.com",
            private_key: "-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n",
            token_uri: "https://oauth2.googleapis.com/token",
          })
        );
        world.serviceAccountJson = "";
        world.serviceAccountPath = tempPath;
      },
    },
    {
      pattern: /^Given Google Speech upstream returns transcript "([^"]*)"$/,
      run: ({ args, world }) => {
        world.fetchImpl = async (url) => {
          const targetUrl = String(url || "");
          world.calledUrls.push(targetUrl);
          if (targetUrl === "https://oauth2.googleapis.com/token") {
            return {
              ok: true,
              status: 200,
              async json() {
                return {
                  access_token: "google-access-token",
                  expires_in: 3600,
                };
              },
            };
          }
          return {
            ok: true,
            status: 200,
            async json() {
              return {
                results: [
                  {
                    alternatives: [
                      {
                        transcript: args[0],
                      },
                    ],
                  },
                ],
              };
            },
          };
        };
      },
    },
    {
      pattern: /^Given Google Speech request body content is "([^"]*)"$/,
      run: ({ args, world }) => {
        world.body = { content: args[0] };
      },
    },
    {
      pattern: /^Given Google Speech upstream returns no transcript$/,
      run: ({ world }) => {
        world.fetchImpl = async (url) => {
          const targetUrl = String(url || "");
          world.calledUrls.push(targetUrl);
          if (targetUrl === "https://oauth2.googleapis.com/token") {
            return {
              ok: true,
              status: 200,
              async json() {
                return {
                  access_token: "google-access-token",
                  expires_in: 3600,
                };
              },
            };
          }
          return {
            ok: true,
            status: 200,
            async json() {
              return { results: [] };
            },
          };
        };
      },
    },
    {
      pattern: /^Given Google Speech access token request fails$/,
      run: ({ world }) => {
        world.fetchImpl = async () => ({
          ok: false,
          status: 401,
          async json() {
            return {};
          },
        });
      },
    },
    {
      pattern: /^Given Google Speech recognition request fails$/,
      run: ({ world }) => {
        world.fetchImpl = async (url) => {
          const targetUrl = String(url || "");
          world.calledUrls.push(targetUrl);
          if (targetUrl === "https://oauth2.googleapis.com/token") {
            return {
              ok: true,
              status: 200,
              async json() {
                return {
                  access_token: "google-access-token",
                  expires_in: 3600,
                };
              },
            };
          }
          return {
            ok: false,
            status: 400,
            async json() {
              return {
                error: {
                  message: "bad request",
                },
              };
            },
          };
        };
      },
    },
    {
      pattern: /^When the Google Speech transcription API is called$/,
      run: async ({ world }) => {
        world.response = await runHandler({
          method: world.method,
          body: world.body,
          fetchImpl: world.fetchImpl,
          serviceAccountJson: world.serviceAccountJson,
          serviceAccountPath: world.serviceAccountPath,
          projectId: world.projectId,
          location: world.location,
        });
      },
    },
    {
      pattern: /^Then the Google Speech response status is (\d+)$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.res.statusCode, Number(args[0]));
      },
    },
    {
      pattern: /^Then the Google Speech payload error is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.deepEqual(world.response.res.payload, { error: args[0] });
      },
    },
    {
      pattern: /^Then the Google Speech allow header is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.res.headers.get("allow"), args[0]);
      },
    },
    {
      pattern: /^Then the Google Speech payload transcript is "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.response.res.payload?.transcript, args[0]);
      },
    },
    {
      pattern: /^Then the Google Speech recognize URL starts with "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const recognizeUrl = world.calledUrls.find((url) => url.includes(":recognize"));
        assert.ok(recognizeUrl);
        assert.ok(recognizeUrl.startsWith(args[0]));
      },
    },
  ],
});

test("parseServiceAccountJson returns null for malformed json", () => {
  assert.equal(parseServiceAccountJson("{"), null);
});

test("parseServiceAccountJson returns null for empty and incomplete payloads", () => {
  assert.equal(parseServiceAccountJson(""), null);
  assert.equal(parseServiceAccountJson(JSON.stringify({ client_email: "voice@example.com" })), null);
});

test("normalizeLocation lowercases valid locations and rejects invalid values", () => {
  assert.equal(normalizeLocation("EU"), "eu");
  assert.equal(normalizeLocation(""), "eu");
  assert.equal(normalizeLocation("north europe"), "");
});

test("parseServiceAccountJson fills the default token uri when omitted", () => {
  assert.deepEqual(
    parseServiceAccountJson(
      JSON.stringify({
        client_email: "voice@example.iam.gserviceaccount.com",
        private_key: "-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n",
      })
    ),
    {
      clientEmail: "voice@example.iam.gserviceaccount.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n",
      tokenUri: "https://oauth2.googleapis.com/token",
    }
  );
});

test("loadServiceAccount returns null for unreadable file", () => {
  assert.equal(loadServiceAccount({ filePath: "/tmp/does-not-exist-speech.json" }), null);
});

test("loadServiceAccount prefers inline json over file lookup", () => {
  assert.deepEqual(
    loadServiceAccount({
      rawJson: JSON.stringify({
        client_email: "voice@example.iam.gserviceaccount.com",
        private_key: "-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n",
      }),
      filePath: "/tmp/does-not-exist-speech.json",
    }),
    {
      clientEmail: "voice@example.iam.gserviceaccount.com",
      privateKey: "-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n",
      tokenUri: "https://oauth2.googleapis.com/token",
    }
  );
});

test("base64UrlEncode produces url-safe output", () => {
  assert.equal(base64UrlEncode("??"), "Pz8");
});

test("createAssertion creates a signed jwt", () => {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 1024 });
  const token = createAssertion({
    clientEmail: "voice@example.iam.gserviceaccount.com",
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }),
    tokenUri: "https://oauth2.googleapis.com/token",
    nowMs: 1_700_000_000_000,
  });
  const parts = token.split(".");
  assert.equal(parts.length, 3);
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  assert.deepEqual(header, { alg: "RS256", typ: "JWT" });
  assert.equal(claims.iss, "voice@example.iam.gserviceaccount.com");
  assert.equal(claims.aud, "https://oauth2.googleapis.com/token");
});

test("fetchGoogleAccessToken reuses the cached token until expiry", async () => {
  delete require.cache[require.resolve("../api/v1/speech-transcribe")];
  const freshModule = require("../api/v1/speech-transcribe");
  const { fetchGoogleAccessToken: freshFetchGoogleAccessToken } = freshModule._private;
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          access_token: "cached-token",
          expires_in: 3600,
        };
      },
    };
  };
  const serviceAccount = {
    clientEmail: "voice@example.iam.gserviceaccount.com",
    privateKey: "key",
    tokenUri: "https://oauth2.googleapis.com/token",
  };
  const createAssertionFn = () => "signed-jwt";
  const first = await freshFetchGoogleAccessToken({
    fetchImpl,
    serviceAccount,
    createAssertionFn,
    nowMs: 1_700_000_000_000,
  });
  const second = await freshFetchGoogleAccessToken({
    fetchImpl,
    serviceAccount,
    createAssertionFn,
    nowMs: 1_700_000_010_000,
  });
  assert.equal(first, "cached-token");
  assert.equal(second, "cached-token");
  assert.equal(calls, 1);
});

test("fetchGoogleAccessToken rejects unsuccessful upstream responses", async () => {
  delete require.cache[require.resolve("../api/v1/speech-transcribe")];
  const freshModule = require("../api/v1/speech-transcribe");
  const { fetchGoogleAccessToken: freshFetchGoogleAccessToken } = freshModule._private;
  await assert.rejects(
    freshFetchGoogleAccessToken({
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        async json() {
          return {};
        },
      }),
      serviceAccount: {
        clientEmail: "voice@example.iam.gserviceaccount.com",
        privateKey: "key",
        tokenUri: "https://oauth2.googleapis.com/token",
      },
      createAssertionFn: () => "signed-jwt",
      nowMs: 1_700_000_000_000,
    }),
    /HTTP 401/
  );
});

test("fetchGoogleAccessToken rejects responses without an access token", async () => {
  delete require.cache[require.resolve("../api/v1/speech-transcribe")];
  const freshModule = require("../api/v1/speech-transcribe");
  const { fetchGoogleAccessToken: freshFetchGoogleAccessToken } = freshModule._private;
  await assert.rejects(
    freshFetchGoogleAccessToken({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {};
        },
      }),
      serviceAccount: {
        clientEmail: "voice@example.iam.gserviceaccount.com",
        privateKey: "key",
        tokenUri: "https://oauth2.googleapis.com/token",
      },
      createAssertionFn: () => "signed-jwt",
      nowMs: 1_700_000_000_000,
    }),
    /HTTP 200/
  );
});

test("extractTranscript joins alternatives and getSpeechApiBaseUrl selects the host", () => {
  assert.equal(extractTranscript({}), "");
  assert.equal(
    extractTranscript({
      results: [
        { alternatives: [{ transcript: "Kamppi" }] },
        { alternatives: [{ transcript: "Pasila" }] },
      ],
    }),
    "Kamppi Pasila"
  );
  assert.equal(getSpeechApiBaseUrl("global"), "https://speech.googleapis.com");
  assert.equal(getSpeechApiBaseUrl("eu"), "https://eu-speech.googleapis.com");
});

test("recognizeSpeech uses the global host and returns joined transcript", async () => {
  const transcript = await recognizeSpeech({
    fetchImpl: async (url) => {
      assert.match(
        String(url),
        /^https:\/\/speech\.googleapis\.com\/v2\/projects\/voice-project\/locations\/global\/recognizers\/_:recognize$/
      );
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            results: [
              { alternatives: [{ transcript: "A" }] },
              { alternatives: [{ transcript: "juna" }] },
            ],
          };
        },
      };
    },
    accessToken: "token",
    projectId: "voice-project",
    location: "global",
    content: "ZmFrZS1hdWRpbw==",
  });
  assert.equal(transcript, "A juna");
});
