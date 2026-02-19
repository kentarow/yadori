/**
 * YADORI Update
 *
 * Pulls the latest version from GitHub, installs dependencies,
 * and shows what changed.
 *
 * Usage:
 *   npm run update
 */

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname!, "..");

function run(cmd: string): string {
  return execSync(cmd, { cwd: ROOT, timeout: 30_000 }).toString().trim();
}

function runSafe(cmd: string): string | null {
  try {
    return run(cmd);
  } catch {
    return null;
  }
}

async function main() {
  const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf-8"));
  const beforeVersion = pkg.version as string;
  const beforeHash = runSafe("git rev-parse --short HEAD") ?? "unknown";

  console.log(`\n  YADORI v${beforeVersion} (${beforeHash})`);
  console.log(`  Checking for updates...\n`);

  // Fetch latest from remote
  const fetched = runSafe("git fetch origin main 2>&1");
  if (fetched === null) {
    console.log("  ✗ Could not reach GitHub. Check your internet connection.");
    console.log("");
    process.exit(1);
  }

  // Check if already up to date
  const localHead = runSafe("git rev-parse HEAD");
  const remoteHead = runSafe("git rev-parse origin/main");

  if (localHead === remoteHead) {
    console.log("  ✓ Already up to date.\n");
    process.exit(0);
  }

  // Show what's coming
  const behind = runSafe("git rev-list --count HEAD..origin/main") ?? "?";
  console.log(`  ${behind} new commit(s) available.\n`);

  // Show changelog diff (if CHANGELOG.md changed)
  const changelogDiff = runSafe(
    "git diff HEAD..origin/main -- CHANGELOG.md"
  );
  if (changelogDiff) {
    const added = changelogDiff
      .split("\n")
      .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
      .map((l) => l.slice(1))
      .filter((l) => l.trim().length > 0);

    if (added.length > 0) {
      console.log("  ─── What's new ───");
      for (const line of added.slice(0, 20)) {
        console.log(`  ${line}`);
      }
      if (added.length > 20) {
        console.log(`  ... and ${added.length - 20} more lines`);
      }
      console.log("  ──────────────────\n");
    }
  }

  // Pull
  console.log("  Updating...");
  try {
    run("git pull origin main");
  } catch (e) {
    console.log("  ✗ git pull failed. You may have local changes.");
    console.log("    Try: git stash && npm run update && git stash pop");
    console.log("");
    process.exit(1);
  }

  // Install dependencies (in case package.json changed)
  console.log("  Installing dependencies...");
  try {
    run("npm install --no-audit --no-fund");
  } catch {
    console.log("  ✗ npm install failed. Try running 'npm install' manually.");
    console.log("");
    process.exit(1);
  }

  // Show result
  const afterPkg = JSON.parse(
    await readFile(join(ROOT, "package.json"), "utf-8")
  );
  const afterVersion = afterPkg.version as string;
  const afterHash = runSafe("git rev-parse --short HEAD") ?? "unknown";

  console.log("");
  if (beforeVersion !== afterVersion) {
    console.log(`  ✓ Updated: v${beforeVersion} → v${afterVersion} (${afterHash})`);
  } else {
    console.log(`  ✓ Updated to latest (${afterHash})`);
  }
  console.log("");
}

main();
