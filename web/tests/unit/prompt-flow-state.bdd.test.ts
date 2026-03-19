import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  beginPromptFlowRequest,
  clearPromptFlowClarification,
  continuePromptFlowWithSuggestedDestination,
  continuePromptFlowWithTypedDestination,
  continuePromptFlowWithTypedLocation,
  markPromptFlowLocationDenied,
  showPromptFlowClarification,
} from "@client/create/prompt-flow-state";
import type { IntentSessionVisibleState } from "@client/create/intent-session";
import type { PromptFlowState } from "@client/create/prompt-flow-state";

interface World {
  result?: PromptFlowState;
  state?: PromptFlowState;
  visible?: IntentSessionVisibleState;
}

defineFeature<World>(
  test,
  `
Feature: Prompt flow state

  Scenario: Starting a prompt request clears old clarification state
    Given a prompt flow with old clarification and typed inputs
    When a new prompt request starts for let's go to Mall of Tripla
    Then the pending prompt request is let's go to Mall of Tripla
    And the prompt flow has no clarification
    And the typed location is empty
    And the typed destination is empty

  Scenario: Clearing clarification keeps the active pending request
    Given a prompt flow with old clarification and typed inputs
    When prompt flow clarification is cleared
    Then the pending prompt request is old prompt
    And the prompt flow has no clarification
    And the typed location is empty
    And the typed destination is empty

  Scenario: Location clarification becomes prompt flow state
    Given a location clarification visible state for let's go to Mall of Tripla
    When the visible clarification is shown in prompt flow
    Then the prompt flow shows location clarification

  Scenario: Destination clarification becomes prompt flow state
    Given a destination clarification visible state for let's go to Tripla
    When the visible clarification is shown in prompt flow
    Then the prompt flow shows destination clarification

  Scenario: Continuing with typed starting location creates a pending request
    Given a prompt flow showing location clarification for let's go to Mall of Tripla
    And the typed location is Pasila
    When the prompt flow continues with typed location
    Then the pending origin override query is Pasila
    And the prompt flow has no clarification

  Scenario: Continuing with suggested destination preserves origin override
    Given a prompt flow showing destination clarification for let's go to Tripla
    When the prompt flow continues with suggested destination Mall of Tripla
    Then the pending destination override is Mall of Tripla
    And the pending origin override query is Pasila
    And the prompt flow has no clarification

  Scenario: Continuing with typed destination preserves origin override
    Given a prompt flow showing destination clarification for let's go to Tripla
    And the typed destination is Mall of Tripla
    When the prompt flow continues with typed destination
    Then the pending destination override is Mall of Tripla
    And the pending origin override query is Pasila
    And the prompt flow has no clarification

  Scenario: Location denial updates the active location clarification
    Given a prompt flow showing location clarification for let's go to Mall of Tripla
    When location denial is shown in prompt flow
    Then the location denial message is Location access was denied. Enter your starting place to continue.
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a prompt flow with old clarification and typed inputs$/,
        run: ({ world }) => {
          world.state = {
            clarification: {
              message: "Old clarification",
              prompt: "old prompt",
              type: "location",
            },
            pendingRequest: {
              prompt: "old prompt",
            },
            typedDestination: "Kamppi",
            typedLocation: "Pasila",
          };
        },
      },
      {
        pattern: /^Given a location clarification visible state for let's go to Mall of Tripla$/,
        run: ({ world }) => {
          world.visible = {
            message: "Add a starting location.",
            prompt: "let's go to Mall of Tripla",
            type: "location_clarification",
          };
        },
      },
      {
        pattern: /^Given a destination clarification visible state for let's go to Tripla$/,
        run: ({ world }) => {
          world.visible = {
            inputDestination: "Tripla",
            message: "Choose one of these destinations.",
            mode: "BUS",
            originOverride: {
              query: "Pasila",
              type: "typed-location",
            },
            prompt: "let's go to Tripla",
            suggestions: ["Mall of Tripla", "Tripla North"],
            type: "destination_clarification",
          };
        },
      },
      {
        pattern: /^Given a prompt flow showing location clarification for let's go to Mall of Tripla$/,
        run: ({ world }) => {
          world.state = {
            clarification: {
              message: "Add a starting location.",
              prompt: "let's go to Mall of Tripla",
              type: "location",
            },
            pendingRequest: null,
            typedDestination: "",
            typedLocation: "",
          };
        },
      },
      {
        pattern: /^Given a prompt flow showing destination clarification for let's go to Tripla$/,
        run: ({ world }) => {
          world.state = {
            clarification: {
              inputDestination: "Tripla",
              message: "Choose one of these destinations.",
              mode: "BUS",
              originOverride: {
                query: "Pasila",
                type: "typed-location",
              },
              prompt: "let's go to Tripla",
              suggestions: ["Mall of Tripla", "Tripla North"],
              type: "destination",
            },
            pendingRequest: null,
            typedDestination: "",
            typedLocation: "",
          };
        },
      },
      {
        pattern: /^(Given|And) the typed location is Pasila$/,
        run: ({ world }) => {
          if (!world.state) {
            throw new Error("Expected prompt flow state");
          }
          world.state = {
            ...world.state,
            typedLocation: "Pasila",
          };
        },
      },
      {
        pattern: /^(Given|And) the typed destination is Mall of Tripla$/,
        run: ({ world }) => {
          if (!world.state) {
            throw new Error("Expected prompt flow state");
          }
          world.state = {
            ...world.state,
            typedDestination: "Mall of Tripla",
          };
        },
      },
      {
        pattern: /^When a new prompt request starts for let's go to Mall of Tripla$/,
        run: ({ world }) => {
          world.result = beginPromptFlowRequest("let's go to Mall of Tripla");
        },
      },
      {
        pattern: /^When prompt flow clarification is cleared$/,
        run: ({ world }) => {
          if (!world.state) {
            throw new Error("Expected prompt flow state");
          }
          world.result = clearPromptFlowClarification(world.state);
        },
      },
      {
        pattern: /^When the visible clarification is shown in prompt flow$/,
        run: ({ world }) => {
          if (!world.visible) {
            throw new Error("Expected visible state");
          }
          world.result = showPromptFlowClarification(world.visible);
        },
      },
      {
        pattern: /^When the prompt flow continues with typed location$/,
        run: ({ world }) => {
          if (!world.state) {
            throw new Error("Expected prompt flow state");
          }
          world.result = continuePromptFlowWithTypedLocation(world.state);
        },
      },
      {
        pattern: /^When the prompt flow continues with suggested destination Mall of Tripla$/,
        run: ({ world }) => {
          if (!world.state) {
            throw new Error("Expected prompt flow state");
          }
          world.result = continuePromptFlowWithSuggestedDestination(world.state, "Mall of Tripla");
        },
      },
      {
        pattern: /^When the prompt flow continues with typed destination$/,
        run: ({ world }) => {
          if (!world.state) {
            throw new Error("Expected prompt flow state");
          }
          world.result = continuePromptFlowWithTypedDestination(world.state);
        },
      },
      {
        pattern: /^When location denial is shown in prompt flow$/,
        run: ({ world }) => {
          if (!world.state) {
            throw new Error("Expected prompt flow state");
          }
          world.result = markPromptFlowLocationDenied(
            world.state,
            "Location access was denied. Enter your starting place to continue."
          );
        },
      },
      {
        pattern: /^Then the pending prompt request is let's go to Mall of Tripla$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.pendingRequest?.prompt, "let's go to Mall of Tripla");
        },
      },
      {
        pattern: /^Then the pending prompt request is old prompt$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.pendingRequest?.prompt, "old prompt");
        },
      },
      {
        pattern: /^(Then|And) the prompt flow has no clarification$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.clarification, null);
        },
      },
      {
        pattern: /^(Then|And) the typed location is empty$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.typedLocation, "");
        },
      },
      {
        pattern: /^(Then|And) the typed destination is empty$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.typedDestination, "");
        },
      },
      {
        pattern: /^Then the prompt flow shows location clarification$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.clarification?.type, "location");
        },
      },
      {
        pattern: /^Then the prompt flow shows destination clarification$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.clarification?.type, "destination");
        },
      },
      {
        pattern: /^Then the pending origin override query is Pasila$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.pendingRequest?.originOverride?.type, "typed-location");
          if (world.result?.pendingRequest?.originOverride?.type !== "typed-location") {
            throw new Error("Expected typed location override");
          }
          assert.equal(world.result.pendingRequest.originOverride.query, "Pasila");
        },
      },
      {
        pattern: /^Then the pending destination override is Mall of Tripla$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.pendingRequest?.destinationOverride, "Mall of Tripla");
        },
      },
      {
        pattern: /^Then the location denial message is Location access was denied\. Enter your starting place to continue\.$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.result?.clarification?.type === "location"
              ? world.result.clarification.deniedMessage
              : null,
            "Location access was denied. Enter your starting place to continue."
          );
        },
      },
    ],
  }
);
