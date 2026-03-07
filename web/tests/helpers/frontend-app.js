function createClassList(initialClasses = []) {
  const set = new Set(initialClasses);
  return {
    add: (...names) => names.forEach((name) => set.add(name)),
    remove: (...names) => names.forEach((name) => set.delete(name)),
    toggle(name, force) {
      if (force === true) {
        set.add(name);
        return true;
      }
      if (force === false) {
        set.delete(name);
        return false;
      }
      if (set.has(name)) {
        set.delete(name);
        return false;
      }
      set.add(name);
      return true;
    },
    contains: (name) => set.has(name),
    toString: () => [...set].join(" "),
  };
}

function createMockElement(tagName = "div", initialClasses = []) {
  const attributes = new Map();
  const listeners = new Map();
  const classList = createClassList(initialClasses);
  const element = {
    tagName: String(tagName || "div").toUpperCase(),
    textContent: "",
    innerHTML: "",
    disabled: false,
    dataset: {},
    value: "",
    children: [],
    classList,
    style: {
      setProperty() {},
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    replaceChildren(...nodes) {
      this.children = [...nodes];
    },
    setAttribute(name, value) {
      attributes.set(String(name), String(value));
    },
    getAttribute(name) {
      return attributes.has(String(name)) ? attributes.get(String(name)) : null;
    },
    removeAttribute(name) {
      attributes.delete(String(name));
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    dispatch(type, event = {}) {
      for (const handler of listeners.get(type) || []) {
        handler(event);
      }
    },
    contains(target) {
      return this === target || this.children.includes(target);
    },
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "li[role='option']") {
        return this.children.filter((child) => child.tagName === "LI");
      }
      return [];
    },
    closest() {
      return null;
    },
    focus() {},
    scrollIntoView() {},
  };

  Object.defineProperty(element, "className", {
    get() {
      return classList.toString();
    },
    set(nextClassName) {
      const next = String(nextClassName || "")
        .split(/\s+/)
        .map((value) => value.trim())
        .filter(Boolean);
      classList.remove(...classList.toString().split(/\s+/).filter(Boolean));
      classList.add(...next);
    },
  });

  return element;
}

function createBaseDom() {
  return {
    locateBtn: createMockElement("button"),
    voiceLocateBtn: createMockElement("button"),
    voiceLocateBtnLabel: createMockElement("span"),
    skeleton: createMockElement("div", ["hidden"]),
    locationPromptCard: createMockElement("section", ["hidden"]),
    locationPromptAllow: createMockElement("button"),
    permissionCard: createMockElement("section", ["hidden"]),
    permissionRetryBtn: createMockElement("button"),
    result: createMockElement("section", ["hidden"]),
    status: createMockElement("p", ["hidden"]),
    resolvedLocation: createMockElement("p", ["hidden"]),
    modeRailBtn: createMockElement("button"),
    modeTramBtn: createMockElement("button"),
    modeMetroBtn: createMockElement("button"),
    modeBusBtn: createMockElement("button"),
    modeEyebrow: createMockElement("p"),
    resultsLimitSelect: createMockElement("button"),
    resultsLimitSelectLabel: createMockElement("span"),
    resultsLimitSelectWrap: createMockElement("div"),
    resultsLimitSelectList: createMockElement("ul", ["hidden"]),
    busStopSelect: createMockElement("button"),
    busStopSelectLabel: createMockElement("span"),
    busStopSelectWrap: createMockElement("div"),
    busStopSelectList: createMockElement("ul", ["hidden"]),
    stopFiltersToggleBtn: createMockElement("button"),
    stopFiltersPanel: createMockElement("div", ["hidden"]),
    stopFilterSummary: createMockElement("span"),
    busControls: createMockElement("section", ["hidden"]),
    busStopFilters: createMockElement("div"),
    busLineFilters: createMockElement("div"),
    busDestinationFilters: createMockElement("div"),
    stationTitle: createMockElement("h2"),
    stationMeta: createMockElement("p"),
    departures: createMockElement("ul"),
    nextSummary: createMockElement("div", ["hidden"]),
    nextLabel: createMockElement("p"),
    nextMins: createMockElement("span"),
    nextLine: createMockElement("span"),
    nextTrack: createMockElement("span"),
    nextDestination: createMockElement("p"),
    dataScope: createMockElement("p", ["hidden"]),
    nowClock: createMockElement("p"),
    lastUpdated: createMockElement("p"),
    voiceLocationChoices: createMockElement("section", ["hidden"]),
    voiceLocationChoicesTitle: createMockElement("p"),
    voiceLocationChoicesOptions: createMockElement("div"),
    voiceLocationChoicesCancel: createMockElement("button"),
  };
}

function createTestEnvironment({
  mediaRecorderEnabled = true,
  mozMediaRecorderEnabled = false,
  speechRecognitionEnabled = false,
  userAgent = "test-agent",
  voiceRecorderFallbackEnabled = false,
} = {}) {
  const byId = createBaseDom();
  const localStorageMap = new Map();
  const intervalCalls = [];
  const rafQueue = [];
  const documentRef = {
    documentElement: createMockElement("html"),
    getElementById(id) {
      return byId[id] || null;
    },
    querySelector() {
      return null;
    },
    addEventListener() {},
    createElement(tagName) {
      return createMockElement(tagName);
    },
  };
  const windowRef = {
    localStorage: {
      getItem(key) {
        return localStorageMap.has(key) ? localStorageMap.get(key) : null;
      },
      setItem(key, value) {
        localStorageMap.set(String(key), String(value));
      },
      removeItem(key) {
        localStorageMap.delete(String(key));
      },
    },
    location: { href: "https://example.test/", search: "", pathname: "/", hash: "" },
    history: {
      replaceState() {},
    },
    requestAnimationFrame(callback) {
      rafQueue.push(callback);
      return rafQueue.length;
    },
    addEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    MediaRecorder: mediaRecorderEnabled
      ? class MockMediaRecorder {
          static isTypeSupported() {
            return true;
          }
        }
      : null,
    mozMediaRecorder: mozMediaRecorderEnabled
      ? class MockMozMediaRecorder {
          static isTypeSupported() {
            return true;
          }
        }
      : null,
    SpeechRecognition: speechRecognitionEnabled
      ? class MockSpeechRecognition {}
      : null,
    webkitSpeechRecognition: speechRecognitionEnabled
      ? class MockSpeechRecognition {}
      : null,
    __HM_ENABLE_VOICE_RECORDER_FALLBACK__: voiceRecorderFallbackEnabled,
    document: documentRef,
  };
  const navigatorRef = {
    userAgent,
    languages: ["en-US"],
    language: "en-US",
    mediaDevices: {
      getUserMedia: async () => ({
        getTracks: () => [],
      }),
    },
  };

  return {
    byId,
    intervalCalls,
    env: {
      windowRef,
      documentRef,
      navigatorRef,
      fetchImpl: async () => {
        throw new Error("Unexpected fetch");
      },
      consoleRef: console,
      setIntervalRef(handler) {
        intervalCalls.push(handler);
        return intervalCalls.length;
      },
      clearIntervalRef() {},
      setTimeoutRef: setTimeout,
      clearTimeoutRef: clearTimeout,
    },
  };
}

function createDropdownHarness(values) {
  const trigger = createMockElement("button");
  const list = createMockElement("ul", ["hidden"]);
  for (const value of values) {
    const item = createMockElement("li");
    item.dataset.value = String(value);
    item.setAttribute("role", "option");
    list.appendChild(item);
  }
  return { trigger, list };
}

function createBareApp({
  api = {},
  dom = {},
  state = {},
  constants = {},
  env = {},
} = {}) {
  const app = {
    api: { ...api },
    dom: { ...dom },
    state: {
      isLoading: false,
      isVoiceListening: false,
      mode: "rail",
      busStops: [],
      busLineFilters: [],
      busDestinationFilters: [],
      busFilterOptions: { lines: [], destinations: [] },
      stopFilterPinned: false,
      busStopMemberFilterId: null,
      currentCoords: null,
      currentCoordsTimestampMs: null,
      currentCoordsAccuracyMeters: null,
      latestResponse: null,
      latestLoadToken: 0,
      hasCompletedInitialStopModeLoad: true,
      deferInitialStopContext: false,
      locationGranted: false,
      ...state,
    },
    constants: {
      MODE_RAIL: "rail",
      MODE_TRAM: "tram",
      MODE_METRO: "metro",
      MODE_BUS: "bus",
      RESULT_LIMIT_OPTIONS: [8, 12, 16, 20, 24, 30],
      FETCH_TIMEOUT_MS: 8000,
      VOICE_SILENCE_STOP_MS: 1200,
      VOICE_RECOGNITION_TIMEOUT_MS: 1000,
      VOICE_QUERY_MIN_LENGTH: 3,
      ...constants,
    },
  };
  return {
    app,
    env: {
      windowRef: {
        location: { href: "https://example.test/", search: "", pathname: "/", hash: "" },
        history: { replaceState() {} },
        addEventListener() {},
        requestAnimationFrame(callback) {
          callback();
          return 1;
        },
        matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
      },
      documentRef: {
        createElement(tagName) {
          return createMockElement(tagName);
        },
        addEventListener() {},
      },
      navigatorRef: {
        languages: ["en-US"],
        language: "en-US",
      },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        async json() {
          return {};
        },
      }),
      consoleRef: console,
      setTimeoutRef: setTimeout,
      clearTimeoutRef: clearTimeout,
      setIntervalRef: setInterval,
      clearIntervalRef: clearInterval,
      ...env,
    },
  };
}

module.exports = {
  createClassList,
  createMockElement,
  createTestEnvironment,
  createDropdownHarness,
  createBareApp,
};
