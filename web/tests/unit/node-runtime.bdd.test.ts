import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

interface PackageManifest {
  engines?: {
    node?: string;
  };
}

interface World {
  engineRange: string;
  manifest: PackageManifest;
}

function readManifest(): PackageManifest {
  return JSON.parse(fs.readFileSync(path.join(webRoot, "package.json"), "utf8")) as PackageManifest;
}

defineFeature<World>(
  test,
  `
Feature: Vercel Node.js runtime

  Scenario: Builds and functions use Node.js 26 LTS
    Given the web package manifest
    When the Node.js engine range is read
    Then the Node.js engine range is "26.x"
  `,
  {
    createWorld: () => ({ engineRange: "", manifest: {} }),
    stepDefinitions: [
      {
        pattern: /^Given the web package manifest$/,
        run: ({ world }) => {
          world.manifest = readManifest();
        },
      },
      {
        pattern: /^When the Node\.js engine range is read$/,
        run: ({ world }) => {
          world.engineRange = world.manifest.engines?.node ?? "";
        },
      },
      {
        pattern: /^Then the Node\.js engine range is "([^"]*)"$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.engineRange, args[0]);
        },
      },
    ],
  }
);
