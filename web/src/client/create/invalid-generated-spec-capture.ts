const INVALID_GENERATED_SPEC_STORAGE_KEY = "hm:last-invalid-generated-spec";

interface InvalidGeneratedSpecCapture {
  capturedAt: string;
  error: string;
  input: unknown;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  return window.localStorage;
}

export function captureInvalidGeneratedSpec(input: unknown, error: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const payload: InvalidGeneratedSpecCapture = {
    capturedAt: new Date().toISOString(),
    error,
    input,
  };
  storage.setItem(INVALID_GENERATED_SPEC_STORAGE_KEY, JSON.stringify(payload));
}

export function readInvalidGeneratedSpecCapture(): InvalidGeneratedSpecCapture | null {
  const rawValue = getStorage()?.getItem(INVALID_GENERATED_SPEC_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as InvalidGeneratedSpecCapture;
  } catch {
    return null;
  }
}

export function clearInvalidGeneratedSpecCapture(): void {
  getStorage()?.removeItem(INVALID_GENERATED_SPEC_STORAGE_KEY);
}
