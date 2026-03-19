import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import {
  CreateErrorView,
  CreateLoadingView,
  CreatePageRuntime,
  CreatePageShell,
} from "./create-page-runtime";
import { createDepartureBoardState } from "./departure-board-state";
import { type UseGenerateBoardOptions, useGenerateBoard } from "./use-generate-board";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";
import type { AlertsSuccessResponse } from "@shared/contracts/alerts-contract";
import type { RouteItinerary, RoutePlanRequest } from "@shared/contracts/routes-contract";
import type { PromptDeparturesLoadResult, PromptOriginOverride } from "./load-prompt-departures";
import type { LocationResult } from "@client/services/location-service";
import type { LocationPermissionState } from "@client/services/location-service";

interface BootstrapCreatePageOptions {
  fetchAlerts?: (input: { routeIds: string[]; stopIds: string[] }) => Promise<AlertsSuccessResponse>;
  documentRef: Document;
  fetchDepartures: () => Promise<DeparturesSuccessResponse>;
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
  root: HTMLElement;
  useGenerateBoardHook?: (options: UseGenerateBoardOptions) => ReturnType<typeof useGenerateBoard>;
}

function renderPage(root: Root, view: ReactNode): void {
  root.render(<CreatePageShell>{view}</CreatePageShell>);
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

export async function bootstrapCreatePage(
  options: BootstrapCreatePageOptions
): Promise<{ destroy: () => void }> {
  options.documentRef.documentElement.setAttribute("data-page", "create");
  const root = createRoot(options.root);
  renderPage(root, <CreateLoadingView />);
  await settle();

  try {
    const response = await options.fetchDepartures();
    const state = createDepartureBoardState({
      nowMs: (options.nowMs || Date.now)(),
      response,
    });
    renderPage(
      root,
      <CreatePageRuntime
        fetchAlerts={options.fetchAlerts}
        loadGeneratedDepartures={options.loadGeneratedDepartures}
        fetchRoutes={options.fetchRoutes}
        nowMs={options.nowMs}
        resolveCurrentLocation={options.resolveCurrentLocation}
        resolveLocationPermission={options.resolveLocationPermission}
        state={state}
        useGenerateBoardHook={options.useGenerateBoardHook}
      />
    );
  } catch {
    renderPage(root, <CreateErrorView />);
  }

  await settle();
  return {
    destroy() {
      root.unmount();
    },
  };
}
