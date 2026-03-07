const TRANSCRIBE_TIMEOUT_MS = 7000;
const DEFAULT_TRANSCRIPTION_LANGUAGE = "fi";
const DEFAULT_AUDIO_FILE_NAME = "voice-query.webm";
const DEFAULT_AUDIO_MIME_TYPE = "audio/webm";

function errorResponse(res, status, message) {
  return res.status(status).json({ error: message });
}

function normalizeTranscriptionApiUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) return "";

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeOptionalText(value) {
  return String(value || "").trim();
}

function normalizeAudioFileName(fileName) {
  const normalized = normalizeOptionalText(fileName).replace(/[^\w.-]+/g, "-");
  return normalized || DEFAULT_AUDIO_FILE_NAME;
}

function normalizeAudioMimeType(mimeType) {
  const normalized = normalizeOptionalText(mimeType).toLowerCase();
  return normalized || DEFAULT_AUDIO_MIME_TYPE;
}

function decodeBase64AudioContent(content) {
  return Buffer.from(String(content || ""), "base64");
}

function createAudioFile({
  content,
  fileName = DEFAULT_AUDIO_FILE_NAME,
  mimeType = DEFAULT_AUDIO_MIME_TYPE,
} = {}) {
  const bytes = decodeBase64AudioContent(content);
  return new File([bytes], normalizeAudioFileName(fileName), {
    type: normalizeAudioMimeType(mimeType),
  });
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function extractTranscript(responseJson) {
  const transcript = responseJson?.text ?? responseJson?.transcript ?? "";
  return String(transcript || "").trim();
}

async function transcribeSpeech({
  fetchImpl = fetch,
  apiUrl,
  apiKey,
  model,
  language = DEFAULT_TRANSCRIPTION_LANGUAGE,
  audioFile,
} = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
  const form = new FormData();

  form.append("file", audioFile, audioFile?.name || DEFAULT_AUDIO_FILE_NAME);
  form.append("model", normalizeOptionalText(model));
  if (normalizeOptionalText(language)) {
    form.append("language", normalizeOptionalText(language));
  }

  try {
    const response = await fetchImpl(apiUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
      body: form,
      signal: controller.signal,
    });
    const json = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(`Speech transcription request failed with HTTP ${response.status}`);
    }
    return extractTranscript(json);
  } finally {
    clearTimeout(timeoutId);
  }
}

function createSpeechTranscribeHandler({
  fetchImpl = fetch,
  getApiUrl = () => process.env.SPEECH_TRANSCRIBE_API_URL,
  getApiKey = () => process.env.SPEECH_TRANSCRIBE_API_KEY || process.env.OPENAI_API_KEY,
  getModel = () => process.env.SPEECH_TRANSCRIBE_MODEL,
  getLanguage = () => process.env.SPEECH_TRANSCRIBE_LANGUAGE || DEFAULT_TRANSCRIPTION_LANGUAGE,
  getDefaultFileName = () => DEFAULT_AUDIO_FILE_NAME,
  getDefaultMimeType = () => DEFAULT_AUDIO_MIME_TYPE,
} = {}) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return errorResponse(res, 405, "Method not allowed");
    }

    const apiUrl = normalizeTranscriptionApiUrl(getApiUrl());
    const apiKey = normalizeOptionalText(getApiKey());
    const model = normalizeOptionalText(getModel());
    const language = normalizeOptionalText(getLanguage());
    if (!apiUrl || !apiKey || !model) {
      return errorResponse(res, 503, "Speech transcription is not configured");
    }

    const content = normalizeOptionalText(req.body?.content);
    if (!content) {
      return errorResponse(res, 400, "Audio content is required");
    }

    try {
      const transcript = await transcribeSpeech({
        fetchImpl,
        apiUrl,
        apiKey,
        model,
        language,
        audioFile: createAudioFile({
          content,
          fileName: req.body?.fileName || getDefaultFileName(),
          mimeType: req.body?.mimeType || getDefaultMimeType(),
        }),
      });
      if (!transcript) {
        return errorResponse(res, 422, "No speech detected");
      }
      return res.status(200).json({ transcript });
    } catch (error) {
      console.error("speech transcribe error:", error);
      return errorResponse(res, 502, "Could not transcribe speech");
    }
  };
}

const handler = createSpeechTranscribeHandler();

module.exports = handler;
module.exports._private = {
  TRANSCRIBE_TIMEOUT_MS,
  DEFAULT_TRANSCRIPTION_LANGUAGE,
  DEFAULT_AUDIO_FILE_NAME,
  DEFAULT_AUDIO_MIME_TYPE,
  errorResponse,
  normalizeTranscriptionApiUrl,
  decodeBase64AudioContent,
  createAudioFile,
  readJsonResponse,
  extractTranscript,
  transcribeSpeech,
  createSpeechTranscribeHandler,
};
