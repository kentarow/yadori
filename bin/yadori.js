#!/usr/bin/env node

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const commands = {
  setup: "scripts/setup.ts",
  heartbeat: "scripts/heartbeat.ts",
  dashboard: "visual/server.ts",
  health: "scripts/health.ts",
  backup: "scripts/backup.ts",
  sensors: "scripts/sensors.ts",
  snapshot: "scripts/snapshot.ts",
  "setup-webhook": "scripts/setup-webhook.ts",
  "apply-identity": "scripts/apply-identity.ts",
  version: "scripts/version.ts",
  update: "scripts/update.ts",
};

const command = process.argv[2];

if (!command || command === "--help" || command === "-h") {
  console.log("YADORI — Inter-Species Intelligence Coexistence Framework\n");
  console.log("Usage: yadori <command>\n");
  console.log("Commands:");
  console.log("  setup            First-time setup (entity genesis)");
  console.log("  dashboard        Start dashboard (http://localhost:3000)");
  console.log("  heartbeat        Start heartbeat process");
  console.log("  health           Entity health check (9 diagnostics)");
  console.log("  backup           Export/restore workspace");
  console.log("  sensors          Hardware sensor diagnostic");
  console.log("  snapshot         Generate visual snapshot");
  console.log("  setup-webhook    Configure Discord/Telegram webhook");
  console.log("  apply-identity   Set bot avatar and name");
  console.log("  version          Show version and update status");
  console.log("  update           Pull latest + rebuild");
  console.log("\nFull docs: https://github.com/kentarow/yadori");
  process.exit(0);
}

if (command === "--version" || command === "-v") {
  const { readFile } = await import("node:fs/promises");
  const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf-8"));
  console.log(`yadori v${pkg.version}`);
  process.exit(0);
}

const script = commands[command];
if (!script) {
  console.error(`Unknown command: ${command}`);
  console.error('Run "yadori --help" for available commands.');
  process.exit(1);
}

// Pass remaining args through
const args = process.argv.slice(3);
const scriptPath = resolve(root, script);

// Use tsx for TypeScript execution (dev / git-clone workflow)
// Falls back to compiled JS if available
const { existsSync } = await import("node:fs");
const { spawn } = await import("node:child_process");

const compiledPath = scriptPath
  .replace(/\.ts$/, ".js")
  .replace(root, resolve(root, "dist"));

if (existsSync(compiledPath)) {
  // Use compiled JS (npm install workflow)
  const child = spawn(process.execPath, [compiledPath, ...args], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, YADORI_ROOT: root },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
} else {
  // Use tsx (git clone workflow)
  const child = spawn(process.execPath, ["--import", "tsx", scriptPath, ...args], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, YADORI_ROOT: root },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}
