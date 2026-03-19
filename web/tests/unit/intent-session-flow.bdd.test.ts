import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  createFreshIntentSession,
  getSessionPromptTitle,
  showDestinationClarificationInSession,
  showLocationClarificationInSession,
  submitPromptToSession,
  updateSessionDraft,
} from "@client/create/intent-session-flow";
import type { PromptFlowState } from "@client/create/prompt-flow-state";

interface World {
  promptFlow?: PromptFlowState;
  session?: ReturnType<typeof createFreshIntentSession>;
  title?: string;
}

defineFeature<World>(
  test,
  `
Feature: Intent session flow handoff

  Scenario: Updating the draft prompt does not submit it yet
    Given a fresh intent session
    When the session draft prompt is updated to let's go to Mall of Tripla
    Then the submitted prompt title falls back to draft fallback

  Scenario: Submitting a prompt stores it as the session title
    Given a fresh intent session
    When the session prompt is submitted as let's go to Mall of Tripla
    Then the submitted prompt title is let's go to Mall of Tripla

  Scenario: Location clarification handoff returns prompt flow state
    Given a fresh intent session
    And the session prompt is submitted as let's go to Mall of Tripla
    When session location clarification is shown
    Then the prompt flow shows location clarification

  Scenario: Destination clarification handoff returns prompt flow state
    Given a fresh intent session
    And the session prompt is submitted as let's go to Tripla
    When session destination clarification is shown for Tripla
    Then the prompt flow shows destination clarification
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a fresh intent session$/,
        run: ({ world }) => {
          world.session = createFreshIntentSession();
        },
      },
      {
        pattern: /^When the session draft prompt is updated to let's go to Mall of Tripla$/,
        run: ({ world }) => {
          if (!world.session) {
            throw new Error("Expected session");
          }
          updateSessionDraft(world.session, "let's go to Mall of Tripla");
          world.title = getSessionPromptTitle(world.session, "draft fallback");
        },
      },
      {
        pattern: /^(Given|And|When) the session prompt is submitted as let's go to Mall of Tripla$/,
        run: ({ world }) => {
          if (!world.session) {
            throw new Error("Expected session");
          }
          submitPromptToSession(world.session, "let's go to Mall of Tripla");
          world.title = getSessionPromptTitle(world.session, "draft fallback");
        },
      },
      {
        pattern: /^(Given|And|When) the session prompt is submitted as let's go to Tripla$/,
        run: ({ world }) => {
          if (!world.session) {
            throw new Error("Expected session");
          }
          submitPromptToSession(world.session, "let's go to Tripla");
          world.title = getSessionPromptTitle(world.session, "draft fallback");
        },
      },
      {
        pattern: /^When session location clarification is shown$/,
        run: ({ world }) => {
          if (!world.session) {
            throw new Error("Expected session");
          }
          world.promptFlow = showLocationClarificationInSession(
            world.session,
            "Add a starting location."
          );
        },
      },
      {
        pattern: /^When session destination clarification is shown for Tripla$/,
        run: ({ world }) => {
          if (!world.session) {
            throw new Error("Expected session");
          }
          world.promptFlow = showDestinationClarificationInSession(world.session, {
            inputDestination: "Tripla",
            message: "Choose one of these destinations.",
            mode: "BUS",
            suggestions: ["Mall of Tripla", "Tripla North"],
          });
        },
      },
      {
        pattern: /^Then the submitted prompt title falls back to draft fallback$/,
        run: ({ assert, world }) => {
          assert.equal(world.title, "draft fallback");
        },
      },
      {
        pattern: /^Then the submitted prompt title is let's go to Mall of Tripla$/,
        run: ({ assert, world }) => {
          assert.equal(world.title, "let's go to Mall of Tripla");
        },
      },
      {
        pattern: /^Then the prompt flow shows location clarification$/,
        run: ({ assert, world }) => {
          assert.equal(world.promptFlow?.clarification?.type, "location");
        },
      },
      {
        pattern: /^Then the prompt flow shows destination clarification$/,
        run: ({ assert, world }) => {
          assert.equal(world.promptFlow?.clarification?.type, "destination");
        },
      },
    ],
  }
);
