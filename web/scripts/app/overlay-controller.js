function parseNumber(value, { min, max, fallback }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseBool(value, fallback = false) {
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return fallback;
}

function isEditableTarget(target) {
  if (typeof Element !== "function") return false;
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  if (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT") {
    return true;
  }
  return Boolean(element.closest("[contenteditable='true']"));
}

function registerOverlayController(app, env = {}) {
  const runtimeGlobal = typeof globalThis === "undefined" ? {} : globalThis;
  const windowRef = env.windowRef || runtimeGlobal.window || {};
  const documentRef = env.documentRef || windowRef.document || {};
  const { api } = app;
  const layerEl = documentRef.getElementById?.("mockOverlayLayer");
  const imageEl = documentRef.getElementById?.("mockOverlayImage");
  const controlsEl = documentRef.getElementById?.("mockOverlayControls");
  const urlInputEl = documentRef.getElementById?.("mockOverlayUrlInput");
  const opacityInputEl = documentRef.getElementById?.("mockOverlayOpacityInput");
  const offsetXInputEl = documentRef.getElementById?.("mockOverlayOffsetXInput");
  const offsetYInputEl = documentRef.getElementById?.("mockOverlayOffsetYInput");
  const scaleInputEl = documentRef.getElementById?.("mockOverlayScaleInput");
  const toggleBtnEl = documentRef.getElementById?.("mockOverlayToggleBtn");
  const resetBtnEl = documentRef.getElementById?.("mockOverlayResetBtn");

  if (
    !layerEl ||
    !imageEl ||
    !controlsEl ||
    !urlInputEl ||
    !opacityInputEl ||
    !offsetXInputEl ||
    !offsetYInputEl ||
    !scaleInputEl ||
    !toggleBtnEl ||
    !resetBtnEl
  ) {
    return app;
  }

  const storageKeys = {
    url: "dev:overlay:url",
    opacity: "dev:overlay:opacity",
    offsetX: "dev:overlay:offsetX",
    offsetY: "dev:overlay:offsetY",
    scale: "dev:overlay:scale",
    visible: "dev:overlay:visible",
    panelVisible: "dev:overlay:panelVisible",
  };
  const searchParams = new URLSearchParams(windowRef.location?.search || "");
  const queryOverlayEnabled = searchParams.get("overlay") === "1";
  const state = {
    url: "",
    opacity: 45,
    offsetX: 0,
    offsetY: 0,
    scale: 100,
    visible: false,
    panelVisible: false,
  };

  function setInputValues() {
    urlInputEl.value = state.url;
    opacityInputEl.value = String(state.opacity);
    offsetXInputEl.value = String(state.offsetX);
    offsetYInputEl.value = String(state.offsetY);
    scaleInputEl.value = String(state.scale);
  }

  function persist() {
    api.setStorageItem(storageKeys.url, state.url);
    api.setStorageItem(storageKeys.opacity, String(state.opacity));
    api.setStorageItem(storageKeys.offsetX, String(state.offsetX));
    api.setStorageItem(storageKeys.offsetY, String(state.offsetY));
    api.setStorageItem(storageKeys.scale, String(state.scale));
    api.setStorageItem(storageKeys.visible, state.visible ? "1" : "0");
    api.setStorageItem(storageKeys.panelVisible, state.panelVisible ? "1" : "0");
  }

  function apply() {
    const hasSource = state.url.length > 0;
    const showOverlay = hasSource && state.visible;
    controlsEl.classList.toggle("hidden", !state.panelVisible);
    layerEl.classList.toggle("hidden", !showOverlay);
    layerEl.setAttribute("aria-hidden", String(!showOverlay));
    toggleBtnEl.textContent = showOverlay ? "Overlay: On" : "Overlay: Off";
    toggleBtnEl.setAttribute("aria-pressed", String(showOverlay));
    if (hasSource) {
      if (imageEl.getAttribute("src") !== state.url) {
        imageEl.setAttribute("src", state.url);
      }
    } else {
      imageEl.removeAttribute("src");
    }
    imageEl.style.opacity = String(state.opacity / 100);
    imageEl.style.transform = `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.scale / 100})`;
    setInputValues();
  }

  function updateStateAndApply(updates) {
    Object.assign(state, updates);
    persist();
    apply();
  }

  state.url = String(api.getStorageItem(storageKeys.url) || "").trim();
  state.opacity = parseNumber(api.getStorageItem(storageKeys.opacity), { min: 0, max: 100, fallback: 45 });
  state.offsetX = parseNumber(api.getStorageItem(storageKeys.offsetX), { min: -2000, max: 2000, fallback: 0 });
  state.offsetY = parseNumber(api.getStorageItem(storageKeys.offsetY), { min: -2000, max: 2000, fallback: 0 });
  state.scale = parseNumber(api.getStorageItem(storageKeys.scale), { min: 50, max: 200, fallback: 100 });
  state.visible = parseBool(api.getStorageItem(storageKeys.visible), false);
  state.panelVisible = parseBool(api.getStorageItem(storageKeys.panelVisible), false);
  if (searchParams.has("overlayUrl")) state.url = String(searchParams.get("overlayUrl") || "").trim();
  if (searchParams.has("overlayOpacity")) {
    state.opacity = parseNumber(searchParams.get("overlayOpacity"), { min: 0, max: 100, fallback: state.opacity });
  }
  if (searchParams.has("overlayOffsetX")) {
    state.offsetX = parseNumber(searchParams.get("overlayOffsetX"), { min: -2000, max: 2000, fallback: state.offsetX });
  }
  if (searchParams.has("overlayOffsetY")) {
    state.offsetY = parseNumber(searchParams.get("overlayOffsetY"), { min: -2000, max: 2000, fallback: state.offsetY });
  }
  if (searchParams.has("overlayScale")) {
    state.scale = parseNumber(searchParams.get("overlayScale"), { min: 50, max: 200, fallback: state.scale });
  }
  if (searchParams.has("overlayVisible")) {
    state.visible = parseBool(searchParams.get("overlayVisible"), state.visible);
  }
  if (queryOverlayEnabled) {
    state.panelVisible = true;
    if (!searchParams.has("overlayVisible")) {
      state.visible = true;
    }
  }

  apply();
  urlInputEl.addEventListener("input", () => {
    const nextUrl = String(urlInputEl.value || "").trim();
    updateStateAndApply({ url: nextUrl, visible: nextUrl.length > 0 ? true : state.visible });
  });
  opacityInputEl.addEventListener("input", () => {
    updateStateAndApply({ opacity: parseNumber(opacityInputEl.value, { min: 0, max: 100, fallback: state.opacity }) });
  });
  offsetXInputEl.addEventListener("input", () => {
    updateStateAndApply({ offsetX: parseNumber(offsetXInputEl.value, { min: -2000, max: 2000, fallback: state.offsetX }) });
  });
  offsetYInputEl.addEventListener("input", () => {
    updateStateAndApply({ offsetY: parseNumber(offsetYInputEl.value, { min: -2000, max: 2000, fallback: state.offsetY }) });
  });
  scaleInputEl.addEventListener("input", () => {
    updateStateAndApply({ scale: parseNumber(scaleInputEl.value, { min: 50, max: 200, fallback: state.scale }) });
  });
  toggleBtnEl.addEventListener("click", () => updateStateAndApply({ visible: !state.visible }));
  resetBtnEl.addEventListener("click", () => updateStateAndApply({ opacity: 45, offsetX: 0, offsetY: 0, scale: 100 }));
  documentRef.addEventListener?.("keydown", (event) => {
    if (isEditableTarget(event.target)) return;
    if (String(event.key || "").toLowerCase() !== "o") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    if (event.shiftKey) {
      updateStateAndApply({ panelVisible: !state.panelVisible });
      return;
    }
    updateStateAndApply({ visible: !state.visible });
  });

  return app;
}

module.exports = {
  registerOverlayController,
};
