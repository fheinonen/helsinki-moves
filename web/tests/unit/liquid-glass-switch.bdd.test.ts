import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import {
  createLiquidGlassSwitch,
  type LiquidGlassSwitchView,
} from "@client/features/view-switch/liquid-glass-switch";
import type { AppView } from "@shared/domain/ride";

interface World {
  host?: HTMLDivElement;
  midProgress?: string;
  selectedViews?: AppView[];
  view?: LiquidGlassSwitchView;
  wasScrubbing?: boolean;
}

function mockCapsuleRect(capsule: HTMLElement): void {
  capsule.getBoundingClientRect = () =>
    ({
      bottom: 56,
      height: 56,
      left: 100,
      right: 300,
      toJSON: () => ({}),
      top: 0,
      width: 200,
      x: 100,
      y: 0,
    }) as DOMRect;
}

function dispatchPointer(
  target: EventTarget,
  type: "pointerdown" | "pointermove" | "pointerup",
  clientX: number,
): void {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperty(event, "clientX", { value: clientX });
  Object.defineProperty(event, "pointerId", { value: 1 });
  target.dispatchEvent(event);
}

defineFeature<World>(
  test,
  `
Feature: Apple Liquid Glass view switcher

  Scenario: Tapping Ride selects the ride view and slides the glass lens
    Given a Liquid Glass view switcher starting on wait
    When the rider taps the Ride segment
    Then the selected view is ride
    And the glass lens progress is 1

  Scenario: Thumb-dragging across the capsule scrubs the lens and snaps on release
    Given a Liquid Glass view switcher starting on wait
    When the rider drags across the capsule from 120 to 270 and releases
    Then the capsule entered scrubbing state during the drag
    And the selected view is ride

  Scenario: ArrowRight switches from Wait to Ride via keyboard
    Given a Liquid Glass view switcher starting on wait
    When the rider presses ArrowRight on the Wait tab
    Then the selected view is ride

  Scenario: An active background ride lights up the destination-colored pulse dot on Ride
    Given a Liquid Glass view switcher starting on wait
    When the switcher syncs with an active ride colored #7cb8cf
    Then the Ride pulse indicator is visible with color #7cb8cf

  Scenario: Releasing a drag before the midpoint snaps back to Wait and ArrowLeft returns from Ride
    Given a Liquid Glass view switcher starting on wait
    When the rider taps the Ride segment
    And the rider presses ArrowLeft on the Ride tab
    Then the selected view is wait
    When the rider drags across the capsule from 120 to 160 and releases
    Then the glass lens progress is 0
    When the Liquid Glass switcher is cleaned up
    Then dragging after cleanup does not change the selected view
  `,
  {
    createWorld: () => ({ selectedViews: [] }),
    stepDefinitions: [
      {
        pattern: /^Given a Liquid Glass view switcher starting on wait$/,
        run: ({ world }) => {
          const host = document.createElement("div");
          document.body.appendChild(host);
          const selectedViews: AppView[] = [];
          const view = createLiquidGlassSwitch({
            documentRef: document,
            onSelect(nextView) {
              selectedViews.push(nextView);
              view.sync({
                activeView: nextView,
                hasActiveRide: false,
                rideColor: null,
              });
            },
          });
          host.appendChild(view.element);
          view.sync({
            activeView: "wait",
            hasActiveRide: false,
            rideColor: null,
          });
          const capsule = view.element.querySelector<HTMLElement>("[data-glass-capsule]");
          if (capsule) {
            mockCapsuleRect(capsule);
          }
          world.host = host;
          world.view = view;
          world.selectedViews = selectedViews;
        },
      },
      {
        pattern: /^When the rider taps the Ride segment$/,
        run: ({ world }) => {
          const rideButton = world.view?.element.querySelector<HTMLButtonElement>('[data-view-tab="ride"]');
          rideButton?.click();
        },
      },
      {
        pattern: /^When the rider drags across the capsule from (\d+) to (\d+) and releases$/,
        run: ({ args, world }) => {
          const capsule = world.view?.element.querySelector<HTMLElement>("[data-glass-capsule]");
          if (!capsule) {
            throw new Error("Expected glass capsule");
          }
          dispatchPointer(capsule, "pointerdown", Number(args[0]));
          dispatchPointer(capsule, "pointermove", Number(args[1]));
          world.wasScrubbing = capsule.dataset.scrubbing === "true";
          world.midProgress = capsule.style.getPropertyValue("--lens-progress");
          dispatchPointer(capsule, "pointerup", Number(args[1]));
        },
      },
      {
        pattern: /^When the rider presses ArrowRight on the Wait tab$/,
        run: ({ world }) => {
          const waitButton = world.view?.element.querySelector<HTMLButtonElement>('[data-view-tab="wait"]');
          waitButton?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
        },
      },
      {
        pattern: /^When the rider presses ArrowLeft on the Ride tab$/,
        run: ({ world }) => {
          const rideButton = world.view?.element.querySelector<HTMLButtonElement>('[data-view-tab="ride"]');
          rideButton?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowLeft" }));
        },
      },
      {
        pattern: /^When the switcher syncs with an active ride colored (.+)$/,
        run: ({ args, world }) => {
          world.view?.sync({
            activeView: "wait",
            hasActiveRide: true,
            rideColor: args[0],
          });
        },
      },
      {
        pattern: /^When the Liquid Glass switcher is cleaned up$/,
        run: ({ world }) => {
          world.view?.cleanup();
          const capsule = world.view?.element.querySelector<HTMLElement>("[data-glass-capsule]");
          if (capsule) {
            dispatchPointer(capsule, "pointerdown", 120);
            dispatchPointer(capsule, "pointermove", 280);
            dispatchPointer(capsule, "pointerup", 280);
          }
        },
      },
      {
        pattern: /^Then the selected view is (wait|ride)$/,
        run: ({ args, assert, world }) => {
          const latest = world.selectedViews?.[world.selectedViews.length - 1];
          assert.equal(latest, args[0]);
        },
      },
      {
        pattern: /^Then the glass lens progress is (.+)$/,
        run: ({ args, assert, world }) => {
          const capsule = world.view?.element.querySelector<HTMLElement>("[data-glass-capsule]");
          assert.equal(capsule?.style.getPropertyValue("--lens-progress"), args[0]);
        },
      },
      {
        pattern: /^Then the capsule entered scrubbing state during the drag$/,
        run: ({ assert, world }) => {
          assert.equal(world.wasScrubbing, true);
          assert.equal(Number(world.midProgress) > 0.5, true);
        },
      },
      {
        pattern: /^Then the Ride pulse indicator is visible with color (.+)$/,
        run: ({ args, assert, world }) => {
          const indicator = world.view?.element.querySelector<HTMLElement>("[data-ride-indicator]");
          assert.equal(indicator?.hidden, false);
          assert.equal(world.view?.element.style.getPropertyValue("--ride-tint"), args[0]);
        },
      },
      {
        pattern: /^Then dragging after cleanup does not change the selected view$/,
        run: ({ assert, world }) => {
          const latest = world.selectedViews?.[world.selectedViews.length - 1];
          assert.equal(latest, "wait");
        },
      },
    ],
  },
);
