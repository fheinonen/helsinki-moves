import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createIntentSession } from "@client/create/intent-session";

interface World {
  firstRequestId?: number;
  secondRequestId?: number;
  session?: ReturnType<typeof createIntentSession>;
}

defineFeature<World>(
  test,
  `
Feature: Intent session

  Scenario: Draft edits do not change the visible submitted intent until submit
    Given an intent session with Home canvas already visible
    When the draft intent is changed to let's go to Mall of Tripla
    Then the visible submitted intent remains get me home fast
    When the draft intent is submitted
    Then the visible submitted intent becomes let's go to Mall of Tripla

  Scenario: The latest request wins over a stale result
    Given an intent session with a submitted destination intent
    When two canvas requests start in sequence
    And the older request resolves after the newer one
    Then only the newer canvas result remains visible

  Scenario: Policy switching stays inside the current canvas session
    Given an intent session with destination canvas already visible
    When the route policy is changed to least_walking
    Then the selected policy becomes least_walking
    And the current canvas type stays destination_route

  Scenario: Missing Home enters inline setup state
    Given an empty intent session
    When Home setup is required
    Then the visible state is home_setup

  Scenario: Missing starting location enters location clarification state
    Given an empty intent session
    And the draft intent is i want to take bus to Elielinaukio
    When starting location clarification is shown
    Then the visible state is location_clarification
    And the location clarification keeps the submitted intent i want to take bus to Elielinaukio

  Scenario: Ambiguous destination enters destination clarification state
    Given an empty intent session
    And the draft intent is let's go to Tripla
    When destination clarification is shown for Tripla
    Then the visible state is destination_clarification
    And the destination clarification input is Tripla

  Scenario: Intent parse failure enters manual clarification fallback
    Given an empty intent session
    When intent parsing fails for let's go someplace nice
    Then the visible state is intent_fallback
    And the draft intent remains let's go someplace nice

  Scenario: Degraded confidence stays inside the same canvas shell
    Given an intent session with destination canvas already visible
    When the visible canvas is marked degraded
    Then the current canvas type stays destination_route
    And the current canvas is marked degraded
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given an intent session with Home canvas already visible$/,
        run: ({ world }) => {
          world.session = createIntentSession();
          world.session.setDraftIntent("get me home fast");
          world.session.submitDraft();
          const requestId = world.session.startRequest();
          world.session.applyCanvasResult({
            canvasType: "home_fast",
            requestId,
            title: "Get Me Home Fast",
          });
        },
      },
      {
        pattern: /^Given an intent session with a submitted destination intent$/,
        run: ({ world }) => {
          world.session = createIntentSession();
          world.session.setDraftIntent("let's go to Mall of Tripla");
          world.session.submitDraft();
        },
      },
      {
        pattern: /^Given an intent session with destination canvas already visible$/,
        run: ({ world }) => {
          world.session = createIntentSession();
          world.session.setDraftIntent("let's go to Mall of Tripla");
          world.session.submitDraft();
          const requestId = world.session.startRequest();
          world.session.applyCanvasResult({
            canvasType: "destination_route",
            requestId,
            title: "Mall of Tripla",
          });
        },
      },
      {
        pattern: /^Given an empty intent session$/,
        run: ({ world }) => {
          world.session = createIntentSession();
        },
      },
      {
        pattern: /^When the draft intent is changed to let's go to Mall of Tripla$/,
        run: ({ world }) => {
          world.session?.setDraftIntent("let's go to Mall of Tripla");
        },
      },
      {
        pattern: /^When the draft intent is submitted$/,
        run: ({ world }) => {
          world.session?.submitDraft();
        },
      },
      {
        pattern: /^When two canvas requests start in sequence$/,
        run: ({ world }) => {
          if (!world.session) {
            throw new Error("Expected session");
          }
          world.firstRequestId = world.session.startRequest();
          world.secondRequestId = world.session.startRequest();
        },
      },
      {
        pattern: /^(When|And) the older request resolves after the newer one$/,
        run: ({ world }) => {
          if (!world.session || !world.firstRequestId || !world.secondRequestId) {
            throw new Error("Expected request ids");
          }
          world.session.applyCanvasResult({
            canvasType: "destination_route",
            requestId: world.secondRequestId,
            title: "Newer result",
          });
          world.session.applyCanvasResult({
            canvasType: "destination_route",
            requestId: world.firstRequestId,
            title: "Older result",
          });
        },
      },
      {
        pattern: /^When the route policy is changed to least_walking$/,
        run: ({ world }) => {
          world.session?.setPolicy("least_walking");
        },
      },
      {
        pattern: /^When Home setup is required$/,
        run: ({ world }) => {
          world.session?.showHomeSetup("Save Home to use this shortcut.");
        },
      },
      {
        pattern: /^(Given|And) the draft intent is i want to take bus to Elielinaukio$/,
        run: ({ world }) => {
          world.session?.setDraftIntent("i want to take bus to Elielinaukio");
          world.session?.submitDraft();
        },
      },
      {
        pattern: /^(Given|And) the draft intent is let's go to Tripla$/,
        run: ({ world }) => {
          world.session?.setDraftIntent("let's go to Tripla");
          world.session?.submitDraft();
        },
      },
      {
        pattern: /^When starting location clarification is shown$/,
        run: ({ world }) => {
          world.session?.showLocationClarification(
            "Add a starting location or use current location to find departures to Elielinaukio."
          );
        },
      },
      {
        pattern: /^When destination clarification is shown for Tripla$/,
        run: ({ world }) => {
          world.session?.showDestinationClarification({
            inputDestination: "Tripla",
            message: 'I could not confidently match "Tripla". Did you mean one of these?',
            mode: "BUS",
            suggestions: ["Herttoniemi(M) via Pasila as.", "Kamppi"],
          });
        },
      },
      {
        pattern: /^When intent parsing fails for let's go someplace nice$/,
        run: ({ world }) => {
          world.session?.setDraftIntent("let's go someplace nice");
          world.session?.showIntentFallback("I need a clearer destination.");
        },
      },
      {
        pattern: /^When the visible canvas is marked degraded$/,
        run: ({ world }) => {
          world.session?.markVisibleCanvasDegraded();
        },
      },
      {
        pattern: /^Then the visible submitted intent remains get me home fast$/,
        run: ({ assert, world }) => {
          assert.equal(world.session?.getState().submittedIntent, "get me home fast");
        },
      },
      {
        pattern: /^Then the visible submitted intent becomes let's go to Mall of Tripla$/,
        run: ({ assert, world }) => {
          assert.equal(world.session?.getState().submittedIntent, "let's go to Mall of Tripla");
        },
      },
      {
        pattern: /^Then only the newer canvas result remains visible$/,
        run: ({ assert, world }) => {
          const visible = world.session?.getState().visible;
          assert.equal(visible?.type, "canvas");
          if (visible?.type !== "canvas") {
            throw new Error("Expected canvas");
          }
          assert.equal(visible.title, "Newer result");
        },
      },
      {
        pattern: /^Then the selected policy becomes least_walking$/,
        run: ({ assert, world }) => {
          assert.equal(world.session?.getState().policy, "least_walking");
        },
      },
      {
        pattern: /^(Then|And) the current canvas type stays destination_route$/,
        run: ({ assert, world }) => {
          const visible = world.session?.getState().visible;
          assert.equal(visible?.type, "canvas");
          if (visible?.type !== "canvas") {
            throw new Error("Expected canvas");
          }
          assert.equal(visible.canvasType, "destination_route");
        },
      },
      {
        pattern: /^Then the visible state is home_setup$/,
        run: ({ assert, world }) => {
          assert.equal(world.session?.getState().visible.type, "home_setup");
        },
      },
      {
        pattern: /^Then the visible state is location_clarification$/,
        run: ({ assert, world }) => {
          assert.equal(world.session?.getState().visible.type, "location_clarification");
        },
      },
      {
        pattern: /^(Then|And) the location clarification keeps the submitted intent i want to take bus to Elielinaukio$/,
        run: ({ assert, world }) => {
          assert.equal(world.session?.getState().submittedIntent, "i want to take bus to Elielinaukio");
        },
      },
      {
        pattern: /^Then the visible state is destination_clarification$/,
        run: ({ assert, world }) => {
          assert.equal(world.session?.getState().visible.type, "destination_clarification");
        },
      },
      {
        pattern: /^(Then|And) the destination clarification input is Tripla$/,
        run: ({ assert, world }) => {
          const visible = world.session?.getState().visible;
          assert.equal(visible?.type, "destination_clarification");
          if (visible?.type !== "destination_clarification") {
            throw new Error("Expected destination clarification");
          }
          assert.equal(visible.inputDestination, "Tripla");
        },
      },
      {
        pattern: /^Then the visible state is intent_fallback$/,
        run: ({ assert, world }) => {
          assert.equal(world.session?.getState().visible.type, "intent_fallback");
        },
      },
      {
        pattern: /^(Then|And) the draft intent remains let's go someplace nice$/,
        run: ({ assert, world }) => {
          assert.equal(world.session?.getState().draftIntent, "let's go someplace nice");
        },
      },
      {
        pattern: /^(Then|And) the current canvas is marked degraded$/,
        run: ({ assert, world }) => {
          const visible = world.session?.getState().visible;
          assert.equal(visible?.type, "canvas");
          if (visible?.type !== "canvas") {
            throw new Error("Expected canvas");
          }
          assert.equal(visible.degraded, true);
        },
      },
    ],
  }
);
