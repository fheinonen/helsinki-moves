import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { getRenderableSpec } from "@client/create/get-renderable-spec";
import { validateGeneratedSpec } from "@client/create/generated-spec-validation";
import {
  clearInvalidGeneratedSpecCapture,
  readInvalidGeneratedSpecCapture,
} from "@client/create/invalid-generated-spec-capture";

interface World {
  invalidCapture?: {
    capturedAt?: string;
    error: string;
    input: unknown;
  } | null;
  inputSpec?: Record<string, unknown>;
  renderableSpec?: Record<string, unknown> | null;
  validationResult?: {
    error?: string;
    ok: boolean;
    spec?: Record<string, unknown>;
  };
}

defineFeature<World>(
  test,
  `
Feature: Generated spec validation

  Scenario: A partial spec with unresolved children is adapted into a renderable subtree
    Given a partial generated spec with unresolved children
    When the partial generated spec is adapted for rendering
    Then the adapted spec keeps the board root
    And the adapted spec removes unresolved child ids

  Scenario: A DepartureRow outside a departures repeat is rejected
    Given a generated spec with a DepartureRow outside the departures repeat
    When the generated spec is validated
    Then generated spec validation fails with DepartureRow must stay inside the /departures repeat.

  Scenario: A StopHeader is removed from create-route generated boards
    Given a generated spec with a StopHeader
    When the generated spec is validated
    Then generated spec validation succeeds
    And the validated generated spec does not include StopHeader

  Scenario: A structurally fixable spec is auto-fixed before semantic validation
    Given a generated spec with repeat declared inside props
    When the generated spec is validated
    Then generated spec validation succeeds

  Scenario: A generated patch is merged over the default board before final validation
    Given a generated spec patch without a root
    When the generated spec is validated
    Then generated spec validation succeeds

  Scenario: A generated patch with a blank root falls back to the default board root
    Given a generated spec patch with a blank root
    When the generated spec is validated
    Then generated spec validation succeeds

  Scenario: An empty generated patch is rejected
    Given an empty generated spec patch
    When the generated spec is validated
    Then generated spec validation fails with Generated board made no changes.

  Scenario: A rejected generated spec is captured for inspection
    Given a generated spec with a DepartureRow outside the departures repeat
    When the generated spec is validated
    Then generated spec validation fails with DepartureRow must stay inside the /departures repeat.
    And the rejected generated spec is captured
  `,
  {
    createWorld: () => {
      clearInvalidGeneratedSpecCapture();
      return {};
    },
    stepDefinitions: [
      {
        pattern: /^Given a partial generated spec with unresolved children$/,
        run: ({ world }) => {
          world.inputSpec = {
            elements: {
              board: {
                children: ["stop-header", "missing-row"],
                props: {
                  centered: false,
                  maxWidth: "full",
                  title: null,
                },
                type: "Card",
              },
              "stop-header": {
                props: {
                  code: { $state: "/stopCode" },
                  name: { $state: "/stopName" },
                },
                type: "StopHeader",
              },
            },
            root: "board",
          };
        },
      },
      {
        pattern: /^Given a generated spec with a DepartureRow outside the departures repeat$/,
        run: ({ world }) => {
          world.inputSpec = {
            elements: {
              board: {
                children: ["stop-header", "departure-row"],
                props: {
                  centered: false,
                  maxWidth: "full",
                  title: null,
                },
                type: "Card",
              },
              "departure-row": {
                props: {
                  destination: { $item: "destination" },
                  line: { $item: "line" },
                  minutes: { $item: "minutes" },
                  mode: { $item: "mode" },
                },
                type: "DepartureRow",
              },
              "stop-header": {
                props: {
                  code: { $state: "/stopCode" },
                  name: { $state: "/stopName" },
                },
                type: "StopHeader",
              },
            },
            root: "board",
          };
        },
      },
      {
        pattern: /^Given a generated spec with a StopHeader$/,
        run: ({ world }) => {
          world.inputSpec = {
            elements: {
              board: {
                children: ["stop-header"],
                props: {
                  centered: false,
                  maxWidth: "full",
                  title: null,
                },
                type: "Card",
              },
              "stop-header": {
                props: {
                  code: { $state: "/stopCode" },
                  name: { $state: "/stopName" },
                },
                type: "StopHeader",
              },
            },
            root: "board",
          };
        },
      },
      {
        pattern: /^Given a generated spec with repeat declared inside props$/,
        run: ({ world }) => {
          world.inputSpec = {
            elements: {
              board: {
                children: ["stop-header", "departure-list"],
                props: {
                  centered: false,
                  maxWidth: "full",
                  title: null,
                },
                type: "Card",
              },
              "departure-list": {
                children: ["departure-row"],
                props: {
                  align: "stretch",
                  direction: "vertical",
                  gap: "sm",
                  repeat: {
                    key: "id",
                    statePath: "/departures",
                  },
                },
                type: "Stack",
              },
              "departure-row": {
                props: {
                  destination: { $item: "destination" },
                  line: { $item: "line" },
                  minutes: { $item: "minutes" },
                  mode: { $item: "mode" },
                },
                type: "DepartureRow",
              },
              "stop-header": {
                props: {
                  code: { $state: "/stopCode" },
                  name: { $state: "/stopName" },
                },
                type: "StopHeader",
              },
            },
            root: "board",
          };
        },
      },
      {
        pattern: /^Given a generated spec patch without a root$/,
        run: ({ world }) => {
          world.inputSpec = {
            elements: {
              board: {
                props: {
                  centered: false,
                  maxWidth: "full",
                  title: "Lines 6, 2, and 67",
                },
              },
            },
          };
        },
      },
      {
        pattern: /^Given a generated spec patch with a blank root$/,
        run: ({ world }) => {
          world.inputSpec = {
            elements: {
              board: {
                props: {
                  centered: false,
                  maxWidth: "full",
                  title: "Lines 6, 2, and 67",
                },
              },
            },
            root: "",
          };
        },
      },
      {
        pattern: /^Given an empty generated spec patch$/,
        run: ({ world }) => {
          world.inputSpec = {
            elements: {},
          };
        },
      },
      {
        pattern: /^When the partial generated spec is adapted for rendering$/,
        run: ({ world }) => {
          world.renderableSpec = getRenderableSpec(world.inputSpec);
        },
      },
      {
        pattern: /^When the generated spec is validated$/,
        run: ({ world }) => {
          world.validationResult = validateGeneratedSpec(world.inputSpec);
          world.invalidCapture = readInvalidGeneratedSpecCapture();
        },
      },
      {
        pattern: /^Then the adapted spec keeps the board root$/,
        run: ({ assert, world }) => {
          assert.equal(world.renderableSpec?.root, "board");
        },
      },
      {
        pattern: /^Then the adapted spec removes unresolved child ids$/,
        run: ({ assert, world }) => {
          const children = (world.renderableSpec?.elements as
            | Record<string, { children?: string[] }>
            | undefined)?.board?.children;
          assert.equal(Array.isArray(children) && children.includes("missing-row"), false);
        },
      },
      {
        pattern: /^Then generated spec validation fails with (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.validationResult?.ok, false);
          assert.equal(world.validationResult?.error, args[0]);
        },
      },
      {
        pattern: /^Then generated spec validation succeeds$/,
        run: ({ assert, world }) => {
          assert.equal(world.validationResult?.ok, true);
        },
      },
      {
        pattern: /^(Then|And) the validated generated spec does not include StopHeader$/,
        run: ({ assert, world }) => {
          assert.equal(
            JSON.stringify(world.validationResult?.spec || {}).includes('"StopHeader"'),
            false
          );
        },
      },
      {
        pattern: /^Then the rejected generated spec is captured$/,
        run: ({ assert, world }) => {
          assert.equal(world.invalidCapture?.error, "DepartureRow must stay inside the /departures repeat.");
          assert.equal(Boolean(world.invalidCapture?.capturedAt), true);
          assert.equal(
            JSON.stringify(world.invalidCapture?.input).includes('"root":"board"'),
            true
          );
          assert.equal(
            JSON.stringify(world.invalidCapture?.input).includes('"departure-list"'),
            true
          );
        },
      },
    ],
  }
);
