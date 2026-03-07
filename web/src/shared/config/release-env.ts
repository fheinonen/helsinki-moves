export interface ReleaseEnvValidation {
  missingRequired: string[];
  optionalUnset: string[];
}

export const REQUIRED_RELEASE_ENV_VARS = [
  "DIGITRANSIT_API_KEY",
  "SPEECH_TRANSCRIBE_API_KEY",
  "SPEECH_TRANSCRIBE_MODEL",
] as const;

export const OPTIONAL_RELEASE_ENV_VARS = [
  "SPEECH_TRANSCRIBE_API_URL",
  "SPEECH_TRANSCRIBE_LANGUAGE",
  "OPENAI_API_KEY",
] as const;

function hasValue(value: unknown): boolean {
  return String(value || "").trim().length > 0;
}

export function validateReleaseEnv(
  env: Record<string, string | undefined>
): ReleaseEnvValidation {
  return {
    missingRequired: REQUIRED_RELEASE_ENV_VARS.filter((name) => !hasValue(env[name])),
    optionalUnset: OPTIONAL_RELEASE_ENV_VARS.filter((name) => !hasValue(env[name])),
  };
}
