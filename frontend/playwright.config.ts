import { defineConfig, devices } from "@playwright/test";
import { E2E, backendDir } from "./e2e/env";

/**
 * Browser E2E against the real stack: NestJS (built `dist/`) + PostgreSQL + this Next.js app.
 * Uses its own database (`hmv_cms_e2e_test`, wiped by e2e/global-setup.ts) and ports 4100/3100,
 * so it never touches the development database or servers.
 * Prerequisites: `docker compose up -d postgres` and `pnpm --filter backend build`. Builds the CMS into `.next-e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1, // one shared database
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: E2E.web,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node dist/main.js",
      cwd: backendDir,
      url: `${E2E.api}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: String(E2E.apiPort),
        NODE_ENV: "test",
        DATABASE_URL: E2E.databaseUrl,
        CORS_ORIGIN: E2E.web,
        STORAGE_DRIVER: "local",
        LOCAL_STORAGE_DIR: E2E.mediaDir,
        MEDIA_PUBLIC_BASE_URL: `${E2E.api}/media-files`,
      },
    },
    {
      // Production build in its own dist dir: does not collide with a developer's `next dev` (Next allows only one
      // dev server per project) and tests what ships. NEXT_PUBLIC_* values are inlined at build time.
      command: `pnpm exec next build && pnpm exec next start --port ${E2E.webPort}`,
      url: `${E2E.web}/login`,
      reuseExistingServer: false,
      timeout: 300_000,
      env: { NEXT_PUBLIC_API_URL: E2E.api, NEXT_DIST_DIR: ".next-e2e" },
    },
  ],
});
