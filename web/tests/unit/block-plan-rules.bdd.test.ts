import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  normalizeBlockOrder,
  validateBlockPlan,
} from "@client/create/block-plan-rules";
import type { BlockPlan } from "@client/create/block-plan-schema";

interface World {
  normalizedBlocks?: string[];
  plan?: BlockPlan;
  result?: ReturnType<typeof validateBlockPlan>;
}

defineFeature<World>(
  test,
  `
Feature: Block plan rules

  Scenario: A home canvas requires a primary route block
    Given a home block plan with only a policy switch
    When the block plan is validated with Home already saved
    Then block plan validation succeeds
    And the validated block plan includes primary_route before policy_switch

  Scenario: A destination canvas rejects home setup after destination resolution
    Given a destination block plan with home setup and primary route
    When the block plan is validated with destination already resolved
    Then block plan validation succeeds
    And the validated block plan excludes home_setup

  Scenario: A resolved destination canvas rejects clarification choices
    Given a destination block plan with clarification choices and primary route
    When the block plan is validated with destination already resolved
    Then block plan validation succeeds
    And the validated block plan excludes clarification_choices

  Scenario: Duplicate blocks are collapsed into one canonical order
    Given a home block plan with duplicate route explanation and backup route before primary route
    When the block plan is validated with Home already saved
    Then block plan validation succeeds
    And the validated block plan includes primary_route before backup_route
    And the validated block plan contains route_explanation once

  Scenario: Unknown blocks make a block plan invalid
    Given a block plan with an unknown block
    When the block plan is validated with Home already saved
    Then block plan validation fails with Invalid block plan shape

  Scenario: Block order normalization prefers route content before supporting details
    Given block order with policy_switch before primary_route and route_explanation
    When the block order is normalized
    Then the normalized block order is primary_route, route_explanation, policy_switch
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given a home block plan with only a policy switch$/,
        run: ({ world }) => {
          world.plan = {
            blocks: ["policy_switch"],
            canvasType: "home_fast",
          };
        },
      },
      {
        pattern: /^Given a destination block plan with home setup and primary route$/,
        run: ({ world }) => {
          world.plan = {
            blocks: ["home_setup", "primary_route"],
            canvasType: "destination_route",
          };
        },
      },
      {
        pattern: /^Given a destination block plan with clarification choices and primary route$/,
        run: ({ world }) => {
          world.plan = {
            blocks: ["clarification_choices", "primary_route"],
            canvasType: "destination_route",
          };
        },
      },
      {
        pattern: /^Given a home block plan with duplicate route explanation and backup route before primary route$/,
        run: ({ world }) => {
          world.plan = {
            blocks: ["route_explanation", "backup_route", "route_explanation", "primary_route"],
            canvasType: "home_fast",
          };
        },
      },
      {
        pattern: /^Given a block plan with an unknown block$/,
        run: ({ world }) => {
          world.plan = {
            blocks: ["primary_route", "mystery_block" as never],
            canvasType: "home_fast",
          };
        },
      },
      {
        pattern: /^When the block plan is validated with Home already saved$/,
        run: ({ world }) => {
          if (!world.plan) {
            throw new Error("Expected block plan");
          }
          world.result = validateBlockPlan({
            destinationResolved: true,
            homeSaved: true,
            plan: world.plan,
          });
        },
      },
      {
        pattern: /^When the block plan is validated with destination already resolved$/,
        run: ({ world }) => {
          if (!world.plan) {
            throw new Error("Expected block plan");
          }
          world.result = validateBlockPlan({
            destinationResolved: true,
            homeSaved: false,
            plan: world.plan,
          });
        },
      },
      {
        pattern: /^Then block plan validation succeeds$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.ok, true);
        },
      },
      {
        pattern: /^(Then|And) the validated block plan includes primary_route before policy_switch$/,
        run: ({ assert, world }) => {
          if (!world.result?.ok) {
            throw new Error("Expected valid block plan");
          }
          assert.equal(JSON.stringify(world.result.plan.blocks), JSON.stringify(["primary_route", "policy_switch"]));
        },
      },
      {
        pattern: /^(Then|And) the validated block plan excludes home_setup$/,
        run: ({ assert, world }) => {
          if (!world.result?.ok) {
            throw new Error("Expected valid block plan");
          }
          assert.equal(world.result.plan.blocks.includes("home_setup"), false);
        },
      },
      {
        pattern: /^(Then|And) the validated block plan excludes clarification_choices$/,
        run: ({ assert, world }) => {
          if (!world.result?.ok) {
            throw new Error("Expected valid block plan");
          }
          assert.equal(world.result.plan.blocks.includes("clarification_choices"), false);
        },
      },
      {
        pattern: /^(Then|And) the validated block plan includes primary_route before backup_route$/,
        run: ({ assert, world }) => {
          if (!world.result?.ok) {
            throw new Error("Expected valid block plan");
          }
          assert.equal(
            JSON.stringify(world.result.plan.blocks),
            JSON.stringify(["primary_route", "backup_route", "route_explanation"])
          );
        },
      },
      {
        pattern: /^(Then|And) the validated block plan contains route_explanation once$/,
        run: ({ assert, world }) => {
          if (!world.result?.ok) {
            throw new Error("Expected valid block plan");
          }
          assert.equal(
            world.result.plan.blocks.filter((block) => block === "route_explanation").length,
            1
          );
        },
      },
      {
        pattern: /^Then block plan validation fails with Invalid block plan shape$/,
        run: ({ assert, world }) => {
          assert.equal(world.result?.ok, false);
          if (world.result?.ok !== false) {
            throw new Error("Expected invalid block plan");
          }
          assert.equal(world.result.error, "Invalid block plan shape");
        },
      },
      {
        pattern: /^Given block order with policy_switch before primary_route and route_explanation$/,
        run: ({ world }) => {
          world.normalizedBlocks = ["policy_switch", "primary_route", "route_explanation"];
        },
      },
      {
        pattern: /^When the block order is normalized$/,
        run: ({ world }) => {
          if (!world.normalizedBlocks) {
            throw new Error("Expected blocks");
          }
          world.normalizedBlocks = normalizeBlockOrder(world.normalizedBlocks as never);
        },
      },
      {
        pattern: /^Then the normalized block order is primary_route, route_explanation, policy_switch$/,
        run: ({ assert, world }) => {
          assert.equal(
            JSON.stringify(world.normalizedBlocks),
            JSON.stringify(["primary_route", "route_explanation", "policy_switch"])
          );
        },
      },
    ],
  }
);
