(function initAppWrapper(runtimeGlobal) {
  const initModule =
    typeof require === "function" ? require("./init-module") : null;

  if (initModule?.registerInitModule && runtimeGlobal?.window?.HMApp) {
    initModule.registerInitModule(runtimeGlobal.window.HMApp, {
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
    runtimeGlobal.window.HMApp.initialize?.();
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = initModule;
  }
})(typeof globalThis === "undefined" ? this : globalThis);
