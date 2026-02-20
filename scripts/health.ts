/**
 * YADORI Health Check
 *
 * Usage:  npm run health
 *
 * Runs diagnostics on the entity workspace and reports vital signs.
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { runHealthCheck, type HealthCheckItem } from "../engine/src/health/health-check.js";
import { repairWorkspace } from "../engine/src/health/workspace-repair.js";

const WORKSPACE_ROOT = process.env.YADORI_WORKSPACE ?? join(homedir(), ".openclaw", "workspace");
const DASHBOARD_PORT = parseInt(process.env.YADORI_PORT ?? "3000", 10);

const STATUS_ICONS: Record<string, string> = {
  ok: "+",
  warn: "!",
  error: "x",
};

function formatCheck(check: HealthCheckItem): string {
  const icon = STATUS_ICONS[check.status] ?? "?";
  let line = `  [${icon}] ${check.message}`;
  if (check.detail) {
    line += `\n      ${check.detail}`;
  }
  return line;
}

async function main() {
  console.log("");
  console.log("  YADORI Health Check");
  console.log("  ───────────────────");
  console.log(`  Workspace: ${WORKSPACE_ROOT}`);
  console.log("");

  const report = await runHealthCheck(WORKSPACE_ROOT, DASHBOARD_PORT);

  for (const check of report.checks) {
    console.log(formatCheck(check));
  }

  console.log("");

  if (report.overall === "ok") {
    console.log("  Entity is alive and healthy.");
  } else if (report.overall === "warn") {
    console.log("  Entity is alive with warnings.");
  } else {
    console.log("  Entity health check failed.");
  }

  console.log("");

  // --repair flag: attempt workspace repair
  if (process.argv.includes("--repair")) {
    console.log("  Running workspace repair...");
    console.log("");

    const result = await repairWorkspace(WORKSPACE_ROOT);

    for (const action of result.actions) {
      console.log(`  [${action.action}] ${action.file} — ${action.reason}`);
    }

    console.log("");
    console.log(`  ${result.repaired} files repaired`);
    console.log("");
  }
}

main().catch((err) => {
  console.error(`\n  Error: ${(err as Error).message}\n`);
  process.exit(1);
});
