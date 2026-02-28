const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");

const featureText = `
Feature: Design tokens match PRD target values

Scenario: Spacing tokens match PRD scale
  Given the theme stylesheet
  When spacing tokens are inspected
  Then token --spacing-1 equals "4px"
  And token --spacing-2 equals "8px"
  And token --spacing-3 equals "12px"
  And token --spacing-4 equals "16px"
  And token --spacing-6 equals "24px"
  And token --spacing-8 equals "32px"

Scenario: Typography tokens match PRD scale
  Given the theme stylesheet
  When typography tokens are inspected
  Then token --text-xs equals "0.75rem"
  And token --text-sm equals "0.875rem"
  And token --text-base equals "1rem"
  And token --text-lg equals "1.125rem"
  And token --text-xl equals "1.5rem"
  And token --text-2xl equals "2rem"

Scenario: Motion tokens match PRD
  Given the theme stylesheet
  When motion tokens are inspected
  Then token --ease-out equals "cubic-bezier(0.16, 1, 0.3, 1)"
  And token --duration-fast equals "150ms"
  And token --duration-normal equals "250ms"

Scenario: Surface color token defined
  Given the theme stylesheet
  When surface tokens are inspected
  Then token --color-surface-2 equals "oklch(0.20 0.027 257)"
`;

function extractTokenValue(css, tokenName) {
  const escaped = tokenName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`${escaped}:\\s*([^;]+);`);
  const match = css.match(regex);
  return match ? match[1].trim() : null;
}

defineFeature(test, featureText, {
  createWorld: () => ({
    css: "",
    inspectTokens: null,
  }),
  stepDefinitions: [
    {
      pattern: /^Given the theme stylesheet$/,
      run: ({ world }) => {
        const mainCss = fs.readFileSync(path.resolve(__dirname, "../styles/main.css"), "utf8");
        const componentCss = fs.readFileSync(path.resolve(__dirname, "../styles/component-tokens.css"), "utf8");
        world.css = mainCss + "\n" + componentCss;
      },
    },
    {
      pattern: /^When (?:spacing|typography|motion|surface) tokens are inspected$/,
      run: ({ world }) => {
        world.inspectTokens = (tokenName) => extractTokenValue(world.css, tokenName);
      },
    },
    {
      pattern: /^Then token (--[\w-]+) equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const value = world.inspectTokens(args[0]);
        assert.ok(value !== null, `Expected token ${args[0]} to exist`);
        assert.equal(value, args[1]);
      },
    },
  ],
});
