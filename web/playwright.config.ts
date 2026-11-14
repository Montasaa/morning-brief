// Browser smoke tests at phone size (and a few at desktop size), against the app running with a scratch
// database and fake outside services. Thin by design: ranking and API
// behaviour are tested at the API seam (test/), not here. Ticket 03 grows this.
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3210);
export const E2E_INGEST_TOKEN = "e2e-ingest-token";
export const E2E_BASE_PATH = "/brief";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] }, testIgnore: /desktop-.*\.spec\.ts/ },
    // Desktop-only flows (card plus side list) live in e2e/desktop-*.spec.ts.
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testMatch: /desktop-.*\.spec\.ts/ },
  ],
  webServer: {
    // A fresh scratch database on every run.
    command: `rm -rf .e2e && next dev --port ${port} --hostname 127.0.0.1`,
    url: `http://127.0.0.1:${port}${E2E_BASE_PATH}/api/brief`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_PATH: ".e2e/brief.db",
      INGEST_TOKEN: E2E_INGEST_TOKEN,
      OUTSIDE_SERVICES: "fake",
      BASE_PATH: E2E_BASE_PATH,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
