const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const { createBareApp } = require("./helpers/frontend-app");
const { registerDataModule } = require("../scripts/app/03-data");

const featureText = `
Feature: Stop selection context stays separate from explicit stop filters

Scenario: Loading a dropdown-selected stop does not recreate a stop filter
  Given a stop-mode app with nearest stop "HSL:NEAR" and selected stop "HSL:ALT"
  And no explicit stop filter is active
  When the stop-mode response confirms selected stop "HSL:ALT"
  Then selected stop id stays "HSL:ALT"
  And explicit stop filter is inactive
  And active member stop filter id equals ""
`;

function createStopResponse(selectedStopId) {
  return {
    selectedStopId,
    stops: [
      {
        id: "HSL:NEAR",
        name: "Nearest Stop",
        code: "N100",
        stopCodes: ["N100"],
        memberStopIds: ["HSL:NEAR"],
        distanceMeters: 80,
      },
      {
        id: "HSL:ALT",
        name: "Alternative Stop",
        code: "A200",
        stopCodes: ["A200"],
        memberStopIds: ["HSL:ALT", "HSL:ALT:2"],
        distanceMeters: 420,
      },
    ],
    station: {
      stopName: "Alternative Stop",
      stopCode: "A200",
      stopCodes: ["A200"],
      departures: [
        {
          line: "550",
          destination: "Kamppi",
          departureIso: new Date(Date.now() + 180000).toISOString(),
          stopId: "HSL:ALT",
          stopCode: "A200",
          stopName: "Alternative Stop",
        },
      ],
    },
  };
}

defineFeature(test, featureText, {
  createWorld: () => ({
    app: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given a stop-mode app with nearest stop "([^"]*)" and selected stop "([^"]*)"$/,
      run: ({ args, world }) => {
        const { app, env } = createBareApp({
          state: {
            mode: "bus",
            busStopId: args[1],
            hasCompletedInitialStopModeLoad: true,
          },
          api: {
            uniqueNonEmptyStrings(items) {
              return [...new Set((Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean))];
            },
            sanitizeStopSelections() {},
          },
        });

        registerDataModule(app, env);
        app.state.busStops = [
          { id: args[0], name: "Nearest Stop", code: "N100", stopCodes: ["N100"], memberStopIds: [args[0]], distanceMeters: 80 },
          { id: args[1], name: "Alternative Stop", code: "A200", stopCodes: ["A200"], memberStopIds: [args[1]], distanceMeters: 420 },
        ];
        world.app = app;
      },
    },
    {
      pattern: /^Given no explicit stop filter is active$/,
      run: ({ world }) => {
        world.app.state.stopFilterPinned = false;
        world.app.state.busStopMemberFilterId = null;
      },
    },
    {
      pattern: /^When the stop-mode response confirms selected stop "([^"]*)"$/,
      run: ({ args, world }) => {
        world.app.api.updateStopModeStateFromResponse(createStopResponse(args[0]));
      },
    },
    {
      pattern: /^Then selected stop id stays "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.app.state.busStopId, args[0]);
      },
    },
    {
      pattern: /^Then explicit stop filter is inactive$/,
      run: ({ assert, world }) => {
        assert.equal(world.app.state.stopFilterPinned, false);
      },
    },
    {
      pattern: /^Then active member stop filter id equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(String(world.app.state.busStopMemberFilterId || ""), args[0]);
      },
    },
  ],
});
