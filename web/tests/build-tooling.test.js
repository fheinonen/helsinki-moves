const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const { defineFeature } = require("./helpers/bdd");

const featureText = `
Feature: Cross-platform frontend build tooling

Scenario: Tailwind asset build prepares a Windows-safe CLI invocation
  Given the frontend build script module
  When the Tailwind CLI invocation is prepared for platform "win32"
  Then the Tailwind executable is the current Node binary
  And the Tailwind CLI module path ends with "@tailwindcss/cli/dist/index.mjs"
  And the Tailwind CLI arguments equal "-i styles/main.css -o dist/.tailwind-intermediate.css"

Scenario: Playwright browser projects cover the CI matrix
  Given the Playwright configuration
  When the browser projects are listed
  Then project "chromium" exists
  And project "firefox" exists
  And project "webkit" exists
`;

async function loadBuildAssetsModule() {
  const moduleUrl = pathToFileURL(path.resolve(__dirname, "../tools/build-assets.mjs"));
  return import(moduleUrl.href);
}

function loadPlaywrightConfig() {
  return require(path.resolve(__dirname, "../playwright.config.cjs"));
}

defineFeature(test, featureText, {
  createWorld: () => ({
    buildAssetsModule: null,
    tailwindInvocation: null,
    playwrightConfig: null,
    projectNames: [],
  }),
  stepDefinitions: [
    {
      pattern: /^Given the frontend build script module$/,
      run: async ({ world }) => {
        world.buildAssetsModule = await loadBuildAssetsModule();
      },
    },
    {
      pattern: /^When the Tailwind CLI invocation is prepared for platform "([^"]*)"$/,
      run: ({ args, world }) => {
        world.tailwindInvocation = world.buildAssetsModule.getTailwindCliInvocation(args[0]);
      },
    },
    {
      pattern: /^Then the Tailwind executable is the current Node binary$/,
      run: ({ assert, world }) => {
        assert.equal(world.tailwindInvocation.command, process.execPath);
      },
    },
    {
      pattern: /^Then the Tailwind CLI module path ends with "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.tailwindInvocation.args[0].endsWith(args[0]), true);
      },
    },
    {
      pattern: /^Then the Tailwind CLI arguments equal "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.tailwindInvocation.args.slice(1).join(" "), args[0]);
      },
    },
    {
      pattern: /^Given the Playwright configuration$/,
      run: ({ world }) => {
        world.playwrightConfig = loadPlaywrightConfig();
      },
    },
    {
      pattern: /^When the browser projects are listed$/,
      run: ({ world }) => {
        world.projectNames = (world.playwrightConfig.projects || []).map((project) => project.name);
      },
    },
    {
      pattern: /^Then project "([^"]*)" exists$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.projectNames.includes(args[0]), true);
      },
    },
  ],
});
