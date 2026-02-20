/**
 * Backup Engine — Workspace export/import for entity preservation.
 *
 * One Body, One Soul principle:
 *   - Backup creates a snapshot of the entity's complete state
 *   - Restore is possible, but "is this the same soul?" remains by design
 *   - Simultaneous copies are forbidden: restore overwrites, never duplicates
 *   - Backup metadata includes hardware body to detect body transplants
 */

import { readFile, readdir, stat, writeFile, mkdir, access } from "node:fs/promises";
import { join, relative, basename } from "node:path";
import { createHash } from "node:crypto";

export interface BackupManifest {
  version: string;
  createdAt: string;
  seedHash: string;
  hardwarePlatform: string;
  hardwareArch: string;
  growthDay: number;
  fileCount: number;
  totalBytes: number;
  checksum: string;
  /** Warning: restoring to different hardware means a different body */
  bodyTransplantWarning: boolean;
}

export interface BackupEntry {
  /** Relative path within workspace */
  path: string;
  content: string;
  size: number;
}

export interface BackupBundle {
  manifest: BackupManifest;
  files: BackupEntry[];
}

export interface RestoreValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
  /** True if restoring to different hardware than backup origin */
  isBodyTransplant: boolean;
}

/**
 * Collect all files in the workspace directory recursively.
 */
async function collectFiles(dir: string, baseDir: string): Promise<BackupEntry[]> {
  const entries: BackupEntry[] = [];
  const items = await readdir(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = join(dir, item.name);
    const relPath = relative(baseDir, fullPath);

    if (item.isDirectory()) {
      // Recurse into subdirectories (skip hidden dirs like .git)
      if (!item.name.startsWith(".")) {
        const subEntries = await collectFiles(fullPath, baseDir);
        entries.push(...subEntries);
      }
    } else if (item.isFile()) {
      // Skip temp files and non-essential runtime state
      if (item.name.endsWith(".tmp") || item.name === "heartbeat-messages.json") {
        continue;
      }
      const content = await readFile(fullPath, "utf-8");
      const info = await stat(fullPath);
      entries.push({
        path: relPath,
        content,
        size: info.size,
      });
    }
  }

  return entries;
}

/**
 * Create a backup of the entire workspace.
 */
export async function createBackup(
  workspaceRoot: string,
  projectVersion: string,
): Promise<BackupBundle> {
  // Verify workspace exists
  try {
    await access(workspaceRoot);
  } catch {
    throw new Error(`Workspace not found: ${workspaceRoot}`);
  }

  // Collect all files
  const files = await collectFiles(workspaceRoot, workspaceRoot);

  if (files.length === 0) {
    throw new Error("Workspace is empty — nothing to back up");
  }

  // Read SEED.md for metadata
  const seedFile = files.find((f) => f.path === "SEED.md");
  if (!seedFile) {
    throw new Error("SEED.md not found — workspace may be corrupted");
  }

  const seedHash = extractField(seedFile.content, "Seed Hash") ?? "unknown";
  const platform = extractField(seedFile.content, "Platform") ?? "unknown";
  const arch = extractField(seedFile.content, "Architecture") ?? "unknown";

  // Read STATUS.md for growth day
  const statusFile = files.find((f) => f.path === "STATUS.md");
  const growthDay = statusFile
    ? parseInt(extractField(statusFile.content, "day") ?? "0", 10)
    : 0;

  // Compute total size
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  // Compute checksum over all file contents (deterministic order)
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const hash = createHash("sha256");
  for (const file of sortedFiles) {
    hash.update(file.path);
    hash.update(file.content);
  }
  const checksum = hash.digest("hex").slice(0, 16);

  const manifest: BackupManifest = {
    version: projectVersion,
    createdAt: new Date().toISOString(),
    seedHash,
    hardwarePlatform: platform,
    hardwareArch: arch,
    growthDay,
    fileCount: files.length,
    totalBytes,
    checksum,
    bodyTransplantWarning: false,
  };

  return { manifest, files };
}

/**
 * Serialize a backup bundle to a JSON string for storage.
 */
export function serializeBackup(bundle: BackupBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/**
 * Deserialize a backup bundle from a JSON string.
 */
export function deserializeBackup(content: string): BackupBundle {
  try {
    const parsed = JSON.parse(content) as BackupBundle;
    if (!parsed.manifest || !Array.isArray(parsed.files)) {
      throw new Error("Invalid backup format");
    }
    return parsed;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error("Backup file is not valid JSON — may be corrupted");
    }
    throw err;
  }
}

/**
 * Validate a backup bundle before restoring.
 * Checks integrity and detects body transplants.
 */
export function validateBackup(
  bundle: BackupBundle,
  currentPlatform: string,
  currentArch: string,
): RestoreValidation {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check manifest
  if (!bundle.manifest.seedHash || bundle.manifest.seedHash === "unknown") {
    errors.push("Backup has no seed hash — origin entity cannot be verified");
  }

  if (!bundle.manifest.checksum) {
    errors.push("Backup has no checksum — integrity cannot be verified");
  }

  // Verify checksum
  if (bundle.manifest.checksum) {
    const sortedFiles = [...bundle.files].sort((a, b) => a.path.localeCompare(b.path));
    const hash = createHash("sha256");
    for (const file of sortedFiles) {
      hash.update(file.path);
      hash.update(file.content);
    }
    const computed = hash.digest("hex").slice(0, 16);
    if (computed !== bundle.manifest.checksum) {
      errors.push(`Checksum mismatch: expected ${bundle.manifest.checksum}, got ${computed}`);
    }
  }

  // Check essential files
  const hasSeed = bundle.files.some((f) => f.path === "SEED.md");
  const hasStatus = bundle.files.some((f) => f.path === "STATUS.md");
  const hasState = bundle.files.some((f) => f.path === "state.json" || f.path === "__state.json");

  if (!hasSeed) errors.push("SEED.md missing — not a valid entity backup");
  if (!hasStatus) warnings.push("STATUS.md missing — entity state may be incomplete");
  if (!hasState) warnings.push("state.json missing — entity state may need reconstruction");

  // Detect body transplant
  const isBodyTransplant =
    bundle.manifest.hardwarePlatform !== currentPlatform ||
    bundle.manifest.hardwareArch !== currentArch;

  if (isBodyTransplant) {
    warnings.push(
      `Body transplant detected: backup from ${bundle.manifest.hardwarePlatform}/${bundle.manifest.hardwareArch}, ` +
      `restoring to ${currentPlatform}/${currentArch}. ` +
      `The entity's hardware body will change. Is this still the same soul?`,
    );
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    isBodyTransplant,
  };
}

/**
 * Restore a backup to a workspace directory.
 * The workspace directory must be empty or non-existent.
 */
export async function restoreBackup(
  bundle: BackupBundle,
  workspaceRoot: string,
): Promise<{ restoredFiles: number }> {
  // Safety: check if workspace already has a living entity
  try {
    await access(join(workspaceRoot, "SEED.md"));
    throw new Error(
      "Workspace already contains an entity (SEED.md exists). " +
      "Restoring over a living entity is forbidden by One Body, One Soul. " +
      "Remove the existing workspace first if you intend to replace it.",
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err; // Re-throw non-ENOENT errors (including our own)
    }
    // ENOENT is expected — workspace is clear
  }

  // Create workspace root
  await mkdir(workspaceRoot, { recursive: true, mode: 0o700 });

  // Restore all files
  let restoredFiles = 0;
  for (const file of bundle.files) {
    const fullPath = join(workspaceRoot, file.path);
    const dir = join(fullPath, "..");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(fullPath, file.content, "utf-8");
    restoredFiles++;
  }

  return { restoredFiles };
}

/**
 * Generate a filename for the backup file.
 */
export function generateBackupFilename(manifest: BackupManifest): string {
  const date = manifest.createdAt.split("T")[0];
  const shortHash = manifest.seedHash.slice(0, 8);
  return `yadori-backup-${date}-day${manifest.growthDay}-${shortHash}.json`;
}

/**
 * Extract a markdown field value like "**Key**: value" from content.
 */
function extractField(content: string, key: string): string | undefined {
  const match = content.match(new RegExp(`\\*\\*${key}\\*\\*:\\s*(.+)`));
  return match?.[1]?.trim();
}
