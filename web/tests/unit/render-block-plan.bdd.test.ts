import { test } from "vitest";
import type { Spec } from "@json-render/core";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { renderBlockPlan } from "@client/create/render-block-plan";
import { validateCreateRouteSpec } from "@client/create/generated-spec-validation";
import type { BlockPlan } from "@client/create/block-plan-schema";

interface World {
  plan?: BlockPlan;
  result?: Spec;
  validation?: ReturnType<typeof validateCreateRouteSpec>;
}

defineFeature<World>(
  test,
  `
Feature: Block plan rendering

  Scenario: A validated block plan maps to fixed regions
    Given a destination block plan with primary, backup, policy, and explanation blocks
    When the block plan is rendered
    Then the rendered spec root is canvas-shell
    And the rendered spec contains primary-region
    And the rendered spec contains support-region

  Scenario: The primary route renders in the dominant slot
    Given a destination block plan with primary, backup, policy, and explanation blocks
    When the block plan is rendered
    Then the primary-region renders primary_route
    And the primary-region uses the RouteBlock component

  Scenario: The backup route renders in the secondary slot
    Given a destination block plan with primary, backup, policy, and explanation blocks
    When the block plan is rendered
    Then the secondary-region renders backup_route

  Scenario: Explanation and policy switch render in the support area
    Given a destination block plan with primary, backup, policy, and explanation blocks
    When the block plan is rendered
    Then the support-region renders route_explanation
    And the support-region renders policy_switch

  Scenario: Itinerary details render in the support area
    Given a destination block plan with itinerary details
    When the block plan is rendered
    Then the support-region renders itinerary_details

  Scenario: Confidence notice renders in the support area
    Given a destination block plan with confidence notice
    When the block plan is rendered
    Then the support-region renders confidence_notice

  Scenario: Service note renders in the support area
    Given a destination block plan with service note
    When the block plan is rendered
    Then the support-region renders service_note

  Scenario: Disruption notice renders in the support area
    Given a destination block plan with disruption notice
    When the block plan is rendered
    Then the support-region renders disruption_notice

  Scenario: Policy recovery renders in the support area
    Given a destination block plan with policy recovery
    When the block plan is rendered
    Then the support-region renders policy_recovery

  Scenario: Disruption recovery renders in the support area
    Given a destination block plan with disruption recovery
    When the block plan is rendered
    Then the support-region renders disruption_recovery

  Scenario: Arbitrary tree structure is impossible in this flow
    Given a destination block plan with primary, backup, policy, and explanation blocks
    When the block plan is rendered
    Then the rendered spec contains only fixed region ids

  Scenario: A rendered block plan stays valid for the create route
    Given a destination block plan with primary, backup, policy, and explanation blocks
    When the block plan is rendered
    And the rendered block plan is validated for the create route
    Then the rendered block plan is valid
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a destination block plan with primary, backup, policy, and explanation blocks$/,
        run: ({ world }) => {
          world.plan = {
            blocks: ["primary_route", "backup_route", "route_explanation", "policy_switch"],
            canvasType: "destination_route",
          };
        },
      },
      {
        pattern: /^Given a destination block plan with itinerary details$/,
        run: ({ world }) => {
          world.plan = {
            blocks: ["primary_route", "itinerary_details"],
            canvasType: "destination_route",
          };
        },
      },
      {
        pattern: /^Given a destination block plan with confidence notice$/,
        run: ({ world }) => {
          world.plan = {
            blocks: ["primary_route", "confidence_notice"],
            canvasType: "destination_route",
          };
        },
      },
      {
        pattern: /^Given a destination block plan with service note$/,
        run: ({ world }) => {
          world.plan = {
            blocks: ["primary_route", "service_note" as never],
            canvasType: "destination_route",
          };
        },
      },
      {
        pattern: /^Given a destination block plan with disruption notice$/,
        run: ({ world }) => {
          world.plan = {
            blocks: ["primary_route", "disruption_notice" as never],
            canvasType: "destination_route",
          };
        },
      },
      {
        pattern: /^Given a destination block plan with policy recovery$/,
        run: ({ world }) => {
          world.plan = {
            blocks: ["primary_route", "policy_recovery" as never],
            canvasType: "destination_route",
          };
        },
      },
      {
        pattern: /^Given a destination block plan with disruption recovery$/,
        run: ({ world }) => {
          world.plan = {
            blocks: ["primary_route", "disruption_recovery" as never],
            canvasType: "destination_route",
          };
        },
      },
      {
        pattern: /^When the block plan is rendered$/,
        run: ({ world }) => {
          if (!world.plan) {
            throw new Error("Expected block plan");
          }
          world.result = renderBlockPlan(world.plan);
        },
      },
      {
        pattern: /^(When|And) the rendered block plan is validated for the create route$/,
        run: ({ world }) => {
          if (!world.result) {
            throw new Error("Expected rendered spec");
          }
          world.validation = validateCreateRouteSpec(world.result);
        },
      },
      {
        pattern: /^Then the rendered spec root is canvas-shell$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.root, "canvas-shell");
        },
      },
      {
        pattern: /^(Then|And) the rendered spec contains primary-region$/,
        run: ({ assert, world }) => {
          assert.equal(Boolean(world.result?.elements["primary-region"]), true);
        },
      },
      {
        pattern: /^(Then|And) the rendered spec contains support-region$/,
        run: ({ assert, world }) => {
          assert.equal(Boolean(world.result?.elements["support-region"]), true);
        },
      },
      {
        pattern: /^Then the primary-region renders primary_route$/,
        run: ({ assert, world }) => {
          assert.equal(
            JSON.stringify(world.result?.elements["primary-region"]?.props),
            JSON.stringify({ block: "primary_route", slot: "primary" })
          );
        },
      },
      {
        pattern: /^(Then|And) the primary-region uses the RouteBlock component$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.elements["primary-region"]?.type, "RouteBlock");
        },
      },
      {
        pattern: /^Then the secondary-region renders backup_route$/,
        run: ({ assert, world }) => {
          assert.equal(
            JSON.stringify(world.result?.elements["secondary-region"]?.props),
            JSON.stringify({ block: "backup_route", slot: "secondary" })
          );
        },
      },
      {
        pattern: /^Then the support-region renders route_explanation$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.result?.elements["support-region"]?.children?.includes("support-route-explanation"),
            true
          );
        },
      },
      {
        pattern: /^(Then|And) the support-region renders policy_switch$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.result?.elements["support-region"]?.children?.includes("support-policy-switch"),
            true
          );
        },
      },
      {
        pattern: /^Then the support-region renders itinerary_details$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.result?.elements["support-region"]?.children?.includes("support-itinerary-details"),
            true
          );
        },
      },
      {
        pattern: /^Then the support-region renders confidence_notice$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.result?.elements["support-region"]?.children?.includes("support-confidence-notice"),
            true
          );
        },
      },
      {
        pattern: /^Then the support-region renders service_note$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.result?.elements["support-region"]?.children?.includes("support-service-note"),
            true
          );
        },
      },
      {
        pattern: /^Then the support-region renders disruption_notice$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.result?.elements["support-region"]?.children?.includes("support-disruption-notice"),
            true
          );
        },
      },
      {
        pattern: /^Then the support-region renders policy_recovery$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.result?.elements["support-region"]?.children?.includes("support-policy-recovery"),
            true
          );
        },
      },
      {
        pattern: /^Then the support-region renders disruption_recovery$/,
        run: ({ assert, world }) => {
          assert.equal(
            world.result?.elements["support-region"]?.children?.includes("support-disruption-recovery"),
            true
          );
        },
      },
      {
        pattern: /^Then the rendered spec contains only fixed region ids$/,
        run: ({ assert, world }) => {
          assert.equal(
            JSON.stringify(Object.keys(world.result?.elements || {}).sort()),
            JSON.stringify(
              [
                "canvas-shell",
                "primary-region",
                "secondary-region",
                "support-policy-switch",
                "support-region",
                "support-route-explanation",
              ].sort()
            )
          );
        },
      },
      {
        pattern: /^Then the rendered block plan is valid$/,
        run: ({ assert, world }) => {
          assert.equal(world.validation?.ok, true);
        },
      },
    ],
  }
);
