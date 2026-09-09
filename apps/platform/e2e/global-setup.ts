import { execFileSync } from "node:child_process";

const repoRoot = new URL("../../..", import.meta.url).pathname;

/** Seeds the deterministic Mine Ticket fixture before the browser tests run. */
export default function globalSetup() {
  execFileSync("pnpm", ["with-env", "tsx", "scripts/seed-e2e-mine-ticket.ts"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}
