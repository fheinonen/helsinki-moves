import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

interface HeaderEntry {
  headers?: Array<{ key?: string; value?: string }>;
}

interface World {
  directives: Map<string, string[]>;
  policy: string;
}

function readContentSecurityPolicy(): string {
  const configPath = path.join(webRoot, "vercel.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as { headers?: HeaderEntry[] };
  const policyHeader = (config.headers ?? [])
    .flatMap((entry) => entry.headers ?? [])
    .find((header) => String(header.key ?? "").toLowerCase() === "content-security-policy");
  return String(policyHeader?.value ?? "");
}

function parseDirectives(policy: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const directive of policy.split(";")) {
    const trimmed = directive.trim();
    if (!trimmed) {
      continue;
    }
    const [name, ...values] = trimmed.split(/\s+/);
    directives.set(name, values);
  }
  return directives;
}

defineFeature<World>(
  test,
  `
Feature: App Content Security Policy

  Scenario: App CSP keeps scripts same-origin and network calls same-origin
    Given the Vercel header configuration
    When the Content Security Policy is inspected
    Then script-src allows "'self'"
    And connect-src allows "'self'"
  `,
  {
    createWorld: () => ({ directives: new Map(), policy: "" }),
    stepDefinitions: [
      {
        pattern: /^Given the Vercel header configuration$/,
        run: ({ world }) => {
          world.policy = readContentSecurityPolicy();
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
        run: ({ args, assert, world }) => {
          const [directiveName, value] = args;
          assert.equal(world.directives.get(directiveName)?.includes(value), true);
        },
      },
    ],
  }
);
