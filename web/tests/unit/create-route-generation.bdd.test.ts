import { act } from "react";
import { useSyncExternalStore } from "react";
import { test } from "vitest";
import { defineFeature } from "@tests/helpers/bdd-runner";
import { bootstrapCreatePage } from "@client/create/bootstrap-create-page";
import { defaultSpec } from "@client/create/default-spec";
import type { LocationResult } from "@client/services/location-service";
import type {
  PromptDeparturesLoadResult,
  PromptOriginOverride,
} from "@client/create/load-prompt-departures";
import type { UseGenerateBoardOptions, UseGenerateBoardResult } from "@client/create/use-generate-board";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

interface HookState extends UseGenerateBoardResult {
  submitCount: number;
  stopCount: number;
}

interface HookController {
  hook: (options: UseGenerateBoardOptions) => UseGenerateBoardResult;
  setState: (input: Partial<HookState>) => void;
  getState: () => HookState;
}

interface World {
  controller?: HookController;
  currentLocationCallCount?: number;
  currentLocationDeferred?: {
    resolve: (value: LocationResult) => void;
  };
  locationPermissionState?: "denied" | "granted" | "prompt" | "unavailable";
  locationResult?: LocationResult;
  loadGeneratedDepartures?: (input: {
    destinationOverride?: string | null;
    originOverride?: PromptOriginOverride | null;
    onPartial: (responses: DeparturesSuccessResponse[]) => void;
    prompt: string;
    signal: AbortSignal;
  }) => Promise<PromptDeparturesLoadResult>;
  pageHandle?: { destroy: () => void };
  root?: HTMLElement;
}

function createSuccessResponse(): DeparturesSuccessResponse {
  return {
    filterOptions: {
      destinations: [],
      lines: [],
    },
    mode: "TRAM",
    selectedStopId: "HSL:STOP_TRAM",
    station: {
      departures: [
        {
          departureIso: "2026-03-21T10:05:00.000Z",
          destination: "Lasipalatsi",
          line: "7",
        },
        {
          departureIso: "2026-03-21T10:09:00.000Z",
          destination: "Lansi-Pasila",
          line: "9",
        },
      ],
      distanceMeters: 25,
      stopCode: "H0401",
      stopCodes: ["H0401"],
      stopName: "Rautatientori",
      type: "stop",
    },
    stops: [],
  };
}

function createBusResponse(): DeparturesSuccessResponse {
  return {
    filterOptions: {
      destinations: [],
      lines: [],
    },
    mode: "BUS",
    selectedStopId: "HSL:STOP_BUS",
    station: {
      departures: [
        {
          departureIso: "2026-03-21T10:07:00.000Z",
          destination: "Kamppi",
          line: "67",
          stopCode: "H2101",
          stopName: "Elielinaukio",
          track: "10",
        },
      ],
      distanceMeters: 40,
      stopCode: "H2101",
      stopCodes: ["H2101"],
      stopName: "Elielinaukio",
      type: "stop",
    },
    stops: [],
  };
}

function createGeneratedBoardSpec() {
  return {
    elements: {
      board: {
        children: ["departure-list"],
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
        },
        repeat: {
          key: "id",
          statePath: "/departures",
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
    },
    root: "board",
  };
}

function createHookController(): HookController {
  const listeners = new Set<() => void>();
  let state: HookState = {
    appliedPrompt: null,
    generationError: null,
    isLoading: false,
    lastValidSpec: defaultSpec,
    renderablePartialSpec: null,
    stop() {
      state = {
        ...state,
        isLoading: false,
        renderablePartialSpec: null,
        stopCount: state.stopCount + 1,
      };
      notify();
    },
    stopCount: 0,
    submit() {
      state = {
        ...state,
        isLoading: true,
        submitCount: state.submitCount + 1,
      };
      notify();
    },
    submitCount: 0,
  };

  function notify() {
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    hook() {
      return useSyncExternalStore(
        (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        () => state
      );
    },
    setState(input) {
      state = {
        ...state,
        ...input,
      };
      notify();
    },
    getState() {
      return state;
    },
  };
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickButton(button: HTMLButtonElement | null | undefined): void {
  button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function createDeferredLocation(world: World): Promise<LocationResult> {
  return new Promise<LocationResult>((resolve) => {
    world.currentLocationDeferred = { resolve };
  });
}

async function bootstrapWithController(world: World): Promise<void> {
  document.body.innerHTML = "<div id='create-root'></div>";
  world.root = document.querySelector<HTMLElement>("#create-root") || undefined;
  world.controller = createHookController();
  if (!world.root || !world.controller) {
    throw new Error("Expected create route root");
  }
  const controller = world.controller;
  const root = world.root;

  await act(async () => {
    world.pageHandle = await bootstrapCreatePage({
      documentRef: document,
      fetchDepartures: async () => createSuccessResponse(),
      loadGeneratedDepartures: world.loadGeneratedDepartures,
      nowMs: () => Date.parse("2026-03-21T10:00:00.000Z"),
      resolveCurrentLocation: async () => {
        world.currentLocationCallCount = (world.currentLocationCallCount || 0) + 1;
        if (world.currentLocationDeferred) {
          return createDeferredLocation(world);
        }
        return world.locationResult || { code: "unavailable", ok: false };
      },
      resolveLocationPermission: async () => world.locationPermissionState || "unavailable",
      root,
      useGenerateBoardHook: controller.hook,
    });
  });
}

async function destroyPageHandle(world: World): Promise<void> {
  await act(async () => {
    world.pageHandle?.destroy();
  });
}

defineFeature<World>(
  test,
  `
Feature: Generated create-route boards

  Scenario: The default create board enables prompt input without generation
    Given the create route generation shell is bootstrapped
    Then the generation prompt is enabled

  Scenario: Missing API key disables Generate and shows a hint
    Given the create route generation shell is bootstrapped
    Then the generate button is disabled
    And the create route shows the missing API key hint

  Scenario: A prompt can enable Generate without a stored API key
    Given the create route generation shell is bootstrapped
    When the user enters a generation prompt
    Then the generate button is enabled

  Scenario: A valid key and prompt show a skeleton until a renderable spec exists
    Given the create route generation shell is bootstrapped
    And the create route has a stored Google API key
    When the user enters a generation prompt
    And the user starts board generation
    Then the generation overlay is visible

  Scenario: Streaming promotes the final valid spec to the current board
    Given the create route generation shell is bootstrapped
    And the create route has a stored Google API key
    When the streamed board becomes the last valid spec
    Then the create route hides the stop header

  Scenario: A successful generated prompt can stream mixed-mode stop metadata
    Given the create route generation shell is bootstrapped
    When the generated board loads tram and bus stops
    Then the create route shows 2 mode group headers
    And the create route shows the mode group title Tram
    And the create route shows the mode group title Bus
    And the create route shows the mode group summary Lines 7
    And the create route shows the mode group summary Line 67
    Then the create route shows the departure meta Rautatientori
    And the create route shows the departure meta Stop H0401
    And the create route shows the departure meta Elielinaukio
    And the create route shows the departure meta Stop H2101

  Scenario: A prompt without explicit departure requests keeps the current rows visible
    Given the create route generation shell is bootstrapped
    When the generated board loads no extra departures
    Then the create route shows the departure meta Rautatientori
    And the create route renders 2 departure rows

  Scenario: A destination-only travel prompt asks for a starting location
    Given the create route generation shell is bootstrapped
    When the generated board needs a starting location
    Then the create route shows the location clarification card
    And the generation submit count is 0

  Scenario: The clarification card can continue with current location
    Given the create route generation shell is bootstrapped
    And current location resolves to 60.209661 and 24.89039
    When the generated board needs a starting location
    And the user uses current location
    Then the current location request count is 1
    And the create route shows the departure meta Elielinaukio

  Scenario: Using current location shows progress feedback while it resolves
    Given the create route generation shell is bootstrapped
    And current location is still resolving
    When the generated board needs a starting location
    And the user uses current location
    Then the use current location button is busy
    When current location resolves to 60.209661 and 24.89039
    Then the create route shows the departure meta Elielinaukio

  Scenario: Current location preference is reused for the next travel prompt
    Given the create route generation shell is bootstrapped
    And current location resolves to 60.209661 and 24.89039
    When the generated board needs a starting location
    And the user uses current location
    Then the current location request count is 1
    When the user enters prompt i want to go to tripla by bus
    And the user starts board generation
    Then the current location request count is 2
    And the create route hides the location clarification card

  Scenario: Granted current location permission skips the clarification card
    Given the create route generation shell is bootstrapped
    And current location permission is granted
    And current location resolves to 60.209661 and 24.89039
    When the generated board needs a starting location
    Then the current location request count is 1
    And the create route hides the location clarification card
    And the create route shows the departure meta Elielinaukio

  Scenario: Denied current location falls back to typing a starting place
    Given the create route generation shell is bootstrapped
    And current location permission is denied
    When the generated board needs a starting location
    And the user uses current location
    Then the create route shows the location denied message
    When the user enters starting place Kampin kauppakeskus
    And the user submits starting place
    Then the create route shows the departure meta Elielinaukio

  Scenario: Low-confidence destination correction asks the user to choose
    Given the create route generation shell is bootstrapped
    When the generated board needs destination clarification
    Then the create route shows the destination clarification card
    And the create route shows the destination clarification input Tripla for bus destinations
    When the user chooses suggested destination Herttoniemi(M) via Pasila as.
    Then the create route shows the departure meta Elielinaukio

  Scenario: Destination clarification accepts free-text destination input
    Given the create route generation shell is bootstrapped
    When the generated board needs destination clarification
    And the user enters clarified destination Herttoniemi(M) via Pasila as.
    And the user submits clarified destination
    Then the create route shows the departure meta Elielinaukio

  Scenario: A mid-stream generation failure restores the last valid board
    Given the create route generation shell is bootstrapped
    And the create route is showing a streamed partial board
    When generation fails after a partial board
    Then the create route shows the departure meta Rautatientori

  Scenario: Stopping generation aborts the request without replacing the current board
    Given the create route generation shell is bootstrapped
    And the create route has a stored Google API key
    And the user enters a generation prompt
    And board generation is in progress
    When the user stops board generation
    Then the generation stop count is 1
    And the create route shows the departure meta Rautatientori
  `,
  {
    createWorld: () => ({}),
    stepDefinitions: [
      {
        pattern: /^Given the create route generation shell is bootstrapped$/,
        run: async ({ world }) => {
          window.localStorage.clear();
          await bootstrapWithController(world);
        },
      },
      {
        pattern: /^Given the create route has a stored Google API key$/,
        run: async ({ world }) => {
          window.localStorage.setItem("hm:google-api-key", "google-key");
          await destroyPageHandle(world);
          await bootstrapWithController(world);
        },
      },
      {
        pattern: /^Given the create route is showing a streamed partial board$/,
        run: async ({ world }) => {
          await bootstrapWithController(world);
          await act(async () => {
            world.controller?.setState({
              isLoading: true,
              renderablePartialSpec: createGeneratedBoardSpec(),
            });
          });
        },
      },
      {
        pattern: /^(When|Given) the user enters a generation prompt$/,
        run: async ({ world }) => {
          const prompt = world.root?.querySelector<HTMLInputElement>('[data-testid="create-prompt"]');
          if (!prompt) {
            throw new Error("Expected prompt input");
          }
          await act(async () => {
            setInputValue(prompt, "Build a compact departures board");
          });
        },
      },
      {
        pattern: /^When the user starts board generation$/,
        run: async ({ world }) => {
          const button = world.root?.querySelector<HTMLButtonElement>('[data-testid="create-generate"]');
          await act(async () => {
            clickButton(button);
          });
        },
      },
      {
        pattern: /^When the streamed board becomes the last valid spec$/,
        run: async ({ world }) => {
          await act(async () => {
            world.controller?.setState({
              lastValidSpec: createGeneratedBoardSpec(),
            });
          });
        },
      },
      {
        pattern: /^When the generated board loads tram and bus stops$/,
        run: async ({ world }) => {
          world.loadGeneratedDepartures = async ({ onPartial }) => {
            const tramResponse = createSuccessResponse();
            const busResponse = createBusResponse();
            onPartial([tramResponse]);
            onPartial([tramResponse, busResponse]);
            return { responses: [tramResponse, busResponse], routeContext: null, status: "ok" };
          };
          await destroyPageHandle(world);
          await bootstrapWithController(world);
          await act(async () => {
            const prompt = world.root?.querySelector<HTMLInputElement>('[data-testid="create-prompt"]');
            if (!prompt) {
              throw new Error("Expected prompt input");
            }
            setInputValue(prompt, "build a board for tram lines 7 and bus 67");
          });
          await act(async () => {
            const button = world.root?.querySelector<HTMLButtonElement>('[data-testid="create-generate"]');
            clickButton(button);
          });
          await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
          });
        },
      },
      {
        pattern: /^When the generated board loads no extra departures$/,
        run: async ({ world }) => {
          world.loadGeneratedDepartures = async () => ({
            responses: [],
            routeContext: null,
            status: "ok",
          });
          await destroyPageHandle(world);
          await bootstrapWithController(world);
          await act(async () => {
            const prompt = world.root?.querySelector<HTMLInputElement>('[data-testid="create-prompt"]');
            if (!prompt) {
              throw new Error("Expected prompt input");
            }
            setInputValue(prompt, "Build a compact live tram board");
          });
          await act(async () => {
            const button = world.root?.querySelector<HTMLButtonElement>('[data-testid="create-generate"]');
            clickButton(button);
          });
          await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
          });
        },
      },
      {
        pattern: /^When the generated board needs a starting location$/,
        run: async ({ world }) => {
          world.loadGeneratedDepartures = async (input) => {
            if (input.originOverride?.type === "current-location") {
              input.onPartial([createBusResponse()]);
              return { responses: [createBusResponse()], routeContext: null, status: "ok" };
            }
            if (input.originOverride?.type === "typed-location") {
              input.onPartial([createBusResponse()]);
              return { responses: [createBusResponse()], routeContext: null, status: "ok" };
            }
            return {
              message: "Add a starting location or use current location to find departures to Elielinaukio.",
              status: "needs-location",
            };
          };
          await destroyPageHandle(world);
          await bootstrapWithController(world);
          await act(async () => {
            const prompt = world.root?.querySelector<HTMLInputElement>('[data-testid="create-prompt"]');
            if (!prompt) {
              throw new Error("Expected prompt input");
            }
            setInputValue(prompt, "i want to take bus to elielinaukio");
          });
          await act(async () => {
            const button = world.root?.querySelector<HTMLButtonElement>('[data-testid="create-generate"]');
            clickButton(button);
          });
          await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
          });
        },
      },
      {
        pattern: /^When the generated board needs destination clarification$/,
        run: async ({ world }) => {
          world.loadGeneratedDepartures = async (input) => {
            if (input.destinationOverride === "Herttoniemi(M) via Pasila as.") {
              input.onPartial([createBusResponse()]);
              return { responses: [createBusResponse()], routeContext: null, status: "ok" };
            }
            return {
              inputDestination: "Tripla",
              message: 'I could not confidently match "Tripla". Did you mean one of these?',
              mode: "BUS",
              status: "needs-destination-clarification",
              suggestions: ["Herttoniemi(M) via Pasila as.", "Kamppi"],
            };
          };
          await destroyPageHandle(world);
          await bootstrapWithController(world);
          await act(async () => {
            const prompt = world.root?.querySelector<HTMLInputElement>('[data-testid="create-prompt"]');
            if (!prompt) {
              throw new Error("Expected prompt input");
            }
            setInputValue(prompt, "i want to take bus 59 from talontie 17 to tripla");
          });
          await act(async () => {
            const button = world.root?.querySelector<HTMLButtonElement>('[data-testid="create-generate"]');
            clickButton(button);
          });
          await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
          });
        },
      },
      {
        pattern: /^(Given|And) current location resolves to ([\d.]+) and ([\d.]+)$/,
        run: ({ args, world }) => {
          world.locationResult = {
            ok: true,
            value: {
              lat: Number(args[1]),
              lon: Number(args[2]),
            },
          };
        },
      },
      {
        pattern: /^(Given|And) current location is still resolving$/,
        run: ({ world }) => {
          world.currentLocationDeferred = {
            resolve() {},
          };
        },
      },
      {
        pattern: /^(Given|And) current location permission is denied$/,
        run: ({ world }) => {
          world.locationPermissionState = "denied";
          world.locationResult = {
            code: "permission-denied",
            ok: false,
          };
        },
      },
      {
        pattern: /^(Given|And) current location permission is granted$/,
        run: ({ world }) => {
          world.locationPermissionState = "granted";
        },
      },
      {
        pattern: /^(When|And) the user uses current location$/,
        run: async ({ world }) => {
          const button = world.root?.querySelector<HTMLButtonElement>(
            '[data-testid="create-use-current-location"]'
          );
          await act(async () => {
            clickButton(button);
            await Promise.resolve();
            await Promise.resolve();
          });
        },
      },
      {
        pattern: /^When current location resolves to ([\d.]+) and ([\d.]+)$/,
        run: async ({ args, world }) => {
          const deferred = world.currentLocationDeferred;
          if (!deferred) {
            throw new Error("Expected deferred current location");
          }
          world.currentLocationDeferred = undefined;
          await act(async () => {
            deferred.resolve({
              ok: true,
              value: {
                lat: Number(args[0]),
                lon: Number(args[1]),
              },
            });
            await Promise.resolve();
            await Promise.resolve();
          });
        },
      },
      {
        pattern: /^When the user enters prompt (.+)$/,
        run: async ({ args, world }) => {
          const prompt = world.root?.querySelector<HTMLInputElement>('[data-testid="create-prompt"]');
          if (!prompt) {
            throw new Error("Expected prompt input");
          }
          await act(async () => {
            setInputValue(prompt, args[0]);
          });
        },
      },
      {
        pattern: /^When the user enters starting place (.+)$/,
        run: async ({ args, world }) => {
          const input = world.root?.querySelector<HTMLInputElement>(
            '[data-testid="create-starting-location"]'
          );
          if (!input) {
            throw new Error("Expected starting location input");
          }
          await act(async () => {
            setInputValue(input, args[0]);
          });
        },
      },
      {
        pattern: /^(When|And) the user submits starting place$/,
        run: async ({ world }) => {
          const button = world.root?.querySelector<HTMLButtonElement>(
            '[data-testid="create-submit-starting-location"]'
          );
          await act(async () => {
            clickButton(button);
            await Promise.resolve();
            await Promise.resolve();
          });
        },
      },
      {
        pattern: /^When the user chooses suggested destination (.+)$/,
        run: async ({ args, world }) => {
          const buttons = [...(world.root?.querySelectorAll<HTMLButtonElement>('[data-testid="create-destination-suggestion"]') || [])];
          const match = buttons.find((button) => button.textContent?.includes(args[0]));
          await act(async () => {
            clickButton(match);
            await Promise.resolve();
            await Promise.resolve();
          });
        },
      },
      {
        pattern: /^(When|And) the user enters clarified destination (.+)$/,
        run: async ({ args, world }) => {
          const input = world.root?.querySelector<HTMLInputElement>(
            '[data-testid="create-clarified-destination"]'
          );
          if (!input) {
            throw new Error("Expected clarified destination input");
          }
          await act(async () => {
            setInputValue(input, args[1]);
          });
        },
      },
      {
        pattern: /^(When|And) the user submits clarified destination$/,
        run: async ({ world }) => {
          const button = world.root?.querySelector<HTMLButtonElement>(
            '[data-testid="create-submit-clarified-destination"]'
          );
          await act(async () => {
            clickButton(button);
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
          });
        },
      },
      {
        pattern: /^When generation fails after a partial board$/,
        run: async ({ world }) => {
          await act(async () => {
            world.controller?.setState({
              generationError: "Could not generate a board",
              isLoading: false,
              renderablePartialSpec: null,
            });
          });
        },
      },
      {
        pattern: /^When the user stops board generation$/,
        run: async ({ world }) => {
          const button = world.root?.querySelector<HTMLButtonElement>('[data-testid="create-stop"]');
          await act(async () => {
            clickButton(button);
          });
        },
      },
      {
        pattern: /^Given board generation is in progress$/,
        run: async ({ world }) => {
          await act(async () => {
            world.controller?.setState({
              isLoading: true,
            });
          });
        },
      },
      {
        pattern: /^Then the generation prompt is enabled$/,
        run: async ({ assert, world }) => {
          const prompt = world.root?.querySelector<HTMLInputElement>('[data-testid="create-prompt"]');
          assert.equal(prompt?.disabled, false);
          await destroyPageHandle(world);
        },
      },
      {
        pattern: /^Then the generate button is disabled$/,
        run: ({ assert, world }) => {
          const button = world.root?.querySelector<HTMLButtonElement>('[data-testid="create-generate"]');
          assert.equal(button?.disabled, true);
        },
      },
      {
        pattern: /^Then the generate button is enabled$/,
        run: async ({ assert, world }) => {
          const button = world.root?.querySelector<HTMLButtonElement>('[data-testid="create-generate"]');
          assert.equal(button?.disabled, false);
          await destroyPageHandle(world);
        },
      },
      {
        pattern: /^Then the create route shows the missing API key hint$/,
        run: async ({ assert, world }) => {
          const hint = world.root?.querySelector('[data-testid="create-api-key-hint"]');
          assert.equal(hint?.textContent?.includes("Google API key"), true);
          await destroyPageHandle(world);
        },
      },
      {
        pattern: /^Then the generation overlay is visible$/,
        run: async ({ assert, world }) => {
          const overlay = world.root?.querySelector('[data-testid="create-generation-overlay"]');
          assert.equal(Boolean(overlay), true);
          await destroyPageHandle(world);
        },
      },
      {
        pattern: /^Then the create route hides the stop header$/,
        run: async ({ assert, world }) => {
          assert.equal(world.root?.querySelector('[data-testid="stop-header"]') === null, true);
          await destroyPageHandle(world);
        },
      },
      {
        pattern: /^Then the create route shows the departure meta (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.root?.textContent?.includes(args[0]), true);
        },
      },
      {
        pattern: /^Then the create route shows (\d+) mode group headers$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.root?.querySelectorAll('[data-testid="mode-group-header"]').length, Number(args[0]));
        },
      },
      {
        pattern: /^(Then|And) the create route shows the mode group title (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.root?.textContent?.includes(args[1]), true);
        },
      },
      {
        pattern: /^(Then|And) the create route shows the mode group summary (.+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.root?.textContent?.includes(args[1]), true);
        },
      },
      {
        pattern: /^Then the create route renders 2 departure rows$/,
        run: async ({ assert, world }) => {
          assert.equal(world.root?.querySelectorAll('[data-testid="departure-row"]').length, 2);
          await destroyPageHandle(world);
        },
      },
      {
        pattern: /^Then the create route shows the location clarification card$/,
        run: ({ assert, world }) => {
          assert.equal(
            Boolean(world.root?.querySelector('[data-testid="create-location-required-card"]')),
            true
          );
          assert.equal(
            Boolean(world.root?.querySelector('[data-testid="create-use-current-location"]')),
            true
          );
          assert.equal(
            Boolean(world.root?.querySelector('[data-testid="create-starting-location"]')),
            true
          );
        },
      },
      {
        pattern: /^(Then|And) the create route hides the location clarification card$/,
        run: ({ assert, world }) => {
          assert.equal(
            Boolean(world.root?.querySelector('[data-testid="create-location-required-card"]')),
            false
          );
        },
      },
      {
        pattern: /^Then the current location request count is (\d+)$/,
        run: ({ args, assert, world }) => {
          assert.equal(world.currentLocationCallCount || 0, Number(args[0]));
        },
      },
      {
        pattern: /^Then the use current location button is busy$/,
        run: ({ assert, world }) => {
          const button = world.root?.querySelector<HTMLButtonElement>(
            '[data-testid="create-use-current-location"]'
          );
          assert.equal(button?.getAttribute("aria-busy"), "true");
        },
      },
      {
        pattern: /^Then the create route shows the location denied message$/,
        run: ({ assert, world }) => {
          const hint = world.root?.querySelector('[data-testid="create-location-denied-hint"]');
          assert.equal(hint?.textContent?.includes("denied"), true);
        },
      },
      {
        pattern: /^Then the create route shows the destination clarification card$/,
        run: ({ assert, world }) => {
          assert.equal(
            Boolean(world.root?.querySelector('[data-testid="create-destination-required-card"]')),
            true
          );
          assert.equal(
            Boolean(world.root?.querySelector('[data-testid="create-destination-suggestion"]')),
            true
          );
          assert.equal(
            Boolean(world.root?.querySelector('[data-testid="create-clarified-destination"]')),
            true
          );
        },
      },
      {
        pattern: /^(Then|And) the create route shows the destination clarification input Tripla for bus destinations$/,
        run: ({ assert, world }) => {
          const hint = world.root?.querySelector('[data-testid="create-destination-required-hint"]');
          const label = world.root?.querySelector('[data-testid="create-clarified-destination-label"]');
          assert.equal(hint?.textContent?.includes("Tripla"), true);
          assert.equal(hint?.textContent?.toLowerCase().includes("bus destinations"), true);
          assert.equal(label?.textContent?.toLowerCase().includes("bus destination"), true);
        },
      },
      {
        pattern: /^(Then|And) the generation submit count is (\d+)$/,
        run: async ({ args, assert, world }) => {
          assert.equal(world.controller?.getState().submitCount, Number(args[1]));
          await destroyPageHandle(world);
        },
      },
      {
        pattern: /^And the create route shows the departure meta (.+)$/,
        run: async ({ args, assert, world }) => {
          assert.equal(world.root?.textContent?.includes(args[0]), true);
          await destroyPageHandle(world);
        },
      },
      {
        pattern: /^Then the generation stop count is 1$/,
        run: ({ assert, world }) => {
          assert.equal(world.controller?.getState().stopCount, 1);
        },
      },
    ],
  }
);
