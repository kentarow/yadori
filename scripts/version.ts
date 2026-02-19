/**
 * YADORI Version Check
 *
 * Shows the installed version and compares with the latest on GitHub.
 *
 * Usage:
 *   npm run version
 */

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname!, "..");

async function main() {
  // Read local version from package.json
  const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf-8"));
  const localVersion = pkg.version as string;

  // Get current git info
  let commitHash = "unknown";
  let commitDate = "";
  let branch = "";
  try {
    commitHash = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
    commitDate = execSync("git log -1 --format=%ci", { cwd: ROOT }).toString().trim().split(" ")[0];
    branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT }).toString().trim();
  } catch { /* not a git repo or git not available */ }

  console.log(`\n  YADORI v${localVersion}`);
  if (commitHash !== "unknown") {
    console.log(`  commit: ${commitHash} (${commitDate})`);
    console.log(`  branch: ${branch}`);
  }

  // Check if there are newer versions available (compare with origin/main)
  try {
    execSync("git fetch origin main --quiet 2>/dev/null", { cwd: ROOT, timeout: 5000 });
    const localHead = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();
    const remoteHead = execSync("git rev-parse origin/main", { cwd: ROOT }).toString().trim();

    if (localHead === remoteHead) {
      console.log(`  status: up to date`);
    } else {
      const behind = execSync(`git rev-list --count HEAD..origin/main`, { cwd: ROOT }).toString().trim();
      const ahead = execSync(`git rev-list --count origin/main..HEAD`, { cwd: ROOT }).toString().trim();

      if (parseInt(behind) > 0) {
        console.log(`  status: ${behind} commits behind origin/main`);
        console.log(`\n  Run: git pull origin main && npm install`);
      } else if (parseInt(ahead) > 0) {
        console.log(`  status: ${ahead} commits ahead of origin/main`);
      }
    }
  } catch {
    console.log(`  status: offline (could not check remote)`);
  }

  console.log("");
}

main();
