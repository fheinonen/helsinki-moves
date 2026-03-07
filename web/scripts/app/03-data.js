(function initDataWrapper(runtimeGlobal) {
  const dataModule =
    typeof require === "function" ? require("./data-module") : null;

  if (dataModule?.registerDataModule && runtimeGlobal?.window?.HMApp) {
    dataModule.registerDataModule(runtimeGlobal.window.HMApp, {
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
    module.exports = dataModule;
  }
})(typeof globalThis === "undefined" ? this : globalThis);
