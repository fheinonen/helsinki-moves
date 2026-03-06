const crypto = require("node:crypto");
const fs = require("node:fs");

const TOKEN_TIMEOUT_MS = 7000;
const GOOGLE_TOKEN_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

let accessTokenCache = null;

function errorResponse(res, status, message) {
  return res.status(status).json({ error: message });
}

function normalizeLocation(rawLocation) {
  const location = String(rawLocation || "").trim().toLowerCase();
  if (!location) return "eu";
  if (!/^[a-z0-9-]+$/.test(location)) return "";
  return location;
}

function parseServiceAccountJson(rawJson) {
  if (!rawJson) return null;
  try {
    const parsed = JSON.parse(String(rawJson));
    const clientEmail = String(parsed?.client_email || "").trim();
    const privateKey = String(parsed?.private_key || "").trim();
    const tokenUri = String(parsed?.token_uri || "https://oauth2.googleapis.com/token").trim();
    if (!clientEmail || !privateKey || !tokenUri) return null;
    return { clientEmail, privateKey, tokenUri };
  } catch {
    return null;
  }
}

function loadServiceAccount({ rawJson = "", filePath = "" } = {}) {
  const fromJson = parseServiceAccountJson(rawJson);
  if (fromJson) return fromJson;

  const normalizedPath = String(filePath || "").trim();
  if (!normalizedPath) return null;

  try {
    return parseServiceAccountJson(fs.readFileSync(normalizedPath, "utf8"));
  } catch {
    return null;
  }
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createAssertion({
  clientEmail,
  privateKey,
  tokenUri,
  nowMs = Date.now(),
}) {
  const issuedAt = Math.floor(nowMs / 1000);
  const expiresAt = issuedAt + 3600;
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: clientEmail,
      scope: GOOGLE_TOKEN_SCOPE,
      aud: tokenUri,
      exp: expiresAt,
      iat: issuedAt,
    })
  );
  const signingInput = `${header}.${claimSet}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(signingInput)
    .end()
    .sign(privateKey, "base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `${signingInput}.${signature}`;
}

async function fetchGoogleAccessToken({
  fetchImpl = fetch,
  serviceAccount,
  createAssertionFn = createAssertion,
  nowMs = Date.now(),
}) {
  if (accessTokenCache && nowMs < accessTokenCache.expiresAtMs) {
    return accessTokenCache.accessToken;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);

  try {
    const assertion = createAssertionFn({
      clientEmail: serviceAccount.clientEmail,
      privateKey: serviceAccount.privateKey,
      tokenUri: serviceAccount.tokenUri,
      nowMs,
    });
    const response = await fetchImpl(serviceAccount.tokenUri, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
      signal: controller.signal,
    });
    const json = await response.json();
    const accessToken = String(json?.access_token || "").trim();
    const expiresInSeconds = Number(json?.expires_in) || 3600;
    if (!response.ok || !accessToken) {
      throw new Error(`Google access token request failed with HTTP ${response.status}`);
    }
    accessTokenCache = {
      accessToken,
      expiresAtMs: nowMs + Math.max(60_000, (expiresInSeconds - 60) * 1000),
    };
    return accessToken;
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractTranscript(responseJson) {
  const results = Array.isArray(responseJson?.results) ? responseJson.results : [];
  const transcript = results
    .map((result) => String(result?.alternatives?.[0]?.transcript || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
  return transcript;
}

function getSpeechApiBaseUrl(location) {
  if (location === "global") return "https://speech.googleapis.com";
  return `https://${location}-speech.googleapis.com`;
}

async function recognizeSpeech({
  fetchImpl = fetch,
  accessToken,
  projectId,
  location,
  content,
  languageCode = "fi-FI",
  model = "chirp_3",
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);
  const baseUrl = getSpeechApiBaseUrl(location);

  try {
    const response = await fetchImpl(
      `${baseUrl}/v2/projects/${projectId}/locations/${location}/recognizers/_:recognize`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          config: {
            autoDecodingConfig: {},
            languageCodes: [languageCode],
            model,
          },
          content,
        }),
        signal: controller.signal,
      }
    );
    const json = await response.json();
    if (!response.ok) {
      throw new Error(`Google speech recognize failed with HTTP ${response.status}`);
    }
    return extractTranscript(json);
  } finally {
    clearTimeout(timeoutId);
  }
}

function createSpeechTranscribeHandler({
  fetchImpl = fetch,
  getServiceAccountJson = () => process.env.GOOGLE_SPEECH_SERVICE_ACCOUNT_JSON,
  getServiceAccountPath = () => process.env.GOOGLE_SPEECH_SERVICE_ACCOUNT_PATH,
  getProjectId = () => process.env.GOOGLE_CLOUD_PROJECT_ID,
  getLocation = () => process.env.GOOGLE_SPEECH_LOCATION,
  createAssertionFn = createAssertion,
} = {}) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return errorResponse(res, 405, "Method not allowed");
    }

    const serviceAccount = loadServiceAccount({
      rawJson: getServiceAccountJson(),
      filePath: getServiceAccountPath(),
    });
    const projectId = String(getProjectId() || "").trim();
    const location = normalizeLocation(getLocation());
    if (!serviceAccount || !projectId || !location) {
      return errorResponse(res, 503, "Google Speech is not configured");
    }

    const content = String(req.body?.content || "").trim();
    if (!content) {
      return errorResponse(res, 400, "Audio content is required");
    }

    try {
      const accessToken = await fetchGoogleAccessToken({
        fetchImpl,
        serviceAccount,
        createAssertionFn,
      });
      const transcript = await recognizeSpeech({
        fetchImpl,
        accessToken,
        projectId,
        location,
        content,
      });
      if (!transcript) {
        return errorResponse(res, 422, "No speech detected");
      }
      return res.status(200).json({ transcript });
    } catch (error) {
      console.error("google speech transcribe error:", error);
      return errorResponse(res, 502, "Could not transcribe speech");
    }
  };
}

const handler = createSpeechTranscribeHandler();

module.exports = handler;
module.exports._private = {
  errorResponse,
  normalizeLocation,
  parseServiceAccountJson,
  loadServiceAccount,
  base64UrlEncode,
  createAssertion,
  fetchGoogleAccessToken,
  extractTranscript,
  getSpeechApiBaseUrl,
  recognizeSpeech,
  createSpeechTranscribeHandler,
};
