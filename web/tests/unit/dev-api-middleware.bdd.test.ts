import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { app } from "@server/app";
import { createDevApiMiddleware } from "@server/dev-api-middleware";

interface HeaderMap {
  [key: string]: string | string[] | undefined;
}

interface World {
  nextCalls?: number;
  request?: {
    headers: HeaderMap;
    method?: string;
    on: (event: string, handler: (chunk?: Buffer) => void) => void;
    url?: string;
  };
  responseBody?: string;
  responseHeaders?: Record<string, string | number | string[]>;
  responseStatus?: number;
}

function createResponseRecorder(world: World) {
  return {
    body: "",
    ended: false,
    headers: {} as Record<string, string | number | string[]>,
    setHeader(name: string, value: string | number | string[]) {
      this.headers[name.toLowerCase()] = value;
    },
    end(chunk?: string | Buffer) {
      if (chunk) {
        this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
      }
      this.ended = true;
      world.responseBody = this.body;
      world.responseHeaders = this.headers;
    },
    write(chunk: string | Buffer) {
      this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
    },
    writeHead(status: number, headers: Record<string, string | number | string[]>) {
      world.responseStatus = status;
      for (const [name, value] of Object.entries(headers)) {
        this.headers[name.toLowerCase()] = value;
      }
    },
  };
}

defineFeature<World>(
  test,
  `
Feature: Vite dev api middleware

  Scenario: Api requests are executed by the Hono app during local dev
    Given a local dev api request for the health endpoint
    When the vite dev api middleware handles the request
    Then the middleware returns status 200
    And the middleware returns ok true json
    And the middleware does not call the next vite handler

  Scenario: Non-api requests continue through vite
    Given a local dev request for the create page
    When the vite dev api middleware handles the request
    Then the middleware calls the next vite handler once
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a local dev api request for the health endpoint$/,
        run: ({ world }) => {
          world.request = {
            headers: {
              host: "127.0.0.1:4173",
            },
            method: "GET",
            on(event, handler) {
              if (event === "end") {
                handler();
              }
            },
            url: "/api/health",
          };
        },
      },
      {
        pattern: /^Given a local dev request for the create page$/,
        run: ({ world }) => {
          world.request = {
            headers: {
              host: "127.0.0.1:4173",
            },
            method: "GET",
            on() {},
            url: "/create",
          };
        },
      },
      {
        pattern: /^When the vite dev api middleware handles the request$/,
        run: async ({ world }) => {
          if (!world.request) {
            throw new Error("Expected request");
          }
          const middleware = createDevApiMiddleware({
            app,
          });
          const response = createResponseRecorder(world);
          let nextCalls = 0;
          await middleware(
            world.request as never,
            response as never,
            () => {
              nextCalls += 1;
            }
          );
          world.nextCalls = nextCalls;
        },
      },
      {
        pattern: /^Then the middleware returns status (\d+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.responseStatus, Number(args[0]));
        },
      },
      {
        pattern: /^Then the middleware returns ok true json$/,
        run: ({ assert, world }) => {
          assert.equal(world.responseBody, '{"ok":true}');
          assert.equal(
            String(world.responseHeaders?.["content-type"] || "").includes("application/json"),
            true
          );
        },
      },
      {
        pattern: /^Then the middleware does not call the next vite handler$/,
        run: ({ assert, world }) => {
          assert.equal(world.nextCalls, 0);
        },
      },
      {
        pattern: /^Then the middleware calls the next vite handler once$/,
        run: ({ assert, world }) => {
          assert.equal(world.nextCalls, 1);
        },
      },
    ],
  }
);
