(function initUiWrapper(runtimeGlobal) {
  const uiModule =
    typeof require === "function" ? require("./ui-module") : null;

  if (uiModule?.registerUiModule && runtimeGlobal?.window?.HMApp) {
    uiModule.registerUiModule(runtimeGlobal.window.HMApp, {
      windowRef: runtimeGlobal.window,
      documentRef: runtimeGlobal.document || runtimeGlobal.window.document,
      navigatorRef: runtimeGlobal.navigator,
      fetchImpl: runtimeGlobal.fetch,
      consoleRef: runtimeGlobal.console,
      setIntervalRef: runtimeGlobal.setInterval,
      clearIntervalRef: runtimeGlobal.clearInterval,
      setTimeoutRef: runtimeGlobal.setTimeout,
      clearTimeoutRef: runtimeGlobal.clearTimeout,
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = uiModule;
  }
})(typeof globalThis === "undefined" ? this : globalThis);
