import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  buildVoiceTypedFallbackPromptMessage,
  createBrowserVoiceTypedFallbackPrompt,
  shouldOfferVoiceTypedFallback,
} from "@client/features/voice/voice-typed-fallback";
import { createVoiceError } from "@client/features/voice/voice-errors";

interface World {
  error?: ReturnType<typeof createVoiceError>;
  message?: string;
  offerFallback?: boolean;
  prompt?: ReturnType<typeof createBrowserVoiceTypedFallbackPrompt>;
  response?: string | null;
}

defineFeature<World>(
  test,
  `
Feature: Voice typed fallback prompt

  Scenario: Unsupported voice errors offer typed fallback with the unsupported message
    Given a voice unsupported error
    When the typed fallback prompt message is built
    Then typed fallback is offered
    And the typed fallback prompt message starts with Voice recognition is unavailable right now.

  Scenario: Other voice errors use the generic typed fallback message
    Given a voice not understood error
    When the typed fallback prompt message is built
    Then typed fallback is not offered
    And the typed fallback prompt message starts with Could not capture your voice right now.

  Scenario: Browser typed fallback trims prompt responses
    Given a browser typed fallback prompt with a surrounding-spaces response
    When the browser typed fallback prompt is requested for a voice unsupported error
    Then the browser typed fallback response is Kamppi Helsinki
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a voice unsupported error$/,
        run: ({ world }) => {
          world.error = createVoiceError("voice_unsupported", "Voice recognition is unavailable right now.");
        },
      },
      {
        pattern: /^Given a voice not understood error$/,
        run: ({ world }) => {
          world.error = createVoiceError("voice_not_understood", "Could not transcribe speech");
        },
      },
      {
        pattern: /^Given a browser typed fallback prompt with a surrounding-spaces response$/,
        run: ({ world }) => {
          world.prompt = createBrowserVoiceTypedFallbackPrompt({
            promptImpl() {
              return "  Kamppi Helsinki  ";
            },
          });
        },
      },
      {
        pattern: /^When the typed fallback prompt message is built$/,
        run: ({ world }) => {
          if (!world.error) {
            throw new Error("Expected voice error");
          }
          world.offerFallback = shouldOfferVoiceTypedFallback(world.error);
          world.message = buildVoiceTypedFallbackPromptMessage(world.error);
        },
      },
      {
        pattern: /^When the browser typed fallback prompt is requested for a voice unsupported error$/,
        run: ({ world }) => {
          if (!world.prompt) {
            throw new Error("Expected browser typed fallback prompt");
          }
          world.response = world.prompt.request(
            createVoiceError("voice_unsupported", "Voice recognition is unavailable right now.")
          );
        },
      },
      {
        pattern: /^Then typed fallback is offered$/,
        run: ({ assert, world }) => {
          assert.equal(world.offerFallback, true);
        },
      },
      {
        pattern: /^Then typed fallback is not offered$/,
        run: ({ assert, world }) => {
          assert.equal(world.offerFallback, false);
        },
      },
      {
        pattern: /^Then the typed fallback prompt message starts with (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(String(world.message || "").startsWith(args[0]), true);
        },
      },
      {
        pattern: /^Then the browser typed fallback response is (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.response, args[0]);
        },
      },
    ],
  }
);
