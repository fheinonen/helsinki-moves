const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");

const featureText = `
Feature: App Content Security Policy

Scenario: App CSP keeps scripts same-origin and network calls same-origin
  Given the Vercel header configuration
  When the Content Security Policy is inspected
  Then script-src allows "'self'"
  And connect-src allows "'self'"
`;

function getContentSecurityPolicy() {
  const configPath = path.resolve(__dirname, "../vercel.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const policyHeader = (config.headers || [])
    .flatMap((entry) => entry.headers || [])
    .find((header) => String(header?.key || "").toLowerCase() === "content-security-policy");
  return String(policyHeader?.value || "");
}

function parseDirectives(policy) {
  return String(policy || "")
    .split(";")
    .map((directive) => directive.trim())
    .filter(Boolean)
    .reduce((accumulator, directive) => {
      const [name, ...values] = directive.split(/\s+/);
      accumulator.set(String(name || "").trim(), values);
      return accumulator;
    }, new Map());
}

defineFeature(test, featureText, {
  createWorld: () => ({
    policy: "",
    directives: new Map(),
  }),
  stepDefinitions: [
    {
      pattern: /^Given the Vercel header configuration$/,
      run: ({ world }) => {
        world.policy = getContentSecurityPolicy();
      },
    },
    {
      pattern: /^When the Content Security Policy is inspected$/,
      run: ({ world }) => {
        world.directives = parseDirectives(world.policy);
      },
    },
    {
      pattern: /^Then (script-src|connect-src) allows "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        const directiveName = args[0];
        const value = args[1];
        assert.equal(world.directives.get(directiveName)?.includes(value), true);
      },
    },
  ],
});
