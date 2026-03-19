interface CreateLegacyControlsProps {
  apiKey: string;
  canGenerate: boolean;
  generationError: string | null;
  isGenerating: boolean;
  missingApiKey: boolean;
  onApiKeyChange: (value: string) => void;
  onGenerate: () => void;
  onPromptChange: (value: string) => void;
  onStop: () => void;
  prompt: string;
}

export function CreateLegacyControls({
  apiKey,
  canGenerate,
  generationError,
  isGenerating,
  missingApiKey,
  onApiKeyChange,
  onGenerate,
  onPromptChange,
  onStop,
  prompt,
}: CreateLegacyControlsProps) {
  return (
    <>
      <label className="create-control-field">
        <span className="create-control-label">Prompt</span>
        <input
          aria-label="Board prompt"
          className="create-page-prompt"
          data-testid="create-prompt"
          onChange={(event) => onPromptChange(event.currentTarget.value)}
          placeholder="Describe the board you want to build"
          type="text"
          value={prompt}
        />
      </label>
      <label className="create-control-field">
        <span className="create-control-label">Google API key</span>
        <input
          aria-label="Google API key"
          className="create-page-prompt create-page-api-key"
          data-testid="create-api-key"
          onChange={(event) => onApiKeyChange(event.currentTarget.value)}
          placeholder="Paste your Google Generative AI API key"
          type="password"
          value={apiKey}
        />
      </label>
      <div className="create-actions">
        <button
          className="create-action-button"
          aria-busy={isGenerating}
          data-testid="create-generate"
          disabled={!canGenerate}
          onClick={onGenerate}
          type="button"
        >
          Generate
        </button>
        <button
          className="create-action-button create-action-button-secondary"
          data-testid="create-stop"
          disabled={!isGenerating}
          onClick={onStop}
          type="button"
        >
          Stop
        </button>
      </div>
      {missingApiKey ? (
        <p className="create-hint" data-testid="create-api-key-hint">
          Add a Google API key to enable board generation.
        </p>
      ) : null}
      {generationError ? (
        <p className="create-error-text" data-testid="create-generation-error">
          {generationError}
        </p>
      ) : null}
    </>
  );
}
