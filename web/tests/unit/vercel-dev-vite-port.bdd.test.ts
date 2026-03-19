import { afterEach, test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  resolveViteDevRuntimeEnv,
  resolveViteDevServerConfig,
} from "@shared/config/vite-dev-server";

interface LoadedConfig {
  preview?: {
    host?: string;
    port?: number;
    strictPort?: boolean;
  };
  server?: {
    host?: string;
    port?: number;
    strictPort?: boolean;
  };
}

interface World {
  config?: LoadedConfig;
  env?: NodeJS.ProcessEnv;
  runtimeEnv?: NodeJS.ProcessEnv;
}

afterEach(() => {
  delete process.env.PORT;
});

defineFeature<World>(
  test,
  `
Feature: Vercel dev frontend port selection

  Scenario: Vite uses the port assigned by Vercel dev
    Given Vercel assigns frontend port 37627
    When the Vite config is loaded
    Then the Vite dev server uses port 37627

  Scenario: Vite falls back to the local default port
    Given Vercel does not assign a frontend port
    When the Vite config is loaded
    Then the Vite dev server uses port 4173

  Scenario: Loaded env values are merged into the dev runtime
    Given the local env provides DIGITRANSIT_API_KEY abc123
    When the Vite dev runtime env is resolved
    Then the Vite runtime env DIGITRANSIT_API_KEY is abc123
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given Vercel assigns frontend port (\d+)$/,
        run: ({ args, world }) => {
          world.env = {
            PORT: args[0],
          };
        },
      },
      {
        pattern: /^Given Vercel does not assign a frontend port$/,
        run: ({ world }) => {
          world.env = {};
        },
      },
      {
        pattern: /^When the Vite config is loaded$/,
        run: ({ world }) => {
          world.config = {
            server: resolveViteDevServerConfig(world.env),
          };
        },
      },
      {
        pattern: /^Given the local env provides DIGITRANSIT_API_KEY (.+)$/,
        run: ({ args, world }) => {
          world.env = {
            HOST: "127.0.0.1",
          };
          world.runtimeEnv = resolveViteDevRuntimeEnv(world.env, {
            DIGITRANSIT_API_KEY: args[0],
          });
        },
      },
      {
        pattern: /^When the Vite dev runtime env is resolved$/,
        run: () => {},
      },
      {
        pattern: /^Then the Vite dev server uses port (\d+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.config?.server?.port, Number(args[0]));
        },
      },
      {
        pattern: /^Then the Vite runtime env DIGITRANSIT_API_KEY is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.runtimeEnv?.DIGITRANSIT_API_KEY, args[0]);
        },
      },
    ],
  }
);
