import { defineConfig } from "@playwright/test";

// One end-to-end test: the full Brightline journey in a real browser.
// Reuses a running `pnpm dev`; the test resets demo data itself.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: { command: "pnpm dev", url: "http://localhost:3000/workspace", reuseExistingServer: true, timeout: 120_000, env: { LLM_MODE: "fixture" } },
});
