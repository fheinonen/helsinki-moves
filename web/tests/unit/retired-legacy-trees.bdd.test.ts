import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const retiredPaths = new Map<string, string>([
  ["previous browser client", "scripts/app"],
  ["previous stylesheets", "styles"],
  ["previous CommonJS API helpers", "api/lib"],
  ["deleted legacy API handlers", "legacy-api"],
  ["previous asset build script", "tools/build-assets.mjs"],
]);

interface World {
  present: Map<string, boolean>;
}

defineFeature<World>(
  test,
  `
Feature: Retired legacy trees stay out of the web app

  Scenario: The running web app keeps a single client and API implementation
    When retired client and API paths are checked
    Then the previous browser client is absent
    And the previous stylesheets are absent
    And the previous CommonJS API helpers are absent
    And the deleted legacy API handlers are absent
    And the previous asset build script is absent
  `,
  {
    createWorld: () => ({ present: new Map() }),
    stepDefinitions: [
      {
        pattern: /^When retired client and API paths are checked$/,
        run: ({ world }) => {
          for (const [name, relativePath] of retiredPaths) {
            world.present.set(name, fs.existsSync(path.join(webRoot, relativePath)));
          }
        },
      },
      {
        pattern: /^Then the (.+) (?:is|are) absent$/,
        run: ({ args, assert, world }) => {
          const name = args[0];
          assert.equal(world.present.get(name), false);
        },
      },
    ],
  }
);
