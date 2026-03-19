import { createStateStore, JSONUIProvider, Renderer } from "@json-render/react";
import { useEffect, useState, type ReactNode } from "react";
import type { RouteCanvasViewModel } from "./canvas-view-model";
import { CreateLegacyControls } from "./create-legacy-controls";
import { defaultSpec } from "./default-spec";
import { renderBlockPlan } from "./render-block-plan";
import { shouldSubmitLegacyGeneration } from "./legacy-generation-flow";
import { createRouteRegistry } from "./registry";
import { readGoogleApiKey, writeGoogleApiKey } from "./api-key-storage";
import { useGenerateBoard, type UseGenerateBoardOptions } from "./use-generate-board";
import { createBlockPlanForRouteCanvas, createBlockPlanFromIntent } from "./block-plan-from-intent";
import type { PromptDeparturesLoadResult, PromptOriginOverride } from "./load-prompt-departures";
import type { DeparturesSuccessResponse } from "@shared/contracts/departures-contract";

function CreateGenerationOverlay() {
  return (
    <div className="create-generation-overlay" data-testid="create-generation-overlay">
      <div className="create-feedback-card create-loading-card">
        <p className="create-page-eyebrow">Generating layout</p>
        <div className="create-skeleton create-skeleton-title" />
        <div className="create-skeleton create-skeleton-row" />
        <div className="create-skeleton create-skeleton-row" />
      </div>
    </div>
  );
}

function buildIntentCanvasSpec(routeCanvas: RouteCanvasViewModel | null) {
  if (routeCanvas) {
    return renderBlockPlan(createBlockPlanForRouteCanvas(routeCanvas).plan);
  }

  return renderBlockPlan(
    createBlockPlanFromIntent({
      destinationResolved: true,
      homeSaved: true,
      intentKind: "destination",
      proposedBlocks: [
        "primary_route",
        "backup_route",
        "route_explanation",
        "itinerary_details",
        "policy_switch",
      ],
    }).plan
  );
}

interface CreateLegacyGenerationCoordinatorProps {
  children?: ReactNode;
  loadGeneratedDepartures?: (input: {
    destinationOverride?: string | null;
    onPartial: (responses: DeparturesSuccessResponse[]) => void;
    originOverride?: PromptOriginOverride | null;
    prompt: string;
    signal: AbortSignal;
  }) => Promise<PromptDeparturesLoadResult>;
  onGenerate: (prompt: string) => void;
  onPromptChange: (prompt: string) => void;
  onStop: () => void;
  prompt: string;
  routeCanvas: RouteCanvasViewModel | null;
  store: ReturnType<typeof createStateStore>;
  useGenerateBoardHook?: (options: UseGenerateBoardOptions) => ReturnType<typeof useGenerateBoard>;
}

export function CreateLegacyGenerationCoordinator({
  children,
  loadGeneratedDepartures,
  onGenerate,
  onPromptChange,
  onStop,
  prompt,
  routeCanvas,
  store,
  useGenerateBoardHook = useGenerateBoard,
}: CreateLegacyGenerationCoordinatorProps) {
  const [apiKey, setApiKey] = useState(() => readGoogleApiKey());
  const generation = useGenerateBoardHook({
    apiKey,
    initialSpec: defaultSpec,
  });

  useEffect(() => {
    writeGoogleApiKey(apiKey);
  }, [apiKey]);

  const missingApiKey = !apiKey.trim();
  const canGenerate = prompt.trim().length > 0 && !generation.isLoading;
  const activeSpec =
    routeCanvas ? buildIntentCanvasSpec(routeCanvas) : generation.renderablePartialSpec || generation.lastValidSpec;

  return (
    <>
      <section className="create-controls-card">
        <CreateLegacyControls
          apiKey={apiKey}
          canGenerate={canGenerate}
          generationError={generation.generationError}
          isGenerating={generation.isLoading}
          missingApiKey={missingApiKey}
          onApiKeyChange={setApiKey}
          onGenerate={() => {
            const nextPrompt = prompt.trim();
            onGenerate(nextPrompt);
            if (
              shouldSubmitLegacyGeneration({
                hasLoadGeneratedDepartures: Boolean(loadGeneratedDepartures),
                prompt: nextPrompt,
              })
            ) {
              generation.submit({ prompt });
            }
          }}
          onPromptChange={onPromptChange}
          onStop={() => {
            onStop();
            generation.stop();
          }}
          prompt={prompt}
        />
        {children}
      </section>
      <div className="create-board-stage">
        {generation.isLoading && !generation.renderablePartialSpec ? <CreateGenerationOverlay /> : null}
        <JSONUIProvider registry={createRouteRegistry} store={store}>
          <Renderer registry={createRouteRegistry} spec={activeSpec} />
        </JSONUIProvider>
      </div>
    </>
  );
}
