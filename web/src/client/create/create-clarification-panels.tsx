import {
  continuePromptFlowWithSuggestedDestination,
  continuePromptFlowWithTypedDestination,
  continuePromptFlowWithTypedLocation,
  markPromptFlowLocationDenied,
  setPromptFlowTypedDestination,
  setPromptFlowTypedLocation,
  type PromptFlowState,
} from "./prompt-flow-state";
import type { Mode } from "@shared/domain/mode";

function formatModeDestinationLabel(mode: Mode): string {
  switch (mode) {
    case "BUS":
      return "Bus destination";
    case "METRO":
      return "Metro destination";
    case "RAIL":
      return "Rail destination";
    case "TRAM":
      return "Tram destination";
  }
}

function formatModeDestinationsPhrase(mode: Mode): string {
  switch (mode) {
    case "BUS":
      return "bus destinations";
    case "METRO":
      return "metro destinations";
    case "RAIL":
      return "rail destinations";
    case "TRAM":
      return "tram destinations";
  }
}

export function buildDestinationClarificationMessage(input: {
  inputDestination: string;
  mode: Mode;
}): string {
  return `I couldn't confidently match "${input.inputDestination}" for ${formatModeDestinationsPhrase(input.mode)}. Choose one of these or enter a different ${formatModeDestinationLabel(input.mode).toLowerCase()}.`;
}

interface CreateClarificationPanelsProps {
  isResolvingCurrentLocation: boolean;
  promptFlow: PromptFlowState;
  resolveCurrentLocation?: (() => Promise<unknown>) | undefined;
  requestCurrentLocation: (prompt: string) => void;
  setPromptFlow: React.Dispatch<React.SetStateAction<PromptFlowState>>;
}

export function CreateClarificationPanels({
  isResolvingCurrentLocation,
  promptFlow,
  resolveCurrentLocation,
  requestCurrentLocation,
  setPromptFlow,
}: CreateClarificationPanelsProps) {
  const destinationClarification =
    promptFlow.clarification?.type === "destination" ? promptFlow.clarification : null;
  const locationClarification =
    promptFlow.clarification?.type === "location" ? promptFlow.clarification : null;

  if (!locationClarification && !destinationClarification) {
    return null;
  }

  return (
    <>
      {locationClarification ? (
        <section className="create-feedback-card" data-testid="create-location-required-card">
          <p className="create-hint" data-testid="create-location-required-hint">
            {locationClarification.message}
          </p>
          {locationClarification.deniedMessage ? (
            <p className="create-error-text" data-testid="create-location-denied-hint">
              {locationClarification.deniedMessage}
            </p>
          ) : null}
          <div className="create-actions">
            <button
              className="create-action-button"
              aria-busy={isResolvingCurrentLocation ? "true" : "false"}
              data-testid="create-use-current-location"
              disabled={isResolvingCurrentLocation}
              onClick={() => {
                if (!resolveCurrentLocation) {
                  setPromptFlow((current) =>
                    markPromptFlowLocationDenied(
                      current,
                      "Location access was denied. Enter your starting place to continue."
                    )
                  );
                  return;
                }
                requestCurrentLocation(locationClarification.prompt);
              }}
              type="button"
            >
              {isResolvingCurrentLocation ? "Using current location..." : "Use current location"}
            </button>
          </div>
          <label className="create-control-field">
            <span className="create-control-label">Starting place</span>
            <input
              className="create-page-prompt"
              data-testid="create-starting-location"
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                setPromptFlow((current) => setPromptFlowTypedLocation(current, nextValue));
              }}
              placeholder="Enter your starting place"
              type="text"
              value={promptFlow.typedLocation}
            />
          </label>
          <div className="create-actions">
            <button
              className="create-action-button create-action-button-secondary"
              data-testid="create-submit-starting-location"
              disabled={!promptFlow.typedLocation.trim()}
              onClick={() => setPromptFlow((current) => continuePromptFlowWithTypedLocation(current))}
              type="button"
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}
      {destinationClarification ? (
        <section className="create-feedback-card" data-testid="create-destination-required-card">
          <p className="create-hint" data-testid="create-destination-required-hint">
            {buildDestinationClarificationMessage({
              inputDestination: destinationClarification.inputDestination,
              mode: destinationClarification.mode,
            })}
          </p>
          <div className="create-actions">
            {destinationClarification.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                className="create-action-button"
                aria-busy="false"
                data-testid="create-destination-suggestion"
                onClick={() =>
                  setPromptFlow((current) =>
                    continuePromptFlowWithSuggestedDestination(current, suggestion)
                  )
                }
                type="button"
              >
                {suggestion}
              </button>
            ))}
          </div>
          <label className="create-control-field">
            <span className="create-control-label" data-testid="create-clarified-destination-label">
              {formatModeDestinationLabel(destinationClarification.mode)}
            </span>
            <input
              className="create-page-prompt"
              data-testid="create-clarified-destination"
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                setPromptFlow((current) => setPromptFlowTypedDestination(current, nextValue));
              }}
              placeholder={`Enter a different ${formatModeDestinationLabel(destinationClarification.mode).toLowerCase()}`}
              type="text"
              value={promptFlow.typedDestination}
            />
          </label>
          <div className="create-actions">
            <button
              className="create-action-button create-action-button-secondary"
              data-testid="create-submit-clarified-destination"
              disabled={!promptFlow.typedDestination.trim()}
              onClick={() => setPromptFlow((current) => continuePromptFlowWithTypedDestination(current))}
              type="button"
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}
    </>
  );
}
