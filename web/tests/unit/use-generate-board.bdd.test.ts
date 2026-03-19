import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  buildNoOpRetryPrompt,
  useGenerateBoard,
  type UseGenerateBoardResult,
} from "@client/create/use-generate-board";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface FakeFetchController {
  fetchImpl: typeof fetch;
  prompts: string[];
}

interface World {
  fetchController?: FakeFetchController;
  result?: UseGenerateBoardResult;
  root?: Root;
}

function createStreamingResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(line));
        }
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

function createFakeFetchController(secondResponse: "success" | "no-op"): FakeFetchController {
  const prompts: string[] = [];
  let callCount = 0;

  const fetchImpl: typeof fetch = async (_input, init) => {
    callCount += 1;
    const body = JSON.parse(String(init?.body || "{}")) as { prompt?: string };
    prompts.push(String(body.prompt || ""));

    if (callCount === 1) {
      return createStreamingResponse([]);
    }

    if (secondResponse === "no-op") {
      return createStreamingResponse([]);
    }

    return createStreamingResponse([
      '{"op":"replace","path":"/elements/board/props/title","value":"Tram 6, 2 and Bus 67"}\n',
    ]);
  };

  return {
    fetchImpl,
    prompts,
  };
}

function HookHarness({
  fetchImpl,
  onResult,
}: {
  fetchImpl: typeof fetch;
  onResult: (result: UseGenerateBoardResult) => void;
}) {
  const result = useGenerateBoard({
    apiKey: "",
    fetchImpl,
  });
  onResult(result);
  return null;
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

async function mountHarness(world: World): Promise<void> {
  document.body.innerHTML = "<div id='hook-root'></div>";
  const rootElement = document.querySelector<HTMLElement>("#hook-root");
  if (!rootElement || !world.fetchController) {
    throw new Error("Expected hook root and fetch controller");
  }
  const fetchController = world.fetchController;

  world.root = createRoot(rootElement);
  await act(async () => {
    world.root?.render(
      createElement(HookHarness, {
        fetchImpl: fetchController.fetchImpl,
        onResult(result: UseGenerateBoardResult) {
          world.result = result;
        },
      })
    );
  });
}

async function unmountHarness(world: World): Promise<void> {
  await act(async () => {
    world.root?.unmount();
  });
}

defineFeature<World>(
  test,
  `
Feature: useGenerateBoard streaming

  Scenario: A no-op stream is retried once with a stronger prompt
    Given the generate board hook is mounted with a no-op stream followed by a valid patch stream
    When the user submits a board prompt
    Then the generate board hook retries once with a stronger prompt
    Then the generate board hook keeps the generation error empty

  Scenario: Two no-op streams fall back to a prompt-derived title
    Given the generate board hook is mounted with two no-op streams
    When the user submits a board prompt
    Then the generate board hook falls back to a prompt-derived board title

  Scenario: A travel prompt with no spec changes stays successful without an error
    Given the generate board hook is mounted with two no-op streams
    When the user submits a travel prompt
    Then the generate board hook keeps the current board without a generation error
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the generate board hook is mounted with a no-op stream followed by a valid patch stream$/,
        run: async ({ world }) => {
          world.fetchController = createFakeFetchController("success");
          await mountHarness(world);
        },
      },
      {
        pattern: /^Given the generate board hook is mounted with two no-op streams$/,
        run: async ({ world }) => {
          world.fetchController = createFakeFetchController("no-op");
          await mountHarness(world);
        },
      },
      {
        pattern: /^When the user submits a board prompt$/,
        run: async ({ world }) => {
          await act(async () => {
            world.result?.submit({
              prompt: "build board for tram lines 6 and 2 and bus 67",
            });
            await settle();
            await settle();
          });
        },
      },
      {
        pattern: /^When the user submits a travel prompt$/,
        run: async ({ world }) => {
          await act(async () => {
            world.result?.submit({
              prompt: "i want to go to tripla by bus",
            });
            await settle();
            await settle();
          });
        },
      },
      {
        pattern: /^Then the generate board hook retries once with a stronger prompt$/,
        run: ({ assert, world }) => {
          const prompts = world.fetchController?.prompts || [];
          assert.equal(prompts.length, 2);
          assert.equal(prompts[0], "build board for tram lines 6 and 2 and bus 67");
          assert.equal(prompts[1], buildNoOpRetryPrompt("build board for tram lines 6 and 2 and bus 67"));
        },
      },
      {
        pattern: /^Then the generate board hook keeps the generation error empty$/,
        run: async ({ assert, world }) => {
          assert.equal(world.result?.generationError, null);
          const board = world.result?.lastValidSpec.elements.board as { props?: { title?: string | null } };
          assert.equal(board.props?.title, "Tram 6, 2 and Bus 67");
          await unmountHarness(world);
        },
      },
      {
        pattern: /^Then the generate board hook falls back to a prompt-derived board title$/,
        run: async ({ assert, world }) => {
          const board = world.result?.lastValidSpec.elements.board as { props?: { title?: string | null } };
          assert.equal(board.props?.title, "Tram 6, 2 and Bus 67");
          assert.equal(world.result?.generationError, null);
          await unmountHarness(world);
        },
      },
      {
        pattern: /^Then the generate board hook keeps the current board without a generation error$/,
        run: async ({ assert, world }) => {
          assert.equal(world.result?.appliedPrompt, "i want to go to tripla by bus");
          assert.equal(world.result?.generationError, null);
          await unmountHarness(world);
        },
      },
    ],
  }
);
