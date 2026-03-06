function safeString(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

function errorResponse(res, status, message) {
  return res.status(status).json({ error: message });
}

function normalizeRegion(value) {
  const region = safeString(value, 40).trim().toLowerCase();
  if (!region) return "";
  return /^[a-z0-9]+$/.test(region) ? region : "";
}

function getSpeechTokenUrl(region) {
  return `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
}

async function requestSpeechToken(region, speechKey, fetchImpl = fetch) {
  const res = await fetchImpl(getSpeechTokenUrl(region), {
    method: "POST",
    headers: {
      "ocp-apim-subscription-key": speechKey,
      "content-length": "0",
    },
  });

  if (!res.ok) {
    throw new Error(`Azure speech token request failed with status ${res.status}`);
  }

  const token = safeString(await res.text(), 4000).trim();
  if (!token) {
    throw new Error("Azure speech token response was empty");
  }

  return token;
}

function createSpeechTokenHandler({
  fetchImpl = fetch,
  getSpeechKey = () => process.env.AZURE_SPEECH_KEY,
  getSpeechRegion = () => process.env.AZURE_SPEECH_REGION,
  logError = console.error,
} = {}) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return errorResponse(res, 405, "Method not allowed");
    }

    const speechKey = safeString(getSpeechKey(), 200).trim();
    const region = normalizeRegion(getSpeechRegion());
    if (!speechKey || !region) {
      return errorResponse(res, 503, "Voice transcription is not configured.");
    }

    try {
      const token = await requestSpeechToken(region, speechKey, fetchImpl);
      return res.status(200).json({ token, region });
    } catch (error) {
      logError("speech token request failed:", error);
      return errorResponse(res, 502, "Could not start voice transcription.");
    }
  };
}

const handler = createSpeechTokenHandler();

module.exports = handler;
module.exports._private = {
  safeString,
  errorResponse,
  normalizeRegion,
  getSpeechTokenUrl,
  requestSpeechToken,
  createSpeechTokenHandler,
};
