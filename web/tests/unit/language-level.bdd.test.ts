import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

interface CompilerOptionsFile {
  compilerOptions?: {
    lib?: string[] | string;
    target?: string;
  };
}

interface LanguageLevel {
  libs: string;
  target: string;
}

interface PackageManifest {
  scripts?: Record<string, string>;
}

type RuntimeName = "client" | "server" | "test";

interface World {
  files: Partial<Record<RuntimeName, CompilerOptionsFile>>;
  levels: Partial<Record<RuntimeName, LanguageLevel>>;
  scripts: Record<string, string>;
  syntaxCheckScript: string;
  typecheckScript: string;
  viteSource: string;
  viteTarget: string;
}

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(webRoot, relativePath), "utf8");
}

function readCompilerFile(relativePath: string): CompilerOptionsFile {
  return JSON.parse(readText(relativePath)) as CompilerOptionsFile;
}

function libsOf(file: CompilerOptionsFile): string {
  const lib = file.compilerOptions?.lib;
  if (Array.isArray(lib)) {
    return lib.join(",");
  }
  return typeof lib === "string" ? lib : "";
}

function levelOf(file: CompilerOptionsFile | undefined): LanguageLevel {
  return {
    libs: file ? libsOf(file) : "",
    target: file?.compilerOptions?.target ?? "",
  };
}

function readViteClientBuildTarget(source: string): string {
  return source.match(/\btarget:\s*"([^"]+)"/)?.[1] ?? "";
}

defineFeature<World>(
  test,
  `
Feature: JavaScript language level

  Scenario: Node compiles server code as ES2025
    Given the server TypeScript config
    When the server language target and libraries are read
    Then the server language target is "ES2025"
    And the server language libraries are "ES2025"

  Scenario: The browser bundle stays on ES2022
    Given the client TypeScript config
    And the Vite config
    When the client language target and libraries are read
    And the Vite client build target is read
    Then the client language target is "ES2022"
    And the client language libraries are "ES2022,DOM,DOM.Iterable"
    And the Vite client build target is "es2022"

  Scenario: Node compiles unit tests as ES2025
    Given the test TypeScript config
    When the test language target and libraries are read
    Then the test language target is "ES2025"
    And the test language libraries are "ES2025,DOM,DOM.Iterable"

  Scenario: Typecheck covers each runtime language level
    Given the web package scripts
    When the typecheck script is read
    Then the typecheck script is "tsc --noEmit --pretty false -p tsconfig.json && tsc --noEmit --pretty false -p tsconfig.server.json && tsc --noEmit --pretty false -p tsconfig.tests.json"
    When the syntax check script is read
    Then the syntax check script is "npm run typecheck"
  `,
  {
    createWorld: () => ({
      files: {},
      levels: {},
      scripts: {},
      syntaxCheckScript: "",
      typecheckScript: "",
      viteSource: "",
      viteTarget: "",
    }),
    stepDefinitions: [
      {
        pattern: /^Given the server TypeScript config$/,
        run: ({ world }) => {
          world.files.server = readCompilerFile("tsconfig.server.json");
        },
      },
      {
        pattern: /^Given the client TypeScript config$/,
        run: ({ world }) => {
          world.files.client = readCompilerFile("tsconfig.json");
        },
      },
      {
        pattern: /^Given the Vite config$/,
        run: ({ world }) => {
          world.viteSource = readText("vite.config.ts");
        },
      },
      {
        pattern: /^Given the test TypeScript config$/,
        run: ({ world }) => {
          world.files.test = readCompilerFile("tsconfig.tests.json");
        },
      },
      {
        pattern: /^Given the web package scripts$/,
        run: ({ world }) => {
          const manifest = JSON.parse(readText("package.json")) as PackageManifest;
          world.scripts = manifest.scripts ?? {};
        },
      },
      {
        pattern: /^When the server language target and libraries are read$/,
        run: ({ world }) => {
          world.levels.server = levelOf(world.files.server);
        },
      },
      {
        pattern: /^When the client language target and libraries are read$/,
        run: ({ world }) => {
          world.levels.client = levelOf(world.files.client);
        },
      },
      {
        pattern: /^When the Vite client build target is read$/,
        run: ({ world }) => {
          world.viteTarget = readViteClientBuildTarget(world.viteSource);
        },
      },
      {
        pattern: /^When the test language target and libraries are read$/,
        run: ({ world }) => {
          world.levels.test = levelOf(world.files.test);
        },
      },
      {
        pattern: /^When the typecheck script is read$/,
        run: ({ world }) => {
          world.typecheckScript = world.scripts.typecheck ?? "";
        },
      },
      {
        pattern: /^When the syntax check script is read$/,
        run: ({ world }) => {
          world.syntaxCheckScript = world.scripts["check:syntax"] ?? "";
        },
      },
      {
        pattern: /^Then the server language target is "([^"]*)"$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.levels.server?.target, args[0]);
        },
      },
      {
        pattern: /^Then the server language libraries are "([^"]*)"$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.levels.server?.libs, args[0]);
        },
      },
      {
        pattern: /^Then the client language target is "([^"]*)"$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.levels.client?.target, args[0]);
        },
      },
      {
        pattern: /^Then the client language libraries are "([^"]*)"$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.levels.client?.libs, args[0]);
        },
      },
      {
        pattern: /^Then the Vite client build target is "([^"]*)"$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.viteTarget, args[0]);
        },
      },
      {
        pattern: /^Then the test language target is "([^"]*)"$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.levels.test?.target, args[0]);
        },
      },
      {
        pattern: /^Then the test language libraries are "([^"]*)"$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.levels.test?.libs, args[0]);
        },
      },
      {
        pattern: /^Then the typecheck script is "([^"]*)"$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.typecheckScript, args[0]);
        },
      },
      {
        pattern: /^Then the syntax check script is "([^"]*)"$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.syntaxCheckScript, args[0]);
        },
      },
    ],
  }
);
