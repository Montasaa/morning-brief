// Browser smoke tests at phone size (and a few at PC and wide sizes), against the app running with a scratch
// database and fake outside services. Thin by design: ranking and API
// behaviour are tested at the API seam (test/), not here. Ticket 03 grows this.
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3210);
export const E2E_INGEST_TOKEN = "e2e-ingest-token";
export const E2E_BASE_PATH = "/brief";
export const E2E_OWNER_EMAIL = "owner@example.com";
/**
 * The password every e2e Reader signs in with: the Owner chooses it on the first
 * visit (e2e/first-visit.setup.ts), and specs give it to the Readers they add.
 */
export const E2E_PASSWORD = "e2e password 123";

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
    // Runs first, on the fresh database: the Owner chooses their password on the sign-in page.
    { name: "first-visit", use: { ...devices["Pixel 7"] }, testMatch: /first-visit\.setup\.ts/ },
    {
      name: "phone",
      use: { ...devices["Pixel 7"] },
      testIgnore: /(desktop|wide)-.*\.spec\.ts/,
      dependencies: ["first-visit"],
    },
    // PC flows (Front Page, List, the reader pane; 1280×720) live in e2e/desktop-*.spec.ts.
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /desktop-.*\.spec\.ts/,
      dependencies: ["first-visit"],
    },
    // Wide screens (1600px and over: the pane always open, the Widgets column) in e2e/wide-*.spec.ts.
    {
      name: "wide",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1728, height: 1050 } },
      testMatch: /wide-.*\.spec\.ts/,
      dependencies: ["first-visit"],
    },
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
      OWNER_EMAIL: E2E_OWNER_EMAIL,
      PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
