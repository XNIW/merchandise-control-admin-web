import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const webServerCommand =
  process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ?? "npm run dev";
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER !== "0";
const useWebServer = process.env.PLAYWRIGHT_DISABLE_WEB_SERVER !== "1";

const config = defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  ...(useWebServer
    ? {
        webServer: {
          command: webServerCommand,
          url: baseURL,
          reuseExistingServer,
          timeout: 120_000,
        },
      }
    : {}),
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "chromium-tablet",
      use: {
        browserName: "chromium",
        viewport: { width: 900, height: 1180 },
      },
    },
  ],
});

export default config;
