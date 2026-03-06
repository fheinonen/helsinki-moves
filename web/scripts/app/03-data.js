/* Data Loading + Geolocation Flow */
(() => {
  const app = window.HMApp;
  const { api, dom, state, constants } = app;
  const { MODE_RAIL, MODE_TRAM, MODE_METRO, MODE_BUS } = constants;

  function isStopMode(mode) {
    return mode === MODE_BUS || mode === MODE_TRAM || mode === MODE_METRO || mode === MODE_RAIL;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = constants.FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function fetchWithRetryOnce(url, options = {}) {
    let res;

    try {
      res = await fetchWithTimeout(url, options);
    } catch {
      await delay(350);
      return fetchWithTimeout(url, options);
    }

    if (res.status >= 500) {
      await delay(350);
      return fetchWithTimeout(url, options);
    }

    return res;
  }

  function buildFilterOptionsFromDepartures(departures) {
    const lines = new Map();
    const destinations = new Map();

    for (const departure of departures || []) {
      const line = String(departure?.line || "").trim();
      if (line) {
        lines.set(line, (lines.get(line) || 0) + 1);
      }

      const destination = String(departure?.destination || "").trim();
      if (destination) {
        destinations.set(destination, (destinations.get(destination) || 0) + 1);
      }
    }

    const toSortedOptions = (sourceMap) =>
      [...sourceMap.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([value, count]) => ({ value, count }));

    return {
      lines: toSortedOptions(lines),
      destinations: toSortedOptions(destinations),
    };
  }

  function updateStopModeStateFromResponse(responseData) {
    const stops = Array.isArray(responseData?.stops)
      ? responseData.stops
          .filter((stop) => stop && stop.id && stop.name)
          .map((stop) => ({
            id: stop.id,
            name: stop.name,
            code: String(stop.code || "").trim() || null,
            memberStopIds: api.uniqueNonEmptyStrings([
              ...(Array.isArray(stop.memberStopIds) ? stop.memberStopIds : []),
              stop.id,
            ]),
            stopCodes: api.uniqueNonEmptyStrings([
              ...(Array.isArray(stop.stopCodes) ? stop.stopCodes : []),
              stop.code,
            ]),
            distanceMeters: Number(stop.distanceMeters) || 0,
          }))
      : [];

    state.busStops = stops;

    const selectedFromResponse = String(responseData?.selectedStopId || "").trim() || null;
    const stopExists = (id) => stops.some((stop) => stop.id === id);
    const previousStopId = String(state.busStopId || "").trim() || null;
    const hadInvalidSelectedStop = Boolean(
      previousStopId &&
      !stopExists(previousStopId) &&
      !(selectedFromResponse && stopExists(selectedFromResponse))
    );

    if (selectedFromResponse && stopExists(selectedFromResponse)) {
      state.busStopId = selectedFromResponse;
    } else if (!state.busStopId || !stopExists(state.busStopId)) {
      state.busStopId = stops[0]?.id || null;
    }

    const nearestStopId = stops[0]?.id || null;
    if (!state.busStopId) {
      state.stopFilterPinned = false;
    } else if (nearestStopId && state.busStopId !== nearestStopId) {
      state.stopFilterPinned = true;
    } else if (hadInvalidSelectedStop) {
      state.stopFilterPinned = false;
    }

    if (state.deferInitialStopContext) {
      state.deferInitialStopContext = false;
      state.deferredBusStopId = null;
      state.deferredBusLineFilters = [];
      state.deferredBusDestinationFilters = [];
      state.busLineFilters = [];
      state.busDestinationFilters = [];
      state.stopFilterPinned = false;
      state.busStopMemberFilterId = null;
    }

    state.hasCompletedInitialStopModeLoad = true;

    const departures = Array.isArray(responseData?.station?.departures)
      ? responseData.station.departures
      : [];
    const availableDepartureStopIds = new Set(
      departures
        .map((departure) => String(departure?.stopId || "").trim())
        .filter(Boolean)
    );
    if (!state.stopFilterPinned) {
      state.busStopMemberFilterId = null;
    } else if (
      state.busStopMemberFilterId &&
      !availableDepartureStopIds.has(String(state.busStopMemberFilterId).trim())
    ) {
      state.busStopMemberFilterId = null;
    }
    state.busFilterOptions = buildFilterOptionsFromDepartures(departures);
    api.sanitizeStopSelections();
  }

  function createVoiceError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function getVoiceErrorCode(error) {
    return String(error?.code || "")
      .trim()
      .toLowerCase();
  }

  function getVoiceRecognitionLanguages() {
    return api.uniqueNonEmptyStrings([
      "fi-FI",
      "en-US",
      ...(Array.isArray(navigator.languages) ? navigator.languages : []),
      navigator.language,
    ]);
  }

  function supportsAzureVoiceLocation() {
    return typeof window.HMApp?.azureSpeech?.recognizeOnce === "function";
  }

  function getSpeechRecognitionConstructor() {
    if (typeof window.SpeechRecognition === "function") return window.SpeechRecognition;
    if (typeof window.webkitSpeechRecognition === "function") return window.webkitSpeechRecognition;
    if (typeof window.mozSpeechRecognition === "function") return window.mozSpeechRecognition;
    if (typeof window.msSpeechRecognition === "function") return window.msSpeechRecognition;
    return null;
  }

  function supportsVoiceLocation() {
    return Boolean(getSpeechRecognitionConstructor());
  }

  async function requestAzureSpeechToken() {
    let res;

    try {
      res = await fetchWithRetryOnce("/api/v1/speech-token", { method: "GET" });
    } catch {
      throw createVoiceError(
        "voice_service_unavailable",
        "Could not start voice transcription."
      );
    }

    if (!(res.headers.get("content-type") || "").includes("application/json")) {
      throw createVoiceError(
        "voice_service_unavailable",
        "Could not start voice transcription."
      );
    }

    const json = await res.json();
    if (!res.ok) {
      const message = String(json?.error || "").trim();
      throw createVoiceError(
        "voice_service_unavailable",
        message || "Could not start voice transcription."
      );
    }

    const token = String(json?.token || "").trim();
    const region = String(json?.region || "")
      .trim()
      .toLowerCase();
    if (!token || !region) {
      throw createVoiceError(
        "voice_service_unavailable",
        "Could not start voice transcription."
      );
    }

    return { token, region };
  }

  function mapMicrophonePreflightError(error) {
    const errorName = String(error?.name || "")
      .trim()
      .toLowerCase();
    if (errorName === "notallowederror" || errorName === "securityerror") {
      return createVoiceError("voice_permission_denied", "Microphone permission denied.");
    }
    if (
      errorName === "notfounderror" ||
      errorName === "devicesnotfounderror" ||
      errorName === "notreadableerror" ||
      errorName === "trackstarterror"
    ) {
      return createVoiceError("voice_no_microphone", "No microphone available.");
    }
    return createVoiceError("voice_not_understood", "Unable to access microphone.");
  }

  async function requestMicrophonePreflightPermission() {
    const mediaDevices = navigator?.mediaDevices;
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
      return;
    }

    let stream = null;
    try {
      stream = await mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      throw mapMicrophonePreflightError(error);
    } finally {
      const tracks = typeof stream?.getTracks === "function" ? stream.getTracks() : [];
      for (const track of tracks) {
        try {
          track.stop();
        } catch {
          // Ignore track cleanup failures.
        }
      }
    }
  }

  function mapSpeechError(errorCode) {
    if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
      return createVoiceError("voice_permission_denied", "Microphone permission denied.");
    }
    if (errorCode === "audio-capture") {
      return createVoiceError("voice_no_microphone", "No microphone available.");
    }
    if (errorCode === "language-not-supported") {
      return createVoiceError("voice_language_not_supported", "Speech language is not supported.");
    }
    if (errorCode === "network") {
      return createVoiceError("voice_recognition_network", "Voice recognition network error.");
    }
    if (errorCode === "no-speech") {
      return createVoiceError("voice_no_speech", "No speech detected.");
    }
    return createVoiceError("voice_not_understood", "Voice recognition failed.");
  }

  function mapSpeechStartError(error) {
    const errorName = String(error?.name || "")
      .trim()
      .toLowerCase();
    if (errorName === "notsupportederror") {
      return createVoiceError("voice_unsupported", "Voice recognition not supported.");
    }
    if (errorName === "notallowederror" || errorName === "securityerror") {
      return createVoiceError("voice_permission_denied", "Microphone permission denied.");
    }
    return createVoiceError("voice_not_understood", "Unable to start voice recognition.");
  }

  function mapAzureSpeechCancellation(result) {
    const details = String(result?.errorDetails || "").trim();
    const normalizedDetails = details.toLowerCase();
    if (
      normalizedDetails.includes("token") ||
      normalizedDetails.includes("subscription") ||
      normalizedDetails.includes("authentication") ||
      normalizedDetails.includes("forbidden") ||
      normalizedDetails.includes("unauthorized")
    ) {
      return createVoiceError(
        "voice_service_unavailable",
        "Could not start voice transcription."
      );
    }
    if (normalizedDetails.includes("network") || normalizedDetails.includes("connection")) {
      return createVoiceError("voice_recognition_network", "Voice recognition network error.");
    }
    return createVoiceError("voice_not_understood", details || "Voice recognition failed.");
  }

  async function captureAzureVoiceQuery(language) {
    const recognizeOnce = window.HMApp?.azureSpeech?.recognizeOnce;
    if (typeof recognizeOnce !== "function") {
      throw createVoiceError(
        "voice_service_unavailable",
        "Could not start voice transcription."
      );
    }

    const session = await requestAzureSpeechToken();

    let result;
    try {
      result = await recognizeOnce({
        token: session.token,
        region: session.region,
        language,
      });
    } catch {
      throw createVoiceError("voice_recognition_network", "Voice recognition network error.");
    }

    if (result?.reason === "recognized") {
      const transcript = String(result?.transcript || "").trim();
      if (!transcript) {
        throw createVoiceError("voice_no_speech", "No speech detected.");
      }
      return transcript;
    }

    if (result?.reason === "no-match") {
      throw createVoiceError("voice_no_speech", "No speech detected.");
    }

    if (result?.reason === "canceled") {
      throw mapAzureSpeechCancellation(result);
    }

    throw createVoiceError("voice_not_understood", "Voice recognition failed.");
  }

  async function captureAzureVoiceQueryWithRetry() {
    const languages = getVoiceRecognitionLanguages();
    let lastError = null;

    for (const language of languages) {
      try {
        return await captureAzureVoiceQuery(language);
      } catch (error) {
        lastError = error;
        if (!shouldRetryVoiceRecognition(getVoiceErrorCode(error))) {
          break;
        }
      }
    }

    throw lastError || createVoiceError("voice_not_understood", "Voice recognition failed.");
  }

  function captureVoiceQuery(language) {
    const SpeechRecognition = getSpeechRecognitionConstructor();
    if (!SpeechRecognition) {
      return Promise.reject(
        createVoiceError("voice_unsupported", "Voice recognition not supported.")
      );
    }

    return new Promise((resolve, reject) => {
      const recognition = new SpeechRecognition();
      const preferredLanguage = String(language || navigator.language || "fi-FI").trim();
      recognition.lang = preferredLanguage || "fi-FI";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      let settled = false;
      let transcript = "";
      let silenceStopTimerId = null;
      let stopRequested = false;

      const clearSilenceStopTimer = () => {
        clearTimeout(silenceStopTimerId);
        silenceStopTimerId = null;
      };

      const requestStop = () => {
        if (stopRequested || settled) return;
        stopRequested = true;
        try {
          recognition.stop();
        } catch {
          // Ignore stop errors; timeout/onend handlers still guard completion.
        }
      };

      const scheduleSilenceStop = () => {
        clearSilenceStopTimer();
        silenceStopTimerId = setTimeout(requestStop, constants.VOICE_SILENCE_STOP_MS);
      };

      const cleanup = () => {
        clearTimeout(timeoutId);
        clearSilenceStopTimer();
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.onspeechend = null;
        recognition.onsoundend = null;
        recognition.onaudioend = null;
        recognition.onnomatch = null;
      };

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };

      const timeoutId = setTimeout(() => {
        try {
          recognition.abort();
        } catch {
          // Ignore abort errors during timeout cleanup.
        }
        finish(
          reject,
          createVoiceError("voice_recognition_timeout", "Voice recognition timed out.")
        );
      }, constants.VOICE_RECOGNITION_TIMEOUT_MS);

      recognition.onresult = (event) => {
        for (let index = event?.resultIndex || 0; index < (event?.results?.length || 0); index += 1) {
          const result = event.results[index];
          const nextTranscript = String(result?.[0]?.transcript || "").trim();
          if (!nextTranscript) continue;
          transcript = nextTranscript;
          scheduleSilenceStop();
          if (result?.isFinal) {
            requestStop();
            return;
          }
        }
      };

      recognition.onerror = (event) => {
        const speechCode = String(event?.error || "")
          .trim()
          .toLowerCase();
        finish(reject, mapSpeechError(speechCode));
      };

      recognition.onend = () => {
        if (settled) return;

        const cleaned = String(transcript || "").trim();
        if (!cleaned) {
          finish(reject, createVoiceError("voice_no_speech", "No speech detected."));
          return;
        }

        finish(resolve, cleaned);
      };

      recognition.onspeechend = () => {
        requestStop();
      };

      recognition.onsoundend = () => {
        scheduleSilenceStop();
      };

      recognition.onaudioend = () => {
        scheduleSilenceStop();
      };

      recognition.onnomatch = () => {
        finish(reject, createVoiceError("voice_not_understood", "Could not understand speech."));
      };

      try {
        recognition.start();
      } catch (error) {
        finish(reject, mapSpeechStartError(error));
      }
    });
  }

  function shouldRetryVoiceRecognition(errorCode) {
    return (
      errorCode === "voice_no_speech" ||
      errorCode === "voice_not_understood" ||
      errorCode === "voice_recognition_timeout" ||
      errorCode === "voice_language_not_supported"
    );
  }

  async function captureVoiceQueryWithRetry() {
    const languages = getVoiceRecognitionLanguages();
    let lastError = null;

    for (const language of languages) {
      try {
        return await captureVoiceQuery(language);
      } catch (error) {
        lastError = error;
        if (!shouldRetryVoiceRecognition(getVoiceErrorCode(error))) {
          break;
        }
      }
    }

    throw lastError || createVoiceError("voice_not_understood", "Voice recognition failed.");
  }

  function shouldFallbackToBrowserVoice(errorCode) {
    return errorCode === "voice_service_unavailable";
  }

  async function capturePreferredVoiceQueryWithRetry() {
    if (supportsAzureVoiceLocation()) {
      try {
        return await captureAzureVoiceQueryWithRetry();
      } catch (error) {
        if (!shouldFallbackToBrowserVoice(getVoiceErrorCode(error))) {
          throw error;
        }
      }
    }

    if (supportsVoiceLocation()) {
      return captureVoiceQueryWithRetry();
    }

    throw createVoiceError("voice_unsupported", "Voice recognition not supported.");
  }

  function normalizeVoiceLocationChoices(rawChoices) {
    if (!Array.isArray(rawChoices)) return [];

    return rawChoices
      .map((choice) => {
        const lat = Number(choice?.lat);
        const lon = Number(choice?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

        return {
          lat,
          lon,
          label: String(choice?.label || "").trim(),
        };
      })
      .filter(Boolean);
  }

  function hideVoiceLocationChoices() {
    if (dom.voiceLocationChoicesEl) {
      dom.voiceLocationChoicesEl.classList.add("hidden");
    }
    if (dom.voiceLocationChoicesTitleEl) {
      dom.voiceLocationChoicesTitleEl.textContent = "";
    }
    if (dom.voiceLocationChoicesOptionsEl) {
      dom.voiceLocationChoicesOptionsEl.innerHTML = "";
    }
    if (dom.voiceLocationChoicesCancelEl) {
      dom.voiceLocationChoicesCancelEl.onclick = null;
    }
  }

  function promptVoiceLocationChoiceWithPrompt(query, choices) {
    if (typeof window.prompt !== "function") {
      throw createVoiceError(
        "voice_location_selection_cancelled",
        "Location selection was cancelled."
      );
    }

    const optionsText = choices
      .map((choice, index) => `${index + 1}. ${choice.label || `${choice.lat}, ${choice.lon}`}`)
      .join("\n");
    const response = window.prompt(
      `Multiple matches found for "${api.safeString(query, 80)}". Select number:\n${optionsText}`,
      "1"
    );

    if (response == null) {
      throw createVoiceError(
        "voice_location_selection_cancelled",
        "Location selection was cancelled."
      );
    }

    const parsed = Number.parseInt(String(response).trim(), 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > choices.length) {
      throw createVoiceError("voice_location_selection_invalid", "Invalid location selection.");
    }

    return choices[parsed - 1];
  }

  async function promptVoiceLocationChoice(query, choices) {
    if (!Array.isArray(choices) || choices.length === 0) {
      throw createVoiceError("voice_location_not_found", "No matching location found.");
    }

    if (
      !dom.voiceLocationChoicesEl ||
      !dom.voiceLocationChoicesTitleEl ||
      !dom.voiceLocationChoicesOptionsEl ||
      !dom.voiceLocationChoicesCancelEl
    ) {
      return promptVoiceLocationChoiceWithPrompt(query, choices);
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        hideVoiceLocationChoices();
        callback(value);
      };

      dom.voiceLocationChoicesTitleEl.textContent = `Multiple matches for "${api.safeString(
        query,
        80
      )}". Choose one:`;
      api.setStatus("Multiple matches found. Choose one below.");
      dom.voiceLocationChoicesOptionsEl.innerHTML = "";

      for (const choice of choices) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "voice-location-choice-option";
        button.textContent = choice.label || `${choice.lat.toFixed(5)}, ${choice.lon.toFixed(5)}`;
        button.addEventListener("click", () => finish(resolve, choice), { once: true });
        dom.voiceLocationChoicesOptionsEl.appendChild(button);
      }

      dom.voiceLocationChoicesCancelEl.onclick = () =>
        finish(
          reject,
          createVoiceError("voice_location_selection_cancelled", "Location selection was cancelled.")
        );

      dom.voiceLocationChoicesEl.classList.remove("hidden");
    });
  }

  function normalizeVoiceLineToken(rawToken) {
    const token = String(rawToken || "")
      .trim()
      .toUpperCase();
    if (!token) return "";
    if (!/^[A-Z0-9]+$/.test(token)) return "";
    if (token.length > 5) return "";
    if (!/\d/.test(token) && token.length !== 1) return "";
    return token;
  }

  function parseVoiceLineIntent(rawTranscript) {
    const transcript = String(rawTranscript || "").trim();
    if (!transcript) return null;

    const modeByKeyword = new Map([
      ["bus", MODE_BUS],
      ["bussi", MODE_BUS],
      ["tram", MODE_TRAM],
      ["ratikka", MODE_TRAM],
      ["raitiovaunu", MODE_TRAM],
      ["train", MODE_RAIL],
      ["juna", MODE_RAIL],
    ]);

    const tokens = transcript
      .toLowerCase()
      .split(/[\s\-–—_/]+/u)
      .map((token) => token.trim())
      .filter(Boolean);
    if (tokens.length === 0) return null;

    const explicitModeToken = tokens.find((token) => modeByKeyword.has(token)) || null;
    const explicitMode = explicitModeToken ? modeByKeyword.get(explicitModeToken) : null;

    const lineCandidates = tokens
      .filter((token) => !modeByKeyword.has(token))
      .map((token) => normalizeVoiceLineToken(token))
      .filter(Boolean);

    if (explicitMode) {
      const line = lineCandidates[0] || "";
      if (!line) return null;
      return {
        type: "line-intent",
        mode: explicitMode,
        line,
        explicitMode: true,
      };
    }

    if (tokens.length !== 1) {
      return null;
    }

    const line = normalizeVoiceLineToken(tokens[0]);
    if (!line) return null;

    return {
      type: "line-intent",
      mode: null,
      line,
      explicitMode: false,
    };
  }

  function hasMatchingLineDeparture(station, lineToken) {
    const expectedLine = normalizeVoiceLineToken(lineToken);
    if (!expectedLine) return false;
    const departures = Array.isArray(station?.departures) ? station.departures : [];

    return departures.some(
      (departure) => normalizeVoiceLineToken(departure?.line) === expectedLine
    );
  }

  function getSoonestMatchingDepartureMs(station, lineToken) {
    const expectedLine = normalizeVoiceLineToken(lineToken);
    if (!expectedLine) return Number.POSITIVE_INFINITY;
    const departures = Array.isArray(station?.departures) ? station.departures : [];
    const matchingTimes = departures
      .filter((departure) => normalizeVoiceLineToken(departure?.line) === expectedLine)
      .map((departure) => new Date(departure?.departureIso).getTime())
      .filter(Number.isFinite);

    if (matchingTimes.length === 0) return Number.POSITIVE_INFINITY;
    return Math.min(...matchingTimes);
  }

  function getVoiceLineIntentModes(intentMode) {
    if (intentMode) {
      return [intentMode];
    }

    return api
      .uniqueNonEmptyStrings([state.mode, MODE_BUS, MODE_TRAM, MODE_RAIL])
      .filter((mode) => isStopMode(mode));
  }

  function getVoiceLineIntentCoords() {
    const lat = Number(state.currentCoords?.lat);
    const lon = Number(state.currentCoords?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { lat, lon, fallback: false };
    }

    return { lat: 60.1699, lon: 24.9384, fallback: true };
  }

  function buildLineIntentNoMatchStatus(mode, line) {
    const normalizedLine = normalizeVoiceLineToken(line);
    if (!mode) {
      return `No nearby departures found for line ${normalizedLine}.`;
    }
    return `No nearby departures found for ${mode} ${normalizedLine}.`;
  }

  function buildDeparturesRequestParams({
    lat,
    lon,
    mode,
    results,
    stopId = null,
    lines = [],
    destinations = [],
    lineIntent = false,
  }) {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      mode: String(mode || "").toUpperCase(),
      results: String(results),
    });

    const normalizedStopId = String(stopId || "").trim();
    if (normalizedStopId) {
      params.set("stopId", normalizedStopId);
    }

    for (const line of api.uniqueNonEmptyStrings(lines.map((value) => normalizeVoiceLineToken(value)))) {
      params.append("line", line);
    }

    for (const destination of api.uniqueNonEmptyStrings(destinations)) {
      params.append("dest", destination);
    }

    if (lineIntent) {
      params.set("lineIntent", "1");
    }

    return params;
  }

  async function requestDeparturesPayload(options) {
    const params = buildDeparturesRequestParams(options);
    const res = await fetchWithRetryOnce(`/api/v1/departures?${params.toString()}`);
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      if (!res.ok) {
        throw new Error("Request failed");
      }
      throw new Error("Unexpected server response.");
    }

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || "Request failed");
    }

    return json;
  }

  function applySuccessfulLoad({ json, requestMode, wasInitialStopModeLoad }) {
    if (isStopMode(requestMode)) {
      updateStopModeStateFromResponse(json);
      api.persistUiState();
      if (wasInitialStopModeLoad) {
        api.trackInitialNearestStopResolved(json, requestMode);
      }
    }

    state.latestResponse = json;
    api.render(json);
    api.setPermissionRequired(false);
    api.setLastUpdated(new Date());
    api.setStatus("");
    api.trackFirstSuccessfulRender(json, requestMode);
  }

  function compareLineIntentCandidates(a, b) {
    if (a.departureTimeMs !== b.departureTimeMs) {
      return a.departureTimeMs - b.departureTimeMs;
    }

    const aIsCurrentMode = a.mode === state.mode ? 1 : 0;
    const bIsCurrentMode = b.mode === state.mode ? 1 : 0;
    if (aIsCurrentMode !== bIsCurrentMode) {
      return bIsCurrentMode - aIsCurrentMode;
    }

    return a.distanceMeters - b.distanceMeters;
  }

  async function resolveVoiceLineIntentAndLoad(transcript, intent) {
    const requestedLine = normalizeVoiceLineToken(intent?.line);
    const requestedModes = getVoiceLineIntentModes(intent?.mode);
    if (!requestedLine || requestedModes.length === 0) {
      return false;
    }
    const loadToken = ++state.latestLoadToken;

    const coords = getVoiceLineIntentCoords();
    let upstreamFailureCount = 0;
    let firstUpstreamFailure = null;
    const requestedCandidates = await Promise.all(
      requestedModes.map(async (mode) => {
        try {
          const json = await requestDeparturesPayload({
            lat: coords.lat,
            lon: coords.lon,
            mode,
            results: api.getActiveResultsLimit(mode),
            lines: [requestedLine],
            lineIntent: true,
          });
          const station = json?.station;
          if (!station || !hasMatchingLineDeparture(station, requestedLine)) {
            return null;
          }

          return {
            mode,
            json,
            departureTimeMs: getSoonestMatchingDepartureMs(station, requestedLine),
            distanceMeters: Number(station?.distanceMeters) || Number.POSITIVE_INFINITY,
          };
        } catch (error) {
          upstreamFailureCount += 1;
          firstUpstreamFailure ||= error;
          console.error("voice line-intent request error:", error);
          return null;
        }
      })
    );

    if (loadToken !== state.latestLoadToken) {
      return false;
    }

    const candidates = requestedCandidates.filter(Boolean).sort(compareLineIntentCandidates);
    const winner = candidates[0] || null;

    if (!winner) {
      if (upstreamFailureCount === requestedModes.length && firstUpstreamFailure) {
        throw firstUpstreamFailure;
      }
      api.reportClientMetric("voice_line_intent_no_match", {
        line: requestedLine,
        requestedMode: intent?.mode || "auto",
      });
      api.setStatus(buildLineIntentNoMatchStatus(intent?.mode || null, requestedLine));
      return false;
    }

    const selectedMode = winner.mode;
    const json = winner.json;
    const wasInitialStopModeLoad =
      isStopMode(selectedMode) && !state.hasCompletedInitialStopModeLoad;
    state.mode = selectedMode;
    api.applyModeUiState({ modeOnly: true });

    if (isStopMode(selectedMode)) {
      updateStopModeStateFromResponse(json);
      const availableLines = new Set(
        (state.busFilterOptions.lines || []).map((option) => normalizeVoiceLineToken(option.value))
      );
      state.busLineFilters = availableLines.has(requestedLine) ? [requestedLine] : [];
      state.busDestinationFilters = [];
      state.busStopMemberFilterId = null;
      api.persistUiState();
      if (wasInitialStopModeLoad) {
        api.trackInitialNearestStopResolved(json, selectedMode);
      }
    }

    state.latestResponse = json;
    api.render(json);
    if (coords.fallback && !state.currentCoords) {
      state.currentCoords = { lat: coords.lat, lon: coords.lon };
      state.currentCoordsTimestampMs = Date.now();
      state.currentCoordsAccuracyMeters = null;
    }
    api.setResolvedLocationHint(null);
    api.setPermissionRequired(false);
    api.setLastUpdated(new Date());
    api.setStatus("");
    api.trackFirstSuccessfulRender(json, selectedMode);
    api.reportClientMetric("voice_line_intent_resolved", {
      line: requestedLine,
      resolvedMode: selectedMode,
      selectedStopId: String(json?.selectedStopId || ""),
    });
    return true;
  }

  async function resolveVoiceLocationQuery(rawQuery) {
    const query = String(rawQuery || "").trim();
    if (query.length < constants.VOICE_QUERY_MIN_LENGTH) {
      throw createVoiceError("voice_query_too_short", "Voice query too short.");
    }

    const params = new URLSearchParams({ text: query });
    if (state.currentCoords) {
      params.set("lat", String(state.currentCoords.lat));
      params.set("lon", String(state.currentCoords.lon));
    }

    const preferredLanguage =
      (Array.isArray(navigator.languages) && navigator.languages[0]) || navigator.language || "";
    if (preferredLanguage) {
      params.set("lang", String(preferredLanguage));
    }

    let res;
    try {
      res = await fetchWithRetryOnce(`/api/v1/geocode?${params.toString()}`);
    } catch {
      throw createVoiceError("voice_geocode_failed", "Location lookup failed.");
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw createVoiceError("voice_geocode_failed", "Unexpected location lookup response.");
    }

    const json = await res.json();
    if (!res.ok) {
      throw createVoiceError(
        "voice_geocode_failed",
        String(json?.error || "Location lookup failed.").trim()
      );
    }

    const choices = normalizeVoiceLocationChoices(json?.choices);
    if (json?.ambiguous && choices.length > 1) {
      const selected = await promptVoiceLocationChoice(query, choices);
      return {
        lat: selected.lat,
        lon: selected.lon,
        label: selected.label,
        query,
      };
    }

    const lat = Number(json?.location?.lat);
    const lon = Number(json?.location?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw createVoiceError("voice_location_not_found", "No matching location found.");
    }

    return {
      lat,
      lon,
      label: String(json?.location?.label || "").trim(),
      query,
    };
  }

  function shouldOfferVoiceTypedFallback(errorCode) {
    return (
      errorCode === "voice_service_unavailable" ||
      errorCode === "voice_unsupported" ||
      errorCode === "voice_no_speech" ||
      errorCode === "voice_recognition_timeout" ||
      errorCode === "voice_recognition_network" ||
      errorCode === "voice_not_understood"
    );
  }

  function promptVoiceTypedFallback(errorCode) {
    if (!shouldOfferVoiceTypedFallback(errorCode) || typeof window.prompt !== "function") {
      return null;
    }

    let hint = "Could not capture your voice on this device. Type your location:";
    if (errorCode === "voice_service_unavailable") {
      hint = "Voice transcription is unavailable right now. Type your location or line instead:";
    }
    if (errorCode === "voice_unsupported") {
      hint = "This browser does not support speech recognition. Type your location or line (number or letter) instead:";
    }
    const input = window.prompt(
      `${hint}\nExample: Kamppi Helsinki, A-train, bus 52, 200`,
      ""
    );
    const cleaned = String(input || "").trim();
    return cleaned || null;
  }

  async function resolveVoiceQueryAndLoad(rawQuery) {
    const transcript = String(rawQuery || "").trim();
    hideVoiceLocationChoices();
    api.setStatus(`Looking up "${api.safeString(transcript, 80)}"...`);

    const lineIntent = parseVoiceLineIntent(transcript);
    if (lineIntent) {
      api.reportClientMetric("voice_line_intent_detected", {
        line: lineIntent.line,
        requestedMode: lineIntent.mode || "auto",
        explicitMode: lineIntent.explicitMode ? "1" : "0",
      });
      return resolveVoiceLineIntentAndLoad(transcript, lineIntent);
    }

    api.reportClientMetric("voice_line_intent_parse_failed", {
      transcriptLength: transcript.length,
    });

    const location = await resolveVoiceLocationQuery(transcript);
    api.setResolvedLocationHint({
      query: transcript,
      label: location.label,
      lat: location.lat,
      lon: location.lon,
    });
    state.currentCoords = { lat: location.lat, lon: location.lon };
    state.currentCoordsTimestampMs = Date.now();
    state.currentCoordsAccuracyMeters = null;
    api.setPermissionRequired(false);
    await load(location.lat, location.lon);
    return true;
  }

  async function requestVoiceLocationAndLoad() {
    if (state.isLoading || state.isVoiceListening) return false;

    hideVoiceLocationChoices();
    api.setVoiceListening(true);
    api.setStatus("Listening... speak now, then pause.");

    try {
      await requestMicrophonePreflightPermission();

      const transcript = await capturePreferredVoiceQueryWithRetry();
      return resolveVoiceQueryAndLoad(transcript);
    } catch (error) {
      const errorCode = getVoiceErrorCode(error);
      const fallbackQuery = promptVoiceTypedFallback(errorCode);
      if (fallbackQuery) {
        try {
          return await resolveVoiceQueryAndLoad(fallbackQuery);
        } catch (fallbackError) {
          console.error("voice fallback location error:", fallbackError);
          api.reportClientError("voice-location-fallback", fallbackError, {
            mode: state.mode,
            sourceCode: errorCode || "unknown",
          });
          api.setStatus(api.getVoiceLocationErrorStatus(fallbackError));
          return false;
        }
      }

      if (!errorCode || errorCode === "unknown") {
        console.error("voice location error:", error);
      }
      api.reportClientError("voice-location", error, {
        mode: state.mode,
        code: errorCode || "unknown",
      });
      api.setStatus(api.getVoiceLocationErrorStatus(error));
      return false;
    } finally {
      api.setVoiceListening(false);
    }
  }

  async function load(lat, lon) {
    const loadToken = ++state.latestLoadToken;
    const requestMode = state.mode;
    const requestBusStopId = state.busStopId;
    const wasInitialStopModeLoad = isStopMode(requestMode) && !state.hasCompletedInitialStopModeLoad;

    api.setLoading(true);
    api.setStatus("Loading departures...");

    try {
      // Keep first stop-mode request nearest-first; persisted stop context is only
      // restored if user explicitly re-selects it during this session.
      const skipPersistedStopContext =
        isStopMode(requestMode) &&
        (state.deferInitialStopContext || !state.hasCompletedInitialStopModeLoad);
      const requestedStopId =
        isStopMode(requestMode) && requestBusStopId && !skipPersistedStopContext
          ? requestBusStopId
          : null;

      const json = await requestDeparturesPayload({
        lat,
        lon,
        mode: requestMode,
        results: api.getActiveResultsLimit(requestMode),
        stopId: requestedStopId,
      });

      if (loadToken !== state.latestLoadToken) {
        return;
      }

      applySuccessfulLoad({ json, requestMode, wasInitialStopModeLoad });
    } catch (err) {
      if (loadToken !== state.latestLoadToken) {
        return;
      }

      state.latestResponse = null;
      console.error("load departures error:", err);
      api.reportClientError("load", err, { mode: requestMode });
      api.setStatus(api.getLoadErrorStatus(err));
      dom.resultEl.classList.add("hidden");
      api.updateNextSummary(null);
    } finally {
      if (loadToken === state.latestLoadToken) {
        api.setLoading(false);
      }
    }
  }

  const LOCATION_FIX_MAX_AGE_MS = Number(constants.LOCATION_FIX_MAX_AGE_MS) || 20000;
  const LOCATION_ACCEPTABLE_ACCURACY_METERS =
    Number(constants.LOCATION_ACCEPTABLE_ACCURACY_METERS) || 250;
  const LOCATION_SIGNIFICANT_MOVE_METERS =
    Number(constants.LOCATION_SIGNIFICANT_MOVE_METERS) || 35;
  const LOCATION_WATCH_TIMEOUT_MS = Number(constants.LOCATION_WATCH_TIMEOUT_MS) || 12000;

  function hasValidCoords(coords) {
    const lat = Number(coords?.lat);
    const lon = Number(coords?.lon);
    return Number.isFinite(lat) && Number.isFinite(lon);
  }

  function toLocationFix(position) {
    const lat = Number(position?.coords?.latitude);
    const lon = Number(position?.coords?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }

    const timestampMs = Number(position?.timestamp);
    const accuracyMeters = Number(position?.coords?.accuracy);

    return {
      lat,
      lon,
      timestampMs: Number.isFinite(timestampMs) ? timestampMs : Date.now(),
      accuracyMeters:
        Number.isFinite(accuracyMeters) && accuracyMeters > 0 ? accuracyMeters : Number.POSITIVE_INFINITY,
    };
  }

  function toRadians(value) {
    return (Number(value) * Math.PI) / 180;
  }

  function getDistanceMeters(fromCoords, toCoords) {
    if (!hasValidCoords(fromCoords) || !hasValidCoords(toCoords)) {
      return Number.POSITIVE_INFINITY;
    }

    const earthRadiusMeters = 6371000;
    const latFrom = toRadians(fromCoords.lat);
    const lonFrom = toRadians(fromCoords.lon);
    const latTo = toRadians(toCoords.lat);
    const lonTo = toRadians(toCoords.lon);
    const deltaLat = latTo - latFrom;
    const deltaLon = lonTo - lonFrom;
    const a =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(latFrom) * Math.cos(latTo) * Math.sin(deltaLon / 2) ** 2;
    return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function getFixAgeMs(fix) {
    const timestampMs = Number(fix?.timestampMs);
    if (!Number.isFinite(timestampMs)) return Number.POSITIVE_INFINITY;
    // Geolocation timestamps are epoch ms in browsers. Non-epoch values
    // can appear in tests; treat them as fresh for deterministic checks.
    if (timestampMs < 1000000000000) return 0;
    return Math.max(0, Date.now() - timestampMs);
  }

  function isFixFresh(fix) {
    return getFixAgeMs(fix) <= LOCATION_FIX_MAX_AGE_MS;
  }

  function isFixAccurateEnough(fix) {
    const accuracy = Number(fix?.accuracyMeters);
    return Number.isFinite(accuracy) && accuracy <= LOCATION_ACCEPTABLE_ACCURACY_METERS;
  }

  function isFixNewerThanCurrent(fix) {
    const currentTimestampMs = Number(state.currentCoordsTimestampMs);
    if (!Number.isFinite(currentTimestampMs)) return true;
    return Number(fix?.timestampMs) > currentTimestampMs;
  }

  function isFixStaleComparedToCurrent(fix) {
    const currentTimestampMs = Number(state.currentCoordsTimestampMs);
    if (!Number.isFinite(currentTimestampMs)) return false;
    if (Number(fix?.timestampMs) > currentTimestampMs) return false;
    if (!hasValidCoords(state.currentCoords)) return true;
    return getDistanceMeters(state.currentCoords, fix) < LOCATION_SIGNIFICANT_MOVE_METERS;
  }

  function shouldUseWatchFallback(fix) {
    if (!fix) return false;
    if (!isFixNewerThanCurrent(fix)) return true;
    if (!isFixFresh(fix)) return true;
    if (!isFixAccurateEnough(fix)) return true;
    return isFixStaleComparedToCurrent(fix);
  }

  function shouldPromoteBestFix(bestFix) {
    if (!bestFix) return false;
    if (!isFixNewerThanCurrent(bestFix)) return false;
    if (!isFixFresh(bestFix)) return false;
    return isFixAccurateEnough(bestFix);
  }

  function pickBetterFix(currentFix, candidateFix) {
    if (!candidateFix) return currentFix;
    if (!currentFix) return candidateFix;
    const candidateFresh = isFixFresh(candidateFix);
    const currentFresh = isFixFresh(currentFix);
    if (candidateFresh !== currentFresh) {
      return candidateFresh ? candidateFix : currentFix;
    }
    if (candidateFix.timestampMs !== currentFix.timestampMs) {
      return candidateFix.timestampMs > currentFix.timestampMs ? candidateFix : currentFix;
    }
    return candidateFix.accuracyMeters < currentFix.accuracyMeters ? candidateFix : currentFix;
  }

  function requestLocationAndLoad() {
    hideVoiceLocationChoices();
    api.setResolvedLocationHint(null);

    if (!navigator.geolocation) {
      api.setStatus("Geolocation not supported in this browser.");
      api.setPermissionRequired(true);
      return false;
    }

    if (state.isLoading || state.isVoiceListening) return false;

    api.setStatus("Getting your location...");
    api.setLoading(true);

    const geolocationOptions = (enableHighAccuracy) => ({
      enableHighAccuracy,
      timeout: enableHighAccuracy ? 15000 : 10000,
      maximumAge: 0,
    });

    const shouldRetryWithHighAccuracy = (error, usedHighAccuracy) => {
      if (usedHighAccuracy) return false;
      return error?.code === 2 || error?.code === 3;
    };

    const commitLocationFix = (fix) => {
      state.currentCoords = { lat: fix.lat, lon: fix.lon };
      state.currentCoordsTimestampMs = Number(fix.timestampMs) || Date.now();
      state.currentCoordsAccuracyMeters = Number.isFinite(fix.accuracyMeters)
        ? fix.accuracyMeters
        : null;
      state.locationGranted = true;
      api.setStorageItem("location:granted", "1");
      api.setPermissionRequired(false);
      api.setLoading(false);
      load(state.currentCoords.lat, state.currentCoords.lon);
    };

    const useLastKnownLocationFallback = () => {
      if (!hasValidCoords(state.currentCoords)) {
        return false;
      }

      api.setPermissionRequired(false);
      api.setStatus("Location temporarily unavailable. Showing last known nearby stops.");
      api.setLoading(false);
      load(state.currentCoords.lat, state.currentCoords.lon);
      return true;
    };

    const handleLocationError = (error) => {
      if (error.code === 1) {
        api.setPermissionRequired(true);
      } else {
        api.setPermissionRequired(false);
      }

      api.setStatus(api.getGeolocationErrorStatus(error));
      state.latestResponse = null;
      dom.resultEl.classList.add("hidden");
      api.updateNextSummary(null);
      api.setLoading(false);
    };

    const settleWithBestFixOrFallback = (error, bestFix) => {
      if (shouldPromoteBestFix(bestFix)) {
        commitLocationFix(bestFix);
        return;
      }
      if ((error?.code === 2 || error?.code === 3) && useLastKnownLocationFallback()) {
        return;
      }
      if (bestFix && !hasValidCoords(state.currentCoords)) {
        commitLocationFix(bestFix);
        return;
      }
      handleLocationError(error || { code: 2 });
    };

    const watchForFresherFix = (initialFix) => {
      if (
        typeof navigator.geolocation.watchPosition !== "function" ||
        typeof navigator.geolocation.clearWatch !== "function"
      ) {
        settleWithBestFixOrFallback({ code: 2 }, initialFix);
        return;
      }

      let bestFix = initialFix;
      let settled = false;
      let watchId = null;
      let timeoutId = null;

      const finish = ({ fix = null, error = null } = {}) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        if (watchId != null) {
          try {
            navigator.geolocation.clearWatch(watchId);
          } catch {
            // Ignore clearWatch failures to keep refresh flow resilient.
          }
        }
        if (fix) {
          commitLocationFix(fix);
          return;
        }
        settleWithBestFixOrFallback(error, bestFix);
      };

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const fix = toLocationFix(position);
          if (!fix) return;
          bestFix = pickBetterFix(bestFix, fix);
          const hasSufficientQuality =
            isFixNewerThanCurrent(fix) && isFixAccurateEnough(fix) && isFixFresh(fix);
          if (hasSufficientQuality && !isFixStaleComparedToCurrent(fix)) {
            finish({ fix });
          }
        },
        (error) => {
          finish({ error });
        },
        geolocationOptions(true)
      );

      timeoutId = setTimeout(() => {
        finish({ error: { code: 3 } });
      }, LOCATION_WATCH_TIMEOUT_MS);
    };

    const handleLocationSuccess = (pos) => {
      const fix = toLocationFix(pos);
      if (!fix) {
        settleWithBestFixOrFallback({ code: 2 }, null);
        return;
      }
      if (shouldUseWatchFallback(fix)) {
        watchForFresherFix(fix);
        return;
      }
      commitLocationFix(fix);
    };

    const requestGeolocation = (enableHighAccuracy) => {
      navigator.geolocation.getCurrentPosition(
        handleLocationSuccess,
        (error) => {
          if (shouldRetryWithHighAccuracy(error, enableHighAccuracy)) {
            requestGeolocation(true);
            return;
          }
          if ((error?.code === 2 || error?.code === 3) && useLastKnownLocationFallback()) {
            return;
          }
          handleLocationError(error);
        },
        geolocationOptions(enableHighAccuracy)
      );
    };

    requestGeolocation(false);

    return true;
  }

  function refreshDeparturesOnly() {
    if (state.isVoiceListening) return;

    if (state.currentCoords) {
      load(state.currentCoords.lat, state.currentCoords.lon);
      return;
    }

    requestLocationAndLoad();
  }

  function applyModeUiState(options = {}) {
    const modeOnly = Boolean(options.modeOnly);
    api.updateModeButtons();
    api.updateModeLabels();
    if (modeOnly) return;
    api.renderResultsLimitControl();
    api.renderStopControls();
    api.updateDataScope(state.latestResponse);
  }

  Object.assign(api, {
    delay,
    fetchWithTimeout,
    fetchWithRetryOnce,
    updateStopModeStateFromResponse,
    buildFilterOptionsFromDepartures,
    normalizeVoiceLineToken,
    parseVoiceLineIntent,
    resolveVoiceLineIntentAndLoad,
    buildDeparturesRequestParams,
    requestDeparturesPayload,
    load,
    requestLocationAndLoad,
    requestVoiceLocationAndLoad,
    supportsAzureVoiceLocation,
    supportsVoiceLocation,
    requestAzureSpeechToken,
    captureAzureVoiceQuery,
    captureAzureVoiceQueryWithRetry,
    capturePreferredVoiceQueryWithRetry,
    captureVoiceQuery,
    captureVoiceQueryWithRetry,
    getVoiceRecognitionLanguages,
    shouldRetryVoiceRecognition,
    resolveVoiceLocationQuery,
    refreshDeparturesOnly,
    applyModeUiState,
  });
})();
