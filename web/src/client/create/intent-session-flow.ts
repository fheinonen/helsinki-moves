import {
  createIntentSession,
  type IntentSession,
} from "./intent-session";
import { showPromptFlowClarification, type PromptFlowState } from "./prompt-flow-state";
import type { PromptOriginOverride } from "./load-prompt-departures";
import type { Mode } from "@shared/domain/mode";

export function createFreshIntentSession(): IntentSession {
  return createIntentSession();
}

export function updateSessionDraft(session: IntentSession, prompt: string): void {
  session.setDraftIntent(prompt);
}

export function submitPromptToSession(session: IntentSession, prompt: string): void {
  session.setDraftIntent(prompt);
  session.submitDraft();
}

export function getSessionPromptTitle(session: IntentSession, fallbackPrompt: string): string {
  return session.getState().submittedIntent || fallbackPrompt;
}

export function showLocationClarificationInSession(
  session: IntentSession,
  message: string
): PromptFlowState {
  session.showLocationClarification(message);
  return showPromptFlowClarification(session.getState().visible);
}

export function showDestinationClarificationInSession(
  session: IntentSession,
  input: {
    inputDestination: string;
    message: string;
    mode: Mode;
    originOverride?: PromptOriginOverride | null;
    suggestions: string[];
  }
): PromptFlowState {
  session.showDestinationClarification(input);
  return showPromptFlowClarification(session.getState().visible);
}
