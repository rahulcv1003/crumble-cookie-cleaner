import { defineConfig } from "@playwright/test";

// Lets PRV-01 see network requests made by the extension's service worker.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";

// E2E tests drive Playwright's bundled Chromium with the unpacked extension from dist-test/.
// Run `npm run build:test` first (`npm run test:e2e` does this). On Linux without a display,
// wrap the run with `xvfb-run -a`.
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  // The screenshot generator documents the UI; run it with `npm run screenshots`.
  testIgnore: process.env.SCREENSHOTS ? [] : ["**/screenshots.spec.ts", "**/store-assets.spec.ts"],
  globalSetup: "./tests/e2e/global-setup.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  outputDir: "test-results/e2e-artifacts",
  reporter: [["list"], ["json", { outputFile: "test-results/e2e-results.json" }]],
});
