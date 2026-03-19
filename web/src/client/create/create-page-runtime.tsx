import { createStateStore } from "@json-render/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  buildDestinationClarificationMessage,
  CreateClarificationPanels,
} from "./create-clarification-panels";
import { CreateLegacyGenerationCoordinator } from "./create-legacy-generation-coordinator";
import {
  createFreshIntentSession,
  getSessionPromptTitle,
  showDestinationClarificationInSession,
  showLocationClarificationInSession,
  submitPromptToSession,
  updateSessionDraft,
} from "./intent-session-flow";
import {
  applyCurrentLocationResult,
  shouldAutoResolveCurrentLocation,
} from "./current-location-flow";
import {
  createMultiDepartureBoardState,
  type CreateDepartureBoardState,
} from "./departure-board-state";
import {
  beginPromptFlowRequest,
  clearPromptFlowClarification,
  createPromptFlowEmptyState,
  type PromptFlowState,
} from "./prompt-flow-state";
import {
  createRouteCanvasDataState,
  createRouteCanvasEmptyState,
  resolveRouteCanvasDataState,
} from "./route-canvas-state";
import { type RoutePolicy } from "./intent-session";
import { useGenerateBoard, type UseGenerateBoardOptions } from "./use-generate-board";
import type { PromptDeparturesLoadResult, PromptOriginOverride } from "./load-prompt-departures";
import type { AlertsSuccessResponse } from "@shared/contracts/alerts-contract";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { RouteItinerary, RoutePlanRequest } from "@shared/contracts/routes-contract";
import type { LocationPermissionState, LocationResult } from "@client/services/location-service";

export interface CreatePageRuntimeProps {
  fetchAlerts?: (input: { routeIds: string[]; stopIds: string[] }) => Promise<AlertsSuccessResponse>;
  fetchRoutes?: (input: RoutePlanRequest) => Promise<RouteItinerary[]>;
  loadGeneratedDepartures?: (input: {
    destinationOverride?: string | null;
    originOverride?: PromptOriginOverride | null;
    onPartial: (responses: DeparturesSuccessResponse[]) => void;
    prompt: string;
    signal: AbortSignal;
  }) => Promise<PromptDeparturesLoadResult>;
  nowMs?: () => number;
  resolveCurrentLocation?: () => Promise<LocationResult>;
  resolveLocationPermission?: () => Promise<LocationPermissionState>;
  state: CreateDepartureBoardState;
  useGenerateBoardHook?: (options: UseGenerateBoardOptions) => ReturnType<typeof useGenerateBoard>;
}

interface PageShellProps {
  children: ReactNode;
}

export function CreatePageShell({ children }: PageShellProps) {
  return (
    <div className="create-page-shell">
      <header className="create-page-topbar">
        <div>
          <p className="create-page-eyebrow">Data-first board builder</p>
          <h1 className="create-page-heading">Create a custom departure board</h1>
        </div>
      </header>
      <main className="create-page-main">{children}</main>
    </div>
  );
}

export function CreateLoadingView() {
  return (
    <section aria-label="Loading departures" className="create-feedback-card create-loading-card">
      <div className="create-skeleton create-skeleton-title" />
      <div className="create-skeleton create-skeleton-row" />
      <div className="create-skeleton create-skeleton-row" />
      <div className="create-skeleton create-skeleton-row" />
    </section>
  );
}

export function CreateErrorView() {
  return (
    <section className="create-feedback-card create-error-card" data-testid="create-error">
      <p className="create-error-kicker">Departures unavailable</p>
      <h2>Could not load departures.</h2>
      <p>Check the departures API response and try again.</p>
    </section>
  );
}

export function CreatePageRuntime({
  fetchAlerts,
  fetchRoutes,
  loadGeneratedDepartures,
  nowMs = Date.now,
  resolveCurrentLocation,
  resolveLocationPermission,
  state,
  useGenerateBoardHook = useGenerateBoard,
}: CreatePageRuntimeProps) {
  const [boardState, setBoardState] = useState(state);
  const [currentLocationPreference, setCurrentLocationPreference] = useState(false);
  const [isResolvingCurrentLocation, setIsResolvingCurrentLocation] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [promptFlow, setPromptFlow] = useState<PromptFlowState>(createPromptFlowEmptyState);
  const [routePolicy, setRoutePolicy] = useState<RoutePolicy>("fastest");
  const [routeCanvasState, setRouteCanvasState] = useState(createRouteCanvasEmptyState);
  const intentSessionRef = useRef(createFreshIntentSession());
  const storeRef = useRef(
    createStateStore({
      departures: state.departures,
      onRoutePolicyChange: null,
      routePolicy: "fastest",
      routeCanvas: null,
      sections: state.sections,
      stopCode: state.stopCode,
      stopName: state.stopName,
    })
  );
  const loadAbortRef = useRef<AbortController | null>(null);

  function requestCurrentLocation(promptToUse: string): void {
    if (!resolveCurrentLocation || isResolvingCurrentLocation) {
      return;
    }

    setIsResolvingCurrentLocation(true);
    void resolveCurrentLocation()
      .then((result) => {
        const nextState = applyCurrentLocationResult({
          prompt: promptToUse,
          promptFlow,
          result,
          useCurrentLocationPreference: currentLocationPreference,
        });
        setCurrentLocationPreference(nextState.useCurrentLocationPreference);
        setPromptFlow(nextState.promptFlow);
      })
      .finally(() => {
        setIsResolvingCurrentLocation(false);
      });
  }

  useEffect(() => {
    setBoardState(state);
    setPromptFlow(createPromptFlowEmptyState());
    setRouteCanvasState(createRouteCanvasEmptyState());
    setRoutePolicy("fastest");
    intentSessionRef.current = createFreshIntentSession();
  }, [state]);

  useEffect(() => {
    storeRef.current.update({
      departures: boardState.departures,
      onRoutePolicyChange: setRoutePolicy,
      routePolicy,
      routeCanvas: routeCanvasState.routeCanvas,
      sections: boardState.sections,
      stopCode: boardState.stopCode,
      stopName: boardState.stopName,
    });
  }, [boardState, routeCanvasState, routePolicy]);

  useEffect(() => {
    const title = intentSessionRef.current.getState().submittedIntent;
    if (!title || routeCanvasState.responses.length === 0) {
      return;
    }
    setRouteCanvasState((current) =>
      createRouteCanvasDataState({
        alerts: current.alerts,
        itineraries: current.itineraries,
        nowMs: nowMs(),
        policy: routePolicy,
        responses: current.responses,
        title,
      })
    );
  }, [nowMs, routeCanvasState.responses.length, routePolicy]);

  useEffect(() => {
    const pendingRequest = promptFlow.pendingRequest;
    if (!pendingRequest || !loadGeneratedDepartures) {
      return;
    }

    loadAbortRef.current?.abort();
    const abortController = new AbortController();
    loadAbortRef.current = abortController;

    void loadGeneratedDepartures({
      originOverride: pendingRequest.originOverride,
      destinationOverride: pendingRequest.destinationOverride,
      onPartial: (responses) => {
        if (abortController.signal.aborted) {
          return;
        }
        setPromptFlow((current) => clearPromptFlowClarification(current));
        setRouteCanvasState(
          createRouteCanvasDataState({
            alerts: [],
            itineraries: null,
            nowMs: nowMs(),
            policy: routePolicy,
            responses,
            title: getSessionPromptTitle(intentSessionRef.current, pendingRequest.prompt),
          })
        );
        setBoardState(
          createMultiDepartureBoardState({
            nowMs: nowMs(),
            responses,
          })
        );
      },
      prompt: pendingRequest.prompt,
      signal: abortController.signal,
    })
      .then(async (result) => {
        if (abortController.signal.aborted) {
          return;
        }
        if (result.status === "needs-location") {
          const permissionState = resolveLocationPermission
            ? await resolveLocationPermission()
            : undefined;
          if (
            shouldAutoResolveCurrentLocation({
              hasResolver: Boolean(resolveCurrentLocation),
              permissionState,
              useCurrentLocationPreference: currentLocationPreference,
            })
          ) {
            requestCurrentLocation(pendingRequest.prompt);
            return;
          }

          setPromptFlow(showLocationClarificationInSession(intentSessionRef.current, result.message));
        }
        if (result.status === "needs-destination-clarification") {
          setPromptFlow(
            showDestinationClarificationInSession(intentSessionRef.current, {
              inputDestination: result.inputDestination,
              message:
                result.message ||
                buildDestinationClarificationMessage({
                  inputDestination: result.inputDestination,
                  mode: result.mode,
                }),
              mode: result.mode,
              originOverride: pendingRequest.originOverride,
              suggestions: result.suggestions,
            })
          );
        }
        if (result.status === "ok") {
          setRouteCanvasState(
            await resolveRouteCanvasDataState({
              fetchAlerts,
              fetchRoutes,
              nowMs: nowMs(),
              policy: routePolicy,
              responses: result.responses,
              routeContext: result.routeContext,
              title: getSessionPromptTitle(intentSessionRef.current, pendingRequest.prompt),
            })
          );
        }
      })
      .catch(() => {
        if (abortController.signal.aborted) {
          return;
        }
        setRouteCanvasState(createRouteCanvasEmptyState());
        setBoardState(state);
      });

    return () => {
      abortController.abort();
    };
  }, [
    loadGeneratedDepartures,
    nowMs,
    promptFlow.pendingRequest,
    currentLocationPreference,
    fetchRoutes,
    fetchAlerts,
    resolveCurrentLocation,
    resolveLocationPermission,
    routePolicy,
    state,
  ]);

  return (
    <div className="create-board-layout">
      <CreateLegacyGenerationCoordinator
        loadGeneratedDepartures={loadGeneratedDepartures}
        onGenerate={(nextPrompt) => {
          submitPromptToSession(intentSessionRef.current, nextPrompt);
          setPromptFlow(beginPromptFlowRequest(nextPrompt));
          setRoutePolicy("fastest");
          setRouteCanvasState(createRouteCanvasEmptyState());
        }}
        onPromptChange={(nextPrompt) => {
          setPrompt(nextPrompt);
          updateSessionDraft(intentSessionRef.current, nextPrompt);
          setPromptFlow(createPromptFlowEmptyState());
        }}
        onStop={() => {
          setPromptFlow(createPromptFlowEmptyState());
          setRoutePolicy("fastest");
          setRouteCanvasState(createRouteCanvasEmptyState());
          setBoardState(state);
        }}
        prompt={prompt}
        routeCanvas={routeCanvasState.routeCanvas}
        store={storeRef.current}
        useGenerateBoardHook={useGenerateBoardHook}
      >
        <CreateClarificationPanels
          isResolvingCurrentLocation={isResolvingCurrentLocation}
          promptFlow={promptFlow}
          requestCurrentLocation={requestCurrentLocation}
          resolveCurrentLocation={resolveCurrentLocation}
          setPromptFlow={setPromptFlow}
        />
      </CreateLegacyGenerationCoordinator>
    </div>
  );
}
