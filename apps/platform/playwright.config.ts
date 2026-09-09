import { defineConfig, devices } from "@playwright/test";

const apiUrl = process.env.VITE_API_URL ?? "http://localhost:8000";
const platformUrl = process.env.PLATFORM_URL ?? "http://localhost:3000";
const repoRoot = new URL("../..", import.meta.url).pathname;

/**
 * The first browser-level testing seam for the Platform (see issue #44 /
 * ADR discussion in #43): exercises real user-visible flows through the
 * actual Platform UI and API rather than mocked component internals.
 * Requires the dev Postgres/Redis stack (docker-compose.dev.yaml) and a
 * seeded demo workspace (`pnpm seed:demo`) to already be running.
 */
export default defineConfig({
  fullyParallel: false,
  globalSetup: "./e2e/global-setup.ts",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  reporter: "list",
  retries: process.env.CI ? 1 : 0,
  testDir: "./e2e",
  use: {
    baseURL: platformUrl,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @repo/api dev",
      cwd: repoRoot,
      reuseExistingServer: true,
      url: `${apiUrl}/health`,
    },
    {
      command: "pnpm --filter @repo/platform dev",
      cwd: repoRoot,
      reuseExistingServer: true,
      url: platformUrl,
    },
  ],
});
