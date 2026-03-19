import { promptRequiresStartingLocation } from "./prompt-departure-requests";

function isIntentCanvasPrompt(prompt: string): boolean {
  return /\b(?:let'?s go|get me|go to|take .* to|i want to go)\b/i.test(prompt);
}

export function shouldSubmitLegacyGeneration(input: {
  hasLoadGeneratedDepartures: boolean;
  prompt: string;
}): boolean {
  if (isIntentCanvasPrompt(input.prompt)) {
    return false;
  }

  if (!input.hasLoadGeneratedDepartures) {
    return true;
  }

  return !promptRequiresStartingLocation(input.prompt);
}
