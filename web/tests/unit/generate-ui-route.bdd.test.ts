import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createApp } from "@server/app";
import {
  GenerateUiError,
  type GenerateUiService,
} from "@server/services/generate-ui/generate-ui-service";

interface World {
  apiKey?: string;
  body?: Record<string, unknown>;
  generateUiService?: GenerateUiService;
  response?: Response;
}

function createStreamingResponse(text: string): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
    {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
      status: 200,
    }
  );
}

defineFeature<World>(
  test,
  `
Feature: Generate UI route

  Scenario: Missing prompt returns 400
    Given the generate ui route has a successful service
    And the generate ui request body omits the prompt
    And the generate ui request includes an API key
    When the generate ui route handles the request
    Then the generate ui response status is 400
    And the generate ui response error is prompt is required

  Scenario: Missing API key returns 400
    Given the generate ui route has a successful service
    And the generate ui request body includes a prompt
    When the generate ui route handles the request
    Then the generate ui response status is 400
    And the generate ui response error is api key is required

  Scenario: Invalid API key returns 401
    Given the generate ui route has an invalid-api-key service
    And the generate ui request body includes a prompt
    And the generate ui request includes an API key
    When the generate ui route handles the request
    Then the generate ui response status is 401
    And the generate ui response error is Invalid Google API key

  Scenario: Google rate limiting returns 429
    Given the generate ui route has a rate-limited service
    And the generate ui request body includes a prompt
    And the generate ui request includes an API key
    When the generate ui route handles the request
    Then the generate ui response status is 429
    And the generate ui response error is Google rate limit reached

  Scenario: A valid request returns a streaming response
    Given the generate ui route has a successful service
    And the generate ui request body includes a prompt
    And the generate ui request includes an API key
    When the generate ui route handles the request
    Then the generate ui response status is 200
    And the generate ui response content type is text/plain; charset=utf-8
    And the generate ui response body contains {"op":"replace","path":"/elements/board/props/title","value":"Compact Tram Board"}
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the generate ui route has a successful service$/,
        run: ({ world }) => {
          world.generateUiService = {
            async generate() {
              return {
                toTextStreamResponse() {
                  return createStreamingResponse(
                    '{"op":"replace","path":"/elements/board/props/title","value":"Compact Tram Board"}\n'
                  );
                },
              };
            },
          };
        },
      },
      {
        pattern: /^Given the generate ui route has an invalid-api-key service$/,
        run: ({ world }) => {
          world.generateUiService = {
            async generate() {
              throw new GenerateUiError("Invalid Google API key", 401);
            },
          };
        },
      },
      {
        pattern: /^Given the generate ui route has a rate-limited service$/,
        run: ({ world }) => {
          world.generateUiService = {
            async generate() {
              throw new GenerateUiError("Google rate limit reached", 429);
            },
          };
        },
      },
      {
        pattern: /^Given the generate ui request body omits the prompt$/,
        run: ({ world }) => {
          world.body = {};
        },
      },
      {
        pattern: /^Given the generate ui request body includes a prompt$/,
        run: ({ world }) => {
          world.body = {
            prompt: "Build a compact tram board with a stop header.",
          };
        },
      },
      {
        pattern: /^Given the generate ui request includes an API key$/,
        run: ({ world }) => {
          world.apiKey = "sk-ant-test";
        },
      },
      {
        pattern: /^When the generate ui route handles the request$/,
        run: async ({ world }) => {
          const app = createApp({
            generateUiService: world.generateUiService,
          });
          world.response = await app.request("http://localhost/api/v1/generate-ui", {
            method: "POST",
            headers: {
              ...(world.apiKey ? { "x-api-key": world.apiKey } : {}),
              "content-type": "application/json",
            },
            body: JSON.stringify(world.body || {}),
          });
        },
      },
      {
        pattern: /^Then the generate ui response status is (\d+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.response?.status, Number(args[0]));
        },
      },
      {
        pattern: /^Then the generate ui response error is (.+)$/,
        run: async ({ args, assert, world }) => {
          const payload = (await world.response?.json()) as { error?: string };
          assert.equal(payload.error, args[0]);
        },
      },
      {
        pattern: /^Then the generate ui response content type is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.response?.headers.get("content-type"), args[0]);
        },
      },
      {
        pattern: /^Then the generate ui response body contains (.+)$/,
        run: async ({ args, assert, world }) => {
          const body = await world.response?.text();
          assert.equal(String(body).includes(args[0]), true);
        },
      },
    ],
  }
);
