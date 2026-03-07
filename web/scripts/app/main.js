const { registerStateModule } = require("./state-module");
const { registerUiModule } = require("./ui-module");
const { registerDataModule } = require("./data-module");
const { registerInitModule } = require("./init-module");

function createApp({ app = {}, env = {} } = {}) {
  registerStateModule(app, env);
  registerUiModule(app, env);
  registerDataModule(app, env);
  registerInitModule(app, env);
  return app;
}

function createBrowserApp() {
  const app = createApp({
    app: {},
    env: {
      windowRef: typeof window === "undefined" ? null : window,
      documentRef: typeof document === "undefined" ? null : document,
      navigatorRef: typeof navigator === "undefined" ? null : navigator,
      fetchImpl: typeof fetch === "undefined" ? null : fetch,
      consoleRef: typeof console === "undefined" ? null : console,
      setIntervalRef: typeof setInterval === "undefined" ? null : setInterval,
      clearIntervalRef: typeof clearInterval === "undefined" ? null : clearInterval,
      setTimeoutRef: typeof setTimeout === "undefined" ? null : setTimeout,
      clearTimeoutRef: typeof clearTimeout === "undefined" ? null : clearTimeout,
    },
  });
  app.initialize?.();
  return app;
}

module.exports = {
  createApp,
  createBrowserApp,
};
