import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { createAppStore, type AppStore } from "@client/app/app-store";
import { renderAppShell } from "@client/app/app-shell";
import { createAppController } from "@client/app/app-controller";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { DeparturesClient } from "@client/services/departures-client";
import type { LocationService } from "@client/services/location-service";

interface World {
  container?: HTMLElement;
  cleanup?: () => void;
  documentRef?: Document;
  firstContainer?: HTMLElement;
  secondContainer?: HTMLElement;
  outsideClickListeners?: Set<EventListenerOrEventListenerObject>;
  store?: AppStore;
}

function createDeparturesResponse(): DeparturesSuccessResponse {
  return {
    filterOptions: {
      destinations: [
        { count: 2, value: "Kamppi" },
        { count: 1, value: "Pasila" },
      ],
      lines: [
        { count: 2, value: "550" },
        { count: 1, value: "510" },
      ],
    },
    mode: "BUS",
    selectedStopId: "HSL:STOP_A",
    station: {
      departures: [
        {
          departureIso: "2026-03-07T10:10:00.000Z",
          destination: "Kamppi",
          line: "550",
        },
      ],
      distanceMeters: 80,
      stopCode: "A1",
      stopCodes: ["A1"],
      stopName: "Kamppi",
      type: "stop",
    },
    stops: [
      {
        code: "A1",
        distanceMeters: 80,
        id: "HSL:STOP_A",
        memberStopIds: ["HSL:STOP_A"],
        name: "Kamppi",
        stopCodes: ["A1"],
      },
      {
        code: "B1",
        distanceMeters: 120,
        id: "HSL:STOP_B",
        memberStopIds: ["HSL:STOP_B"],
        name: "Ruoholahti",
        stopCodes: ["B1"],
      },
    ],
  };
}

function createController(store: AppStore) {
  const locationService: LocationService = {
    async getCurrentPosition() {
      return { code: "unavailable", ok: false };
    },
  };
  const departuresClient: DeparturesClient = {
    async getDepartures() {
      return createDeparturesResponse();
    },
  };
  return createAppController({
    departuresClient,
    locationService,
    store,
  });
}

function createShellDocument(title: string): Document {
  const documentRef = document.implementation.createHTMLDocument(title);
  documentRef.body.innerHTML = "<div id='root-a'></div><div id='root-b'></div>";
  return documentRef;
}

function getRoot(documentRef: Document, id: string): HTMLElement {
  const root = documentRef.querySelector<HTMLElement>(`#${id}`);
  if (!root) {
    throw new Error(`Expected root ${id}`);
  }
  return root;
}

function getLabelledText(documentRef: Document, element: Element): string {
  const labelledBy = element.getAttribute("aria-labelledby") || "";
  return labelledBy
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => documentRef.getElementById(id)?.textContent?.trim() || "")
    .filter(Boolean)
    .join(" ");
}

defineFeature<World>(
  test,
  `
Feature: App shell stop selector standards

  Scenario: Re-rendering the shell replaces the stop selector outside click listener
    Given the stop selector outside click listener is observed
    And the app store has selected stop state
    When the app shell is rendered twice in the same root
    Then one stop selector outside click listener remains
    When the latest rendered app shell is disposed
    Then no stop selector outside click listeners remain

  Scenario: The stop selector name includes the current stop value
    Given the app store has selected stop state
    When the app shell is rendered with a stop selector
    Then the stop selector name says Active stop Kamppi 80 m

  Scenario: Each shell instance uses distinct stop selector and filter ids
    Given the app store has selected stop state
    When two app shells are rendered in one document
    Then the shell instances use distinct control ids
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the stop selector outside click listener is observed$/,
        run: ({ world }) => {
          const documentRef = createShellDocument("app-shell-stop-selector-cleanup");
          const outsideClickListeners = new Set<EventListenerOrEventListenerObject>();
          const originalAddEventListener = documentRef.addEventListener.bind(documentRef);
          const originalRemoveEventListener = documentRef.removeEventListener.bind(documentRef);

          documentRef.addEventListener = ((
            type: string,
            listener: EventListenerOrEventListenerObject,
            options?: boolean | AddEventListenerOptions
          ) => {
            if (type === "click") {
              outsideClickListeners.add(listener);
            }
            originalAddEventListener(type, listener, options);
          }) as typeof documentRef.addEventListener;

          documentRef.removeEventListener = ((
            type: string,
            listener: EventListenerOrEventListenerObject,
            options?: boolean | EventListenerOptions
          ) => {
            if (type === "click") {
              outsideClickListeners.delete(listener);
            }
            originalRemoveEventListener(type, listener, options);
          }) as typeof documentRef.removeEventListener;

          world.documentRef = documentRef;
          world.outsideClickListeners = outsideClickListeners;
        },
      },
      {
        pattern: /^Given the app store has selected stop state$/,
        run: ({ world }) => {
          const store = createAppStore();
          store.applyDeparturesResponse(createDeparturesResponse());
          world.store = store;
        },
      },
      {
        pattern: /^When the app shell is rendered twice in the same root$/,
        run: ({ world }) => {
          if (!world.documentRef || !world.store) {
            throw new Error("Expected document and store");
          }
          const root = getRoot(world.documentRef, "root-a");
          const controller = createController(world.store);

          renderAppShell({
            controller,
            documentRef: world.documentRef,
            root,
            store: world.store,
          });
          world.cleanup = renderAppShell({
            controller,
            documentRef: world.documentRef,
            root,
            store: world.store,
          });
        },
      },
      {
        pattern: /^Then one stop selector outside click listener remains$/,
        run: ({ assert, world }) => {
          assert.equal(world.outsideClickListeners?.size, 1);
        },
      },
      {
        pattern: /^When the latest rendered app shell is disposed$/,
        run: ({ world }) => {
          world.cleanup?.();
        },
      },
      {
        pattern: /^Then no stop selector outside click listeners remain$/,
        run: ({ assert, world }) => {
          assert.equal(world.outsideClickListeners?.size, 0);
        },
      },
      {
        pattern: /^When the app shell is rendered with a stop selector$/,
        run: ({ world }) => {
          if (!world.store) {
            throw new Error("Expected store");
          }
          const documentRef = createShellDocument("app-shell-stop-selector-name");
          const root = getRoot(documentRef, "root-a");
          const controller = createController(world.store);

          renderAppShell({
            controller,
            documentRef,
            root,
            store: world.store,
          });

          world.container = root;
          world.documentRef = documentRef;
        },
      },
      {
        pattern: /^Then the stop selector name says Active stop Kamppi 80 m$/,
        run: ({ assert, world }) => {
          if (!world.documentRef) {
            throw new Error("Expected document");
          }
          const trigger = world.container?.querySelector<HTMLElement>("[data-stop-select]");
          if (!trigger) {
            throw new Error("Expected stop selector");
          }
          assert.equal(getLabelledText(world.documentRef, trigger), "Active stop Kamppi (80 m)");
        },
      },
      {
        pattern: /^When two app shells are rendered in one document$/,
        run: ({ world }) => {
          if (!world.store) {
            throw new Error("Expected store");
          }
          const documentRef = createShellDocument("app-shell-stop-selector-ids");
          const controller = createController(world.store);
          const firstContainer = getRoot(documentRef, "root-a");
          const secondContainer = getRoot(documentRef, "root-b");

          renderAppShell({
            controller,
            documentRef,
            root: firstContainer,
            store: world.store,
          });
          renderAppShell({
            controller,
            documentRef,
            root: secondContainer,
            store: world.store,
          });

          world.documentRef = documentRef;
          world.firstContainer = firstContainer;
          world.secondContainer = secondContainer;
        },
      },
      {
        pattern: /^Then the shell instances use distinct control ids$/,
        run: ({ assert, world }) => {
          const firstTrigger = world.firstContainer?.querySelector<HTMLElement>("[data-stop-select]");
          const secondTrigger = world.secondContainer?.querySelector<HTMLElement>("[data-stop-select]");
          const firstMenu = world.firstContainer?.querySelector<HTMLElement>("[data-stop-menu]");
          const secondMenu = world.secondContainer?.querySelector<HTMLElement>("[data-stop-menu]");
          const firstFilterToggle = world.firstContainer?.querySelector<HTMLElement>("[data-filter-toggle]");
          const secondFilterToggle = world.secondContainer?.querySelector<HTMLElement>("[data-filter-toggle]");
          const firstFilterPanel = world.firstContainer?.querySelector<HTMLElement>("[data-filter-panel]");
          const secondFilterPanel = world.secondContainer?.querySelector<HTMLElement>("[data-filter-panel]");

          assert.equal(firstTrigger?.id === secondTrigger?.id, false);
          assert.equal(firstMenu?.id === secondMenu?.id, false);
          assert.equal(firstFilterPanel?.id === secondFilterPanel?.id, false);
          assert.equal(firstTrigger?.getAttribute("aria-controls"), firstMenu?.id);
          assert.equal(secondTrigger?.getAttribute("aria-controls"), secondMenu?.id);
          assert.equal(firstFilterToggle?.getAttribute("aria-controls"), firstFilterPanel?.id);
          assert.equal(secondFilterToggle?.getAttribute("aria-controls"), secondFilterPanel?.id);
        },
      },
    ],
  }
);
