import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const relativeImportPattern = /from\s+"(\.{1,2}\/[^"]+)"/g;

interface PackageMetadata {
  type?: string;
}

interface World {
  packageType: string;
  packages: Map<string, PackageMetadata>;
  sourceFiles: string[];
  specifiers: string[];
}

function readPackage(scope: string): PackageMetadata {
  const packagePath = path.join(webRoot, scope, "package.json");
  return JSON.parse(fs.readFileSync(packagePath, "utf8")) as PackageMetadata;
}

function collectTypeScriptFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTypeScriptFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }
  return files;
}

function collectRelativeImports(source: string): string[] {
  return [...source.matchAll(relativeImportPattern)].map((match) => match[1]);
}

defineFeature<World>(
  test,
  `
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
  `,
  {
    createWorld: () => ({
      packageType: "",
      packages: new Map(),
      sourceFiles: [],
      specifiers: [],
    }),
    stepDefinitions: [
      {
        pattern: /^Given the Vercel runtime package metadata$/,
        run: ({ world }) => {
          world.packages.set("api", readPackage("api"));
          world.packages.set("src", readPackage("src"));
        },
      },
      {
        pattern: /^When the package type is read for "([^"]*)"$/,
        run: ({ args, world }) => {
          world.packageType = world.packages.get(args[0])?.type ?? "";
        },
      },
      {
        pattern: /^Then the package type equals "([^"]*)"$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.packageType, args[0]);
        },
      },
      {
        pattern: /^Given the server runtime source files$/,
        run: ({ world }) => {
          world.sourceFiles = [
            ...collectTypeScriptFiles(path.join(webRoot, "api")),
            ...collectTypeScriptFiles(path.join(webRoot, "src/server")),
            ...collectTypeScriptFiles(path.join(webRoot, "src/shared")),
          ];
        },
      },
      {
        pattern: /^When the relative import specifiers are collected$/,
        run: ({ world }) => {
          world.specifiers = world.sourceFiles.flatMap((filePath) =>
            collectRelativeImports(fs.readFileSync(filePath, "utf8"))
          );
        },
      },
      {
        pattern: /^Then every relative import specifier ends with "([^"]*)"$/,
        run: ({ args, assert, world }) => {
          const offenders = world.specifiers.filter((specifier) => !specifier.endsWith(args[0]));
          assert.equal(offenders.join(","), "");
        },
      },
    ],
  }
);
