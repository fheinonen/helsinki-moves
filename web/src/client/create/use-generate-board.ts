import { createSpecStreamCompiler, diffToPatches, type Spec } from "@json-render/core";
import { useMemo, useRef, useState } from "react";
import { defaultSpec } from "./default-spec";
import { sanitizeCreateRouteSpec, validateCreateRouteSpec } from "./generated-spec-validation";
import { buildNoOpFallbackSpec } from "./no-op-fallback-spec";

export interface UseGenerateBoardOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  initialSpec?: Spec;
}

export interface UseGenerateBoardResult {
  appliedPrompt: string | null;
  generationError: string | null;
  isLoading: boolean;
  lastValidSpec: Spec;
  renderablePartialSpec: Spec | null;
  stop: () => void;
  submit: (input: { prompt: string }) => void;
}

const NO_OP_GENERATION_ERROR = "Generated board made no changes.";

function mapProviderErrorMessage(message: string): string {
  if (message.includes("Invalid Google API key")) {
    return "Invalid Google API key";
  }
  if (message.includes("Google rate limit reached")) {
    return "Google rate limit reached";
  }
  return "Could not generate a board";
}

function toClientError(message: string): string {
  if (message === NO_OP_GENERATION_ERROR || message.startsWith("Generated ") || message.startsWith("Spec ")) {
    return message;
  }
  return mapProviderErrorMessage(message);
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return String(payload.error || "");
  } catch {
    return "";
  }
}

function hasMeaningfulDiff(previousSpec: Spec, nextSpec: Spec): boolean {
  return (
    diffToPatches(
      previousSpec as unknown as Record<string, unknown>,
      nextSpec as unknown as Record<string, unknown>
    ).length > 0
  );
}

export function buildNoOpRetryPrompt(prompt: string): string {
  return [
    prompt.trim(),
    "",
    'Return a non-empty JSONL patch stream.',
    'At minimum, replace "/elements/board/props/title" with a concise title based on the request.',
  ].join("\n");
}

export function useGenerateBoard(options: UseGenerateBoardOptions): UseGenerateBoardResult {
  const initialSpec = useMemo(() => options.initialSpec || defaultSpec, [options.initialSpec]);
  const fetchImpl = options.fetchImpl || fetch;
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastValidSpec, setLastValidSpec] = useState<Spec>(initialSpec);
  const [appliedPrompt, setAppliedPrompt] = useState<string | null>(null);
  const [renderablePartialSpec, setRenderablePartialSpec] = useState<Spec | null>(null);
  const activeRequestIdRef = useRef(0);
  const noOpRetryCountRef = useRef(0);
  const promptRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);

  async function runGeneration(prompt: string, baselineSpec: Spec, requestId: number): Promise<void> {
    const abortController = new AbortController();
    abortRef.current = abortController;

    const response = await fetchImpl("/api/v1/generate-ui", {
      body: JSON.stringify({
        currentTree: baselineSpec,
        prompt,
      }),
      headers: {
        ...(options.apiKey ? { "x-api-key": options.apiKey } : {}),
        "content-type": "application/json",
      },
      method: "POST",
      signal: abortController.signal,
    });

    if (requestId !== activeRequestIdRef.current) {
      return;
    }

    if (!response.ok) {
      const message = await readErrorMessage(response);
      throw new Error(mapProviderErrorMessage(message));
    }

    if (!response.body) {
      throw new Error("Could not generate a board");
    }

    const compiler = createSpecStreamCompiler<Spec>(baselineSpec);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (requestId !== activeRequestIdRef.current) {
        return;
      }

      const { newPatches, result } = compiler.push(decoder.decode(value, { stream: true }));
      if (newPatches.length > 0) {
        setRenderablePartialSpec(sanitizeCreateRouteSpec(result as Spec));
      }
    }

    const trailingChunk = decoder.decode();
    if (trailingChunk) {
      const { newPatches, result } = compiler.push(trailingChunk);
      if (newPatches.length > 0) {
        setRenderablePartialSpec(sanitizeCreateRouteSpec(result as Spec));
      }
    }

    const finalSpec = sanitizeCreateRouteSpec(compiler.getResult() as Spec);
    if (!hasMeaningfulDiff(baselineSpec, finalSpec)) {
      if (noOpRetryCountRef.current === 0 && promptRef.current) {
        noOpRetryCountRef.current = 1;
        setRenderablePartialSpec(null);
        await runGeneration(buildNoOpRetryPrompt(promptRef.current), baselineSpec, requestId);
        return;
      }

      const fallbackSpec = buildNoOpFallbackSpec(promptRef.current, baselineSpec);
      if (fallbackSpec) {
        setGenerationError(null);
        setAppliedPrompt(promptRef.current);
        setLastValidSpec(fallbackSpec);
        setRenderablePartialSpec(null);
        noOpRetryCountRef.current = 0;
        return;
      }

      setGenerationError(null);
      setAppliedPrompt(promptRef.current);
      setLastValidSpec(baselineSpec);
      setRenderablePartialSpec(null);
      noOpRetryCountRef.current = 0;
      return;
    }

    const validation = validateCreateRouteSpec(finalSpec);
    if (!validation.ok) {
      throw new Error(validation.error);
    }

    setGenerationError(null);
    setAppliedPrompt(promptRef.current);
    setLastValidSpec(validation.spec);
    setRenderablePartialSpec(null);
    noOpRetryCountRef.current = 0;
  }

  function stop(): void {
    activeRequestIdRef.current += 1;
    noOpRetryCountRef.current = 0;
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    setGenerationError(null);
    setRenderablePartialSpec(null);
  }

  function submit(input: { prompt: string }): void {
    const prompt = String(input.prompt || "").trim();
    if (!prompt) {
      return;
    }

    promptRef.current = prompt;
    noOpRetryCountRef.current = 0;
    const requestId = activeRequestIdRef.current + 1;
    activeRequestIdRef.current = requestId;
    setGenerationError(null);
    setRenderablePartialSpec(null);
    setIsLoading(true);

    void runGeneration(prompt, lastValidSpec, requestId)
      .catch((error: unknown) => {
        if (requestId !== activeRequestIdRef.current) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        setGenerationError(toClientError(message));
        setRenderablePartialSpec(null);
      })
      .finally(() => {
        if (requestId !== activeRequestIdRef.current) {
          return;
        }
        abortRef.current = null;
        setIsLoading(false);
      });
  }

  return {
    appliedPrompt,
    generationError,
    isLoading,
    lastValidSpec,
    renderablePartialSpec,
    stop,
    submit,
  };
}
