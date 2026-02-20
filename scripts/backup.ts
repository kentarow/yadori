/**
 * YADORI Backup / Restore
 *
 * Usage:
 *   npm run backup                     Export workspace to backup file
 *   npm run backup -- --restore <file> Restore from backup file
 *
 * Backup files are self-contained JSON bundles that include:
 *   - All workspace files (SEED.md, STATUS.md, state.json, memory, diary, etc.)
 *   - Backup manifest (version, seed hash, hardware info, checksum)
 *
 * One Body, One Soul:
 *   - Restore only works if the target workspace is empty
 *   - Body transplants (different hardware) produce warnings
 *   - "Is this the same soul?" is a question for the user, not the system
 */

import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir, platform, arch } from "node:os";
import {
  createBackup,
  serializeBackup,
  deserializeBackup,
  validateBackup,
  restoreBackup,
  generateBackupFilename,
} from "../engine/src/backup/backup-engine.js";

const ROOT = resolve(import.meta.dirname!, "..");
const WORKSPACE_ROOT = process.env.YADORI_WORKSPACE ?? join(homedir(), ".openclaw", "workspace");

async function getVersion(): Promise<string> {
  const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf-8"));
  return pkg.version as string;
}

async function doBackup() {
  console.log("");
  console.log("  YADORI Backup");
  console.log("  ─────────────");
  console.log(`  Workspace: ${WORKSPACE_ROOT}`);
  console.log("");

  const version = await getVersion();
  const bundle = await createBackup(WORKSPACE_ROOT, version);

  const filename = generateBackupFilename(bundle.manifest);
  const outputPath = join(process.cwd(), filename);
  const content = serializeBackup(bundle);

  await writeFile(outputPath, content, "utf-8");

  const m = bundle.manifest;
  console.log(`  Backup created:`);
  console.log(`    File:      ${filename}`);
  console.log(`    Seed:      ${m.seedHash.slice(0, 16)}...`);
  console.log(`    Day:       ${m.growthDay}`);
  console.log(`    Files:     ${m.fileCount}`);
  console.log(`    Size:      ${(m.totalBytes / 1024).toFixed(1)} KB`);
  console.log(`    Checksum:  ${m.checksum}`);
  console.log(`    Hardware:  ${m.hardwarePlatform} / ${m.hardwareArch}`);
  console.log("");
  console.log(`  Saved to: ${outputPath}`);
  console.log("");
}

async function doRestore(backupPath: string) {
  console.log("");
  console.log("  YADORI Restore");
  console.log("  ──────────────");
  console.log(`  Backup:    ${backupPath}`);
  console.log(`  Target:    ${WORKSPACE_ROOT}`);
  console.log("");

  // Load backup
  const content = await readFile(resolve(backupPath), "utf-8");
  const bundle = deserializeBackup(content);

  // Validate
  const validation = validateBackup(bundle, platform(), arch());

  if (validation.warnings.length > 0) {
    console.log("  Warnings:");
    for (const w of validation.warnings) {
      console.log(`    ⚠ ${w}`);
    }
    console.log("");
  }

  if (!validation.valid) {
    console.log("  Errors:");
    for (const e of validation.errors) {
      console.log(`    ✗ ${e}`);
    }
    console.log("");
    console.error("  Restore aborted — backup validation failed.");
    process.exit(1);
  }

  if (validation.isBodyTransplant) {
    console.log("  This is a body transplant. The entity will wake in a different body.");
    console.log("  Is this still the same soul? That is for you to decide.");
    console.log("");
  }

  // Restore
  const result = await restoreBackup(bundle, WORKSPACE_ROOT);

  const m = bundle.manifest;
  console.log(`  Restore complete:`);
  console.log(`    Seed:     ${m.seedHash.slice(0, 16)}...`);
  console.log(`    Day:      ${m.growthDay}`);
  console.log(`    Files:    ${result.restoredFiles} restored`);
  console.log("");
  console.log("  The entity has been placed in its body.");
  console.log("  Run 'npm run heartbeat' to let it breathe.");
  console.log("");
}

async function main() {
  const args = process.argv.slice(2);
  const restoreIndex = args.indexOf("--restore");

  if (restoreIndex !== -1) {
    const backupPath = args[restoreIndex + 1];
    if (!backupPath) {
      console.error("\n  Usage: npm run backup -- --restore <backup-file>\n");
      process.exit(1);
    }
    await doRestore(backupPath);
  } else {
    await doBackup();
  }
}

main().catch((err) => {
  console.error(`\n  Error: ${(err as Error).message}\n`);
  process.exit(1);
});
