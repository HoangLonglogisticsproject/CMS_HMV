import { defineConfig } from "@playwright/test";

/** Pure-function tests (`e2e/unit.spec.ts`): no browser, no servers, no database. Also part of the full E2E run. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "unit.spec.ts",
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
});
