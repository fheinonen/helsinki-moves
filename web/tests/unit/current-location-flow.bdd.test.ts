import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  applyCurrentLocationResult,
  shouldAutoResolveCurrentLocation,
} from "@client/create/current-location-flow";
import type { LocationPermissionState, LocationResult } from "@client/services/location-service";
import type { PromptFlowState } from "@client/create/prompt-flow-state";

interface World {
  hasResolver?: boolean;
  permissionState?: LocationPermissionState;
  prompt?: string;
  promptFlow?: PromptFlowState;
  result?: LocationResult;
  shouldAutoResolve?: boolean;
  state?: ReturnType<typeof applyCurrentLocationResult>;
  useCurrentLocationPreference?: boolean;
}

defineFeature<World>(
  test,
  `
Feature: Current location flow

  Scenario: Saved current-location preference auto-resolves location requests
    Given current-location preference is enabled
    And current-location resolver is available
    When current-location auto-resolve is evaluated
    Then current-location should auto-resolve

  Scenario: Granted location permission auto-resolves location requests
    Given current-location preference is disabled
    And current-location resolver is available
    And location permission state is granted
    When current-location auto-resolve is evaluated
    Then current-location should auto-resolve

  Scenario: Prompt location permission does not auto-resolve
    Given current-location preference is disabled
    And current-location resolver is available
    And location permission state is prompt
    When current-location auto-resolve is evaluated
    Then current-location should not auto-resolve

  Scenario: Successful current-location resolution creates a current-location pending request
    Given a location clarification prompt flow for let's go to Mall of Tripla
    And current-location resolution succeeds at 60.171 and 24.9414
    When current-location resolution is applied
    Then current-location preference becomes enabled
    And the prompt flow pending request uses current location

  Scenario: Failed current-location resolution keeps clarification and shows denial
    Given a location clarification prompt flow for let's go to Mall of Tripla
    And current-location resolution fails
    When current-location resolution is applied
    Then current-location preference becomes disabled
    And the prompt flow still shows location clarification
    And the location clarification denial is shown
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given current-location preference is enabled$/,
        run: ({ world }) => {
          world.useCurrentLocationPreference = true;
        },
      },
      {
        pattern: /^Given current-location preference is disabled$/,
        run: ({ world }) => {
          world.useCurrentLocationPreference = false;
        },
      },
      {
        pattern: /^(Given|And) current-location resolver is available$/,
        run: ({ world }) => {
          world.hasResolver = true;
        },
      },
      {
        pattern: /^(Given|And) location permission state is granted$/,
        run: ({ world }) => {
          world.permissionState = "granted";
        },
      },
      {
        pattern: /^(Given|And) location permission state is prompt$/,
        run: ({ world }) => {
          world.permissionState = "prompt";
        },
      },
      {
        pattern: /^Given a location clarification prompt flow for let's go to Mall of Tripla$/,
        run: ({ world }) => {
          world.prompt = "let's go to Mall of Tripla";
          world.promptFlow = {
            clarification: {
              deniedMessage: null,
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
        pattern: /^(Given|And) current-location resolution succeeds at 60\.171 and 24\.9414$/,
        run: ({ world }) => {
          world.result = {
            ok: true,
            value: {
              lat: 60.171,
              lon: 24.9414,
            },
          };
        },
      },
      {
        pattern: /^(Given|And) current-location resolution fails$/,
        run: ({ world }) => {
          world.result = {
            code: "permission-denied",
            ok: false,
          };
        },
      },
      {
        pattern: /^When current-location auto-resolve is evaluated$/,
        run: ({ world }) => {
          world.shouldAutoResolve = shouldAutoResolveCurrentLocation({
            hasResolver: world.hasResolver === true,
            permissionState: world.permissionState,
            useCurrentLocationPreference: world.useCurrentLocationPreference === true,
          });
        },
      },
      {
        pattern: /^When current-location resolution is applied$/,
        run: ({ world }) => {
          if (!world.prompt || !world.promptFlow || !world.result) {
            throw new Error("Expected prompt, prompt flow, and location result");
          }
          world.state = applyCurrentLocationResult({
            prompt: world.prompt,
            promptFlow: world.promptFlow,
            result: world.result,
            useCurrentLocationPreference: world.useCurrentLocationPreference === true,
          });
        },
      },
      {
        pattern: /^Then current-location should auto-resolve$/,
        run: ({ assert, world }) => {
          assert.equal(world.shouldAutoResolve, true);
        },
      },
      {
        pattern: /^Then current-location should not auto-resolve$/,
        run: ({ assert, world }) => {
          assert.equal(world.shouldAutoResolve, false);
        },
      },
      {
        pattern: /^Then current-location preference becomes enabled$/,
        run: ({ assert, world }) => {
          assert.equal(world.state?.useCurrentLocationPreference, true);
        },
      },
      {
        pattern: /^Then current-location preference becomes disabled$/,
        run: ({ assert, world }) => {
          assert.equal(world.state?.useCurrentLocationPreference, false);
        },
      },
      {
        pattern: /^(Then|And) the prompt flow pending request uses current location$/,
        run: ({ assert, world }) => {
          assert.equal(world.state?.promptFlow.pendingRequest?.originOverride?.type, "current-location");
        },
      },
      {
        pattern: /^(Then|And) the prompt flow still shows location clarification$/,
        run: ({ assert, world }) => {
          assert.equal(world.state?.promptFlow.clarification?.type, "location");
        },
      },
      {
        pattern: /^(Then|And) the location clarification denial is shown$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.state?.promptFlow.clarification?.type === "location"
              ? world.state.promptFlow.clarification.deniedMessage
              : null,
            "Location access was denied. Enter your starting place to continue."
          );
        },
      },
    ],
  }
);
