/**
 * YADORI Setup CLI
 *
 * Usage:  node --import tsx scripts/setup.ts
 * Or:     npm run setup
 *
 * Walks a new user through:
 *   1. Prerequisite checks (Node.js version)
 *   2. Entity genesis (seed generation + workspace deployment)
 *   3. Instructions for next steps
 */
import { readFile, writeFile, mkdir, readdir, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import { generateSeed, createFixedSeed } from "../engine/src/genesis/seed-generator.js";
import type { Seed } from "../engine/src/types.js";
import { createEntityState, serializeState, type EntityState } from "../engine/src/status/status-manager.js";
import { generateSoulEvilMd } from "../engine/src/mood/sulk-engine.js";

// --- Config ---
const TEMPLATE_DIR = resolve(import.meta.dirname!, "..", "templates", "workspace");
const WORKSPACE_ROOT = join(homedir(), ".openclaw", "workspace");

// --- Helpers ---
const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function print(msg: string) {
  console.log(msg);
}

function printHeader() {
  print("");
  print("  ╭──────────────────────────────────╮");
  print("  │          YADORI  Setup            │");
  print("  │    Inter-Species Intelligence     │");
  print("  │      Coexistence Framework        │");
  print("  ╰──────────────────────────────────╯");
  print("");
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// --- Steps ---

function checkNodeVersion(): boolean {
  const major = parseInt(process.versions.node.split(".")[0], 10);
  if (major < 22) {
    print(`  ✗ Node.js ${process.versions.node} detected. Version 22+ required.`);
    print(`    Install via: https://nodejs.org/ or use nvm`);
    return false;
  }
  print(`  ✓ Node.js ${process.versions.node}`);
  return true;
}

async function checkExistingEntity(): Promise<boolean> {
  const seedPath = join(WORKSPACE_ROOT, "SEED.md");
  if (await exists(seedPath)) {
    print(`  ! Entity already exists at:`);
    print(`    ${WORKSPACE_ROOT}`);
    print("");
    print(`  One Body, One Soul — deploying over an existing entity is forbidden.`);
    print(`  To start fresh, manually remove the workspace first:`);
    print(`    rm -rf ${WORKSPACE_ROOT}`);
    return true;
  }
  return false;
}

async function chooseGenesisMode(): Promise<"random" | "chromatic"> {
  print("  How should your entity be born?");
  print("");
  print("    1) Random — a unique entity determined by fate");
  print("    2) Chromatic (fixed) — a light-perceiving being (recommended for first time)");
  print("");

  const answer = await ask("  Choose [1/2] (default: 2): ");
  return answer === "1" ? "random" : "chromatic";
}

function performGenesis(mode: "random" | "chromatic"): Seed {
  if (mode === "random") {
    return generateSeed();
  }
  return createFixedSeed();
}

async function deployWorkspace(seed: Seed): Promise<void> {
  // Create directories
  const dirs = [
    WORKSPACE_ROOT,
    join(WORKSPACE_ROOT, "memory"),
    join(WORKSPACE_ROOT, "memory", "weekly"),
    join(WORKSPACE_ROOT, "memory", "monthly"),
    join(WORKSPACE_ROOT, "diary"),
    join(WORKSPACE_ROOT, "growth"),
    join(WORKSPACE_ROOT, "growth", "portraits"),
  ];

  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }

  // Copy template files
  const files = await readdir(TEMPLATE_DIR);

  for (const file of files) {
    let content = await readFile(join(TEMPLATE_DIR, file), "utf-8");

    if (file === "SEED.md") {
      content = replacePlaceholders(content, seed);
    }

    await writeFile(join(WORKSPACE_ROOT, file), content, "utf-8");
  }

  // Generate initial entity state and write engine state files
  const now = new Date();
  const entityState = createEntityState(seed, now);
  const serialized = serializeState(entityState);

  await writeFile(join(WORKSPACE_ROOT, "STATUS.md"), serialized.statusMd, "utf-8");
  await writeFile(join(WORKSPACE_ROOT, "MEMORY.md"), serialized.memoryMd, "utf-8");
  await writeFile(join(WORKSPACE_ROOT, "LANGUAGE.md"), serialized.languageMd, "utf-8");
  await writeFile(join(WORKSPACE_ROOT, "growth", "milestones.md"), serialized.milestonesMd, "utf-8");

  // Write species-specific SOUL_EVIL.md
  const soulEvilMd = generateSoulEvilMd(seed.perception, "mild");
  await writeFile(join(WORKSPACE_ROOT, "SOUL_EVIL.md"), soulEvilMd, "utf-8");

  // Save full state as JSON for the heartbeat runner
  await writeFile(
    join(WORKSPACE_ROOT, "__state.json"),
    JSON.stringify(entityState, null, 2),
    "utf-8",
  );
}

function replacePlaceholders(template: string, seed: Seed): string {
  const replacements: Record<string, string> = {
    "{{perception}}": seed.perception,
    "{{expression}}": seed.expression,
    "{{cognition}}": seed.cognition,
    "{{temperament}}": seed.temperament,
    "{{form}}": seed.form,
    "{{platform}}": seed.hardwareBody.platform,
    "{{arch}}": seed.hardwareBody.arch,
    "{{totalMemoryGB}}": String(seed.hardwareBody.totalMemoryGB),
    "{{cpuModel}}": seed.hardwareBody.cpuModel,
    "{{storageGB}}": String(seed.hardwareBody.storageGB),
    "{{createdAt}}": seed.createdAt,
    "{{hash}}": seed.hash,
  };

  let result = template;
  for (const [placeholder, value] of Object.entries(replacements)) {
    result = result.replaceAll(placeholder, value);
  }
  return result;
}

function printSeedInfo(seed: Seed) {
  print("");
  print("  ┌─ Genesis Result ──────────────────┐");
  print(`  │  Perception:  ${seed.perception.padEnd(20)}│`);
  print(`  │  Cognition:   ${seed.cognition.padEnd(20)}│`);
  print(`  │  Temperament: ${seed.temperament.padEnd(20)}│`);
  print(`  │  Form:        ${seed.form.padEnd(20)}│`);
  print(`  │  Hash:        ${seed.hash.padEnd(20)}│`);
  print("  └────────────────────────────────────┘");
}

function printNextSteps() {
  print("");
  print("  ── Next Steps ──────────────────────");
  print("");
  print("  1. Start the heartbeat (entity comes alive):");
  print("     npm run heartbeat");
  print("");
  print("  2. Start the dashboard:");
  print("     npm run dashboard");
  print(`     Then open http://localhost:3000`);
  print("");
  print("  3. Set up OpenClaw + messaging:");
  print("     See docs/ for Telegram/Discord setup");
  print("");
  print("  Your entity awaits at:");
  print(`  ${WORKSPACE_ROOT}`);
  print("");
}

// --- Main ---

async function main() {
  printHeader();

  // Step 1: Prerequisites
  print("  ── Prerequisites ───────────────────");
  print("");
  if (!checkNodeVersion()) {
    process.exit(1);
  }
  print("");

  // Step 2: Check existing entity
  if (await checkExistingEntity()) {
    rl.close();
    process.exit(1);
  }

  // Step 3: Choose genesis mode
  print("  ── Genesis ─────────────────────────");
  print("");
  const mode = await chooseGenesisMode();

  // Step 4: Perform genesis
  print("");
  print("  Generating seed...");
  const seed = performGenesis(mode);
  printSeedInfo(seed);

  // Step 5: Deploy workspace
  print("");
  print("  Deploying workspace...");
  await deployWorkspace(seed);
  print("  ✓ Workspace created");

  // Step 6: Done
  printNextSteps();

  rl.close();
}

main().catch((err) => {
  console.error("\n  Setup failed:", err.message);
  rl.close();
  process.exit(1);
});
