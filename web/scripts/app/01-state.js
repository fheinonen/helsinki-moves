(function initStateWrapper(runtimeGlobal) {
  const stateModule =
    typeof require === "function" ? require("./state-module") : null;

  if (stateModule?.registerStateModule && runtimeGlobal?.window) {
    runtimeGlobal.window.HMApp ||= {};
    stateModule.registerStateModule(runtimeGlobal.window.HMApp, {
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
    module.exports = stateModule;
  }
})(typeof globalThis === "undefined" ? this : globalThis);
