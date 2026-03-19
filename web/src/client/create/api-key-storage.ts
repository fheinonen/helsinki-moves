const GOOGLE_API_KEY_STORAGE_KEY = "hm:google-api-key";

function getStorage(): Storage | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  return window.localStorage;
}

export function readGoogleApiKey(): string {
  return getStorage()?.getItem(GOOGLE_API_KEY_STORAGE_KEY) || "";
}

export function writeGoogleApiKey(value: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const nextValue = String(value || "").trim();
  if (!nextValue) {
    storage.removeItem(GOOGLE_API_KEY_STORAGE_KEY);
    return;
  }

  storage.setItem(GOOGLE_API_KEY_STORAGE_KEY, nextValue);
}
