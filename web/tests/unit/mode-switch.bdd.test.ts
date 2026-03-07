import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createModeStore, type ModeStore } from "@client/features/mode/mode-store";
import { renderModeSelector } from "@client/features/mode/mode-view";

interface World {
  container: HTMLElement;
  documentRef: Document;
  store: ModeStore;
}

defineFeature<World>(
  test,
  `
Feature: Mode selector

  Scenario: User switches transport mode
    Given the app starts in rail mode
    When the user selects bus mode
    Then the active mode is bus
  `,
  {
    createWorld: () => {
      const documentRef = document.implementation.createHTMLDocument("mode-switch");
      documentRef.body.innerHTML = "<div id='root'></div>";
      const container = documentRef.querySelector<HTMLElement>("#root");
      if (!container) {
        throw new Error("Expected root container");
      }

      const store = createModeStore("RAIL");
      renderModeSelector({
        container,
        controller: {
          getActiveMode() {
            return store.getActiveMode();
          },
          setMode(mode) {
            store.setMode(mode);
          },
          subscribe(listener) {
            return store.subscribeMode(listener);
          },
        },
        documentRef,
      });

      return {
        container,
        documentRef,
        store,
      };
    },
    stepDefinitions: [
      {
        pattern: /^Given the app starts in rail mode$/,
        run: ({ assert, world }) => {
          assert.equal(world.store.getState().activeMode, "RAIL");
        },
      },
      {
        pattern: /^When the user selects bus mode$/,
        run: ({ world }) => {
          const button = world.container.querySelector<HTMLButtonElement>('[data-mode="BUS"]');
          if (!button) {
            throw new Error("Expected bus mode button");
          }
          button.click();
        },
      },
      {
        pattern: /^Then the active mode is bus$/,
        run: ({ assert, world }) => {
          assert.equal(world.store.getState().activeMode, "BUS");
        },
      },
    ],
  }
);
