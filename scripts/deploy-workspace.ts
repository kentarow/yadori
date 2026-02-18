import { readFile, writeFile, mkdir, readdir, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { createFixedSeed } from "../engine/src/genesis/seed-generator.js";
import type { Seed } from "../engine/src/types.js";

if (!import.meta.dirname) {
  console.error("ERROR: import.meta.dirname is undefined. Run with a supported Node.js version (>=22).");
  process.exit(1);
}
const TEMPLATE_DIR = resolve(import.meta.dirname, "..", "templates", "workspace");
const WORKSPACE_ROOT = join(homedir(), ".openclaw", "workspace");

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function deploy() {
  console.log("YADORI Genesis — Deploying workspace templates\n");

  // Safety check: don't overwrite existing entity
  const seedPath = join(WORKSPACE_ROOT, "SEED.md");
  if (await exists(seedPath)) {
    console.error(
      "ERROR: Entity already exists at", WORKSPACE_ROOT, "\n" +
      "Deploying over an existing entity would violate One Body, One Soul.\n" +
      "To start fresh, manually remove the workspace first."
    );
    process.exit(1);
  }

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
    console.log("  Created:", dir);
  }

  // Generate seed
  const seed = createFixedSeed();
  console.log("\n  Seed generated:");
  console.log("    Perception:", seed.perception);
  console.log("    Cognition:", seed.cognition);
  console.log("    Temperament:", seed.temperament);
  console.log("    Form:", seed.form);
  console.log("    Hash:", seed.hash);

  // Copy template files, replacing {{placeholders}} in SEED.md
  const files = await readdir(TEMPLATE_DIR);

  for (const file of files) {
    let content = await readFile(join(TEMPLATE_DIR, file), "utf-8");

    if (file === "SEED.md") {
      content = replaceSeedPlaceholders(content, seed);
    }

    await writeFile(join(WORKSPACE_ROOT, file), content, "utf-8");
    console.log("  Deployed:", file);
  }

  console.log("\nGenesis complete. Your entity awaits at:", WORKSPACE_ROOT);
}

function replaceSeedPlaceholders(template: string, seed: Seed): string {
  const replacements: Record<string, string> = {
    "{{perception}}": seed.perception,
    "{{expression}}": seed.expression,
    "{{cognition}}": seed.cognition,
    "{{temperament}}": seed.temperament,
    "{{form}}": seed.form,
    "{{sensitivity}}": String(seed.subTraits.sensitivity),
    "{{sociability}}": String(seed.subTraits.sociability),
    "{{rhythmAffinity}}": String(seed.subTraits.rhythmAffinity),
    "{{memoryDepth}}": String(seed.subTraits.memoryDepth),
    "{{expressiveness}}": String(seed.subTraits.expressiveness),
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

deploy().catch((err) => {
  console.error("Genesis failed:", err);
  process.exit(1);
});
