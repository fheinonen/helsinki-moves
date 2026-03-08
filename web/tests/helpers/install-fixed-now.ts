import type { Page } from "@playwright/test";

export async function installFixedNow(page: Page, nowMs: number): Promise<void> {
  await page.addInitScript((fixedTimeMs) => {
    Object.defineProperty(Date, "now", {
      configurable: true,
      value: () => fixedTimeMs,
    });
  }, nowMs);
}
