const { registerBootstrapController } = require("./bootstrap-controller");
const { registerThemeController } = require("./theme-controller");
const { registerOverlayController } = require("./overlay-controller");

function registerInitModule(app, env = {}) {
  registerBootstrapController(app, env);
  const baseInitialize = app.initialize || (() => app);
  app.initialize = () => {
    baseInitialize();
    registerThemeController(app, env);
    registerOverlayController(app, env);
    return app;
  };
  app.api.initialize = app.initialize;
  return app;
}

module.exports = {
  registerInitModule,
};
