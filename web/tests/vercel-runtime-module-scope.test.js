const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { defineFeature } = require("./helpers/bdd");

const featureText = `
Feature: Vercel runtime module loading

Scenario: Server entrypoints declare ESM package scope
  Given the Vercel runtime package metadata
  When the package type is read for "api"
  Then the package type equals "module"
  When the package type is read for "src"
  Then the package type equals "module"

Scenario: Server runtime imports use explicit JavaScript extensions
  Given the server runtime source files
  When the relative import specifiers are collected
  Then every relative import specifier ends with ".js"
`;

function loadRuntimePackageMetadata() {
  return {
    api: JSON.parse(fs.readFileSync(path.resolve(__dirname, "../api/package.json"), "utf8")),
    src: JSON.parse(fs.readFileSync(path.resolve(__dirname, "../src/package.json"), "utf8")),
  };
}

function collectRuntimeSourceFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRuntimeSourceFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }
  return files;
}

function collectRelativeImportSpecifiers(source) {
  const specifiers = [];
  const pattern = /^\s*(?:import|export)\s.+?from\s+"(\.{1,2}\/[^"]+)"/gm;
  for (const match of source.matchAll(pattern)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

defineFeature(test, featureText, {
  createWorld: () => ({
    runtimePackageMetadata: null,
    packageType: "",
    runtimeSourceFiles: [],
    relativeImportSpecifiers: [],
  }),
  stepDefinitions: [
    {
      pattern: /^Given the Vercel runtime package metadata$/,
      run: ({ world }) => {
        world.runtimePackageMetadata = loadRuntimePackageMetadata();
      },
    },
    {
      pattern: /^When the package type is read for "([^"]*)"$/,
      run: ({ args, world }) => {
        world.packageType = world.runtimePackageMetadata[args[0]]?.type || "";
      },
    },
    {
      pattern: /^Given the server runtime source files$/,
      run: ({ world }) => {
        world.runtimeSourceFiles = [
          ...collectRuntimeSourceFiles(path.resolve(__dirname, "../api")),
          ...collectRuntimeSourceFiles(path.resolve(__dirname, "../src/server")),
          ...collectRuntimeSourceFiles(path.resolve(__dirname, "../src/shared")),
        ];
      },
    },
    {
      pattern: /^When the relative import specifiers are collected$/,
      run: ({ world }) => {
        world.relativeImportSpecifiers = world.runtimeSourceFiles.flatMap((filePath) =>
          collectRelativeImportSpecifiers(fs.readFileSync(filePath, "utf8"))
        );
      },
    },
    {
      pattern: /^Then the package type equals "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.equal(world.packageType, args[0]);
      },
    },
    {
      pattern: /^Then every relative import specifier ends with "([^"]*)"$/,
      run: ({ assert, args, world }) => {
        assert.deepEqual(
          world.relativeImportSpecifiers.filter((specifier) => !specifier.endsWith(args[0])),
          []
        );
      },
    },
  ],
});
