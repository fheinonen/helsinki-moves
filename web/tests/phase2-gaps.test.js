const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");
const { createBareApp } = require("./helpers/frontend-app");
const { registerUiModule } = require("../scripts/app/02-ui");

const featureText = `
Feature: Phase 2 component gaps

Scenario: departureRowClass returns departure-now for under 3 minutes
  Given a departure 2 minutes from now
  When departureRowClass is called
  Then the row class equals "departure-now"

Scenario: departureRowClass returns departure-soon for 3 to 10 minutes
  Given a departure 7 minutes from now
  When departureRowClass is called
  Then the row class equals "departure-soon"

Scenario: departureRowClass returns departure-soon at exactly 10 minutes
  Given a departure 10 minutes from now
  When departureRowClass is called
  Then the row class equals "departure-soon"

Scenario: departureRowClass returns departure-later for over 10 minutes
  Given a departure 11 minutes from now
  When departureRowClass is called
  Then the row class equals "departure-later"

Scenario: departureRowClass boundary at exactly 3 minutes returns departure-soon
  Given a departure 3 minutes from now
  When departureRowClass is called
  Then the row class equals "departure-soon"

Scenario: updateNextSummary assigns next-summary-now class for under 3 minutes
  Given a next departure 2 minutes from now with summary DOM
  When updateNextSummary is called
  Then the next summary element has class "next-summary-now"

Scenario: updateNextSummary assigns next-summary-soon class for 3 to 10 minutes
  Given a next departure 7 minutes from now with summary DOM
  When updateNextSummary is called
  Then the next summary element has class "next-summary-soon"

Scenario: updateNextSummary assigns next-summary-later class for over 10 minutes
  Given a next departure 12 minutes from now with summary DOM
  When updateNextSummary is called
  Then the next summary element has class "next-summary-later"

Scenario: Light theme defines skeleton tokens
  Given the light theme stylesheet
  When skeleton tokens are inspected
  Then the stylesheet contains a --skeleton-base override
  And the stylesheet contains a --skeleton-shine override

Scenario: Light theme list item backgrounds are scoped to departures
  Given the light theme stylesheet
  When light theme list item background overrides are inspected
  Then the stylesheet does not define a global light-theme list item background
  And the stylesheet scopes light-theme list item background to departure rows

Scenario: Results limit uses custom dropdown instead of native select
  Given the app shell markup
  When the results limit control is inspected
  Then no native select element exists for results limit
  And a combobox trigger exists for results limit
`;

function bootUiApi() {
  const { app, env } = createBareApp({
    api: {
      uniqueNonEmptyStrings: (arr) => [...new Set(arr.filter((v) => v && String(v).trim()))],
      getActiveResultsLimit: () => 8,
    },
    constants: {
      RESULT_LIMIT_OPTIONS: [8, 12, 16],
    },
  });
  registerUiModule(app, env);
  return { api: app.api, dom: app.dom };
}

function makeFutureIso(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60000 + 30000).toISOString();
}

function createMockDom() {
  const classes = new Set();
  return {
    nextSummaryEl: {
      classList: {
        add: (c) => classes.add(c),
        remove: (...cs) => cs.forEach((c) => classes.delete(c)),
        toggle: (c, force) => (force ? classes.add(c) : classes.delete(c)),
        contains: (c) => classes.has(c),
      },
      _classes: classes,
    },
    nextMinsEl: { textContent: "" },
    nextLineEl: {
      textContent: "",
      classList: { toggle: () => {} },
    },
    nextTrackEl: { textContent: "" },
    nextDestinationEl: { textContent: "" },
    nextLabelEl: { textContent: "" },
  };
}

defineFeature(test, featureText, {
  createWorld: () => ({
    iso: null,
    rowClass: null,
    css: "",
    html: "",
    summaryClasses: null,
    skeletonTokens: null,
    lightThemeListItemRules: null,
    resultsLimitControl: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given a departure (\d+) minutes from now$/,
      run: ({ args, world }) => {
        world.iso = makeFutureIso(Number(args[0]));
      },
    },
    {
      pattern: /^When departureRowClass is called$/,
      run: ({ world }) => {
        const { api } = bootUiApi();
        world.rowClass = api.departureRowClass(world.iso);
      },
    },
    {
      pattern: /^Then the row class equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.rowClass, args[0]);
      },
    },
    {
      pattern: /^Given a next departure (\d+) minutes from now with summary DOM$/,
      run: ({ args, world }) => {
        world.iso = makeFutureIso(Number(args[0]));
        world.mockDom = createMockDom();
      },
    },
    {
      pattern: /^When updateNextSummary is called$/,
      run: ({ world }) => {
        const { app, env } = createBareApp({
          api: {
            uniqueNonEmptyStrings: (arr) => [...new Set(arr.filter((v) => v && String(v).trim()))],
            getActiveResultsLimit: () => 8,
          },
          dom: world.mockDom,
          constants: {
            RESULT_LIMIT_OPTIONS: [8, 12, 16],
          },
        });
        registerUiModule(app, env);

        app.api.updateNextSummary({
          departureIso: world.iso,
          line: "A",
          destination: "Helsinki",
          track: "1",
        });

        world.summaryClasses = world.mockDom.nextSummaryEl._classes;
      },
    },
    {
      pattern: /^Then the next summary element has class "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.ok(
          world.summaryClasses.has(args[0]),
          `Expected class "${args[0]}" but found: ${[...world.summaryClasses].join(", ")}`
        );
      },
    },
    {
      pattern: /^Given the light theme stylesheet$/,
      run: ({ world }) => {
        world.css = fs.readFileSync(path.resolve(__dirname, "../styles/theme-light.css"), "utf8");
      },
    },
    {
      pattern: /^When skeleton tokens are inspected$/,
      run: ({ world }) => {
        world.skeletonTokens = {
          hasBase: /--skeleton-base:/.test(world.css),
          hasShine: /--skeleton-shine:/.test(world.css),
        };
      },
    },
    {
      pattern: /^Then the stylesheet contains a --skeleton-base override$/,
      run: ({ assert, world }) => {
        assert.equal(world.skeletonTokens?.hasBase, true);
      },
    },
    {
      pattern: /^Then the stylesheet contains a --skeleton-shine override$/,
      run: ({ assert, world }) => {
        assert.equal(world.skeletonTokens?.hasShine, true);
      },
    },
    {
      pattern: /^When light theme list item background overrides are inspected$/,
      run: ({ world }) => {
        world.lightThemeListItemRules = {
          hasGlobalListRule: /\[data-theme="light"\]\s+li\s*\{/.test(world.css),
          hasDepartureListRule: /\[data-theme="light"\]\s+#departures\s*>\s*li\s*\{/.test(
            world.css
          ),
        };
      },
    },
    {
      pattern: /^Then the stylesheet does not define a global light-theme list item background$/,
      run: ({ assert, world }) => {
        assert.equal(world.lightThemeListItemRules?.hasGlobalListRule, false);
      },
    },
    {
      pattern: /^Then the stylesheet scopes light-theme list item background to departure rows$/,
      run: ({ assert, world }) => {
        assert.equal(world.lightThemeListItemRules?.hasDepartureListRule, true);
      },
    },
    {
      pattern: /^Given the app shell markup$/,
      run: ({ world }) => {
        world.html = fs.readFileSync(path.resolve(__dirname, "../index.html"), "utf8");
      },
    },
    {
      pattern: /^When the results limit control is inspected$/,
      run: ({ world }) => {
        world.resultsLimitControl = {
          hasNativeSelect: /<select[^>]*id="resultsLimitSelect"/.test(world.html),
          hasCombobox: /id="resultsLimitSelect"[^>]*role="combobox"/.test(world.html),
        };
      },
    },
    {
      pattern: /^Then no native select element exists for results limit$/,
      run: ({ assert, world }) => {
        assert.equal(world.resultsLimitControl?.hasNativeSelect, false);
      },
    },
    {
      pattern: /^Then a combobox trigger exists for results limit$/,
      run: ({ assert, world }) => {
        assert.equal(world.resultsLimitControl?.hasCombobox, true);
      },
    },
  ],
});
