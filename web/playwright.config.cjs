const { defineConfig, devices } = require("@playwright/test");

const isCI = Boolean(process.env.CI);
const shouldRunWebkit =
  process.platform === "darwin" || process.env.PW_RUN_WEBKIT_ON_LINUX === "1";

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 7_000,
  },
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "en-US",
    timezoneId: "Europe/Helsinki",
    geolocation: { latitude: 60.1699, longitude: 24.9384 },
    permissions: ["geolocation"],
  },
  webServer: {
    command: "node tests/e2e/server.mjs",
    port: 4173,
    reuseExistingServer: !isCI,
    timeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            "--autoplay-policy=no-user-gesture-required",
          ],
        },
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
      },
    },
    ...(shouldRunWebkit
      ? [
          {
            name: "webkit",
            use: {
              ...devices["Desktop Safari"],
            },
          },
        ]
      : []),
  ],
});
