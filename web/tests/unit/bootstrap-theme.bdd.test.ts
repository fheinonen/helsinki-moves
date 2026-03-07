import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { bootstrapApp } from "@client/app/bootstrap";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface World {
  documentRef?: Document;
  root?: HTMLElement;
  storage?: StorageLike;
}

defineFeature<World>(
  test,
  `
Feature: Theme bootstrap

  Scenario: Bootstrap restores a saved dark theme
    Given local storage contains a dark theme preference
    When the app is bootstrapped
    Then the document theme is dark
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given local storage contains a dark theme preference$/,
        run: ({ world }) => {
          const values = new Map<string, string>([["theme", "dark"]]);
          world.storage = {
            getItem(key) {
              return values.get(key) || null;
            },
            setItem(key, value) {
              values.set(key, value);
            },
          };
          world.documentRef = document.implementation.createHTMLDocument("bootstrap");
          world.documentRef.body.innerHTML = "<div id='root'></div>";
          const root = world.documentRef.querySelector<HTMLElement>("#root");
          if (!root) {
            throw new Error("Expected bootstrap root");
          }
          world.root = root;
        },
      },
      {
        pattern: /^When the app is bootstrapped$/,
        run: ({ world }) => {
          if (!world.documentRef || !world.root || !world.storage) {
            throw new Error("Expected bootstrap world");
          }

          bootstrapApp({
            documentRef: world.documentRef,
            root: world.root,
            storage: world.storage,
          });
        },
      },
      {
        pattern: /^Then the document theme is dark$/,
        run: ({ assert, world }) => {
          assert.equal(world.documentRef?.documentElement.getAttribute("data-theme"), "dark");
        },
      },
    ],
  }
);
