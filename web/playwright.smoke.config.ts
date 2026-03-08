import { defineConfig, devices } from "@playwright/test";

const baseURL = String(process.env.SMOKE_BASE_URL || "").trim();

if (!baseURL) {
  throw new Error("SMOKE_BASE_URL is required for playwright.smoke.config.ts");
}

export default defineConfig({
  testDir: "./tests/smoke",
  testMatch: ["**/*.spec.ts"],
  timeout: 30_000,
  expect: {
    timeout: 7_000,
  },
  fullyParallel: true,
  forbidOnly: true,
  reporter: [["line"]],
  use: {
    baseURL,
    geolocation: { latitude: 60.1699, longitude: 24.9384 },
    locale: "en-US",
    permissions: ["geolocation"],
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
