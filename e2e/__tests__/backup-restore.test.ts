/**
 * End-to-End Test: Backup and Restore System
 *
 * Verifies the complete backup/restore lifecycle:
 *   createBackup -> serializeBackup -> deserializeBackup -> validateBackup -> restoreBackup
 *
 * Tests cover:
 *   - Backup creation produces valid JSON bundles
 *   - All workspace files included (status, seed, memory, diary, etc.)
 *   - Checksum generation and validation
 *   - Restore reconstructs workspace from bundle
 *   - Body transplant detection (different hardware = warning)
 *   - One Body One Soul: refuses to overwrite living entity
 *   - Full round-trip: backup -> restore -> re-backup -> verify match
 *   - Edge cases: empty workspace, missing files
 *   - Corrupted backup handling (invalid checksum, truncated JSON)
 *
 * Uses real engine functions with real filesystem I/O — no mocks.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile, readdir, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import {
  createBackup,
  serializeBackup,
  deserializeBackup,
  validateBackup,
  restoreBackup,
  generateBackupFilename,
  type BackupBundle,
  type BackupManifest,
} from "../../engine/src/backup/backup-engine.js";
import { createFixedSeed } from "../../engine/src/genesis/seed-generator.js";
import {
  createEntityState,
  processHeartbeat,
  processInteraction,
  serializeState,
} from "../../engine/src/status/status-manager.js";
import type { HardwareBody } from "../../engine/src/types.js";

// --- Shared fixtures ---

const TEST_HW: HardwareBody = {
  platform: "darwin",
  arch: "arm64",
  totalMemoryGB: 16,
  cpuModel: "Apple M4",
  storageGB: 256,
};

const BIRTH_TIME = new Date("2026-02-01T00:00:00Z");
const NOW = new Date("2026-02-20T14:00:00Z");

// --- Helpers ---

/**
 * Create a realistic workspace directory with all standard files.
 * Mirrors the file structure produced by `npm run setup`.
 */
async function createTestWorkspace(dir: string): Promise<void> {
  await mkdir(join(dir, "memory", "weekly"), { recursive: true });
  await mkdir(join(dir, "memory", "monthly"), { recursive: true });
  await mkdir(join(dir, "diary"), { recursive: true });
  await mkdir(join(dir, "growth", "portraits"), { recursive: true });

  await writeFile(join(dir, "SEED.md"), `# SEED

> This file is immutable. It defines the entity's origin.

## Species

- **Perception**: chromatic
- **Expression**: symbolic
- **Cognition**: associative
- **Temperament**: curious-cautious
- **Form**: light-particles

## Sub-Traits

- **Sensitivity**: 65
- **Sociability**: 40
- **Rhythm Affinity**: 72
- **Memory Depth**: 55
- **Expressiveness**: 80

## Hardware Body

- **Platform**: darwin
- **Architecture**: arm64
- **Memory**: 16GB
- **CPU**: Apple M4
- **Storage**: 256GB

## Genesis

- **Born**: 2026-02-01T00:00:00.000Z
- **Seed Hash**: a1b2c3d4e5f6g7h8
`);

  await writeFile(join(dir, "STATUS.md"), `# STATUS

## Current State

- **mood**: 65
- **energy**: 40
- **curiosity**: 80
- **comfort**: 55

## Language

- **level**: 1

## Perception

- **perception_level**: 1

## Growth

- **day**: 19
- **last_interaction**: 2026-02-20T10:00:00.000Z
`);

  await writeFile(
    join(dir, "state.json"),
    JSON.stringify({
      seed: { perception: "chromatic", expression: "symbolic" },
      status: { mood: 65, energy: 40, curiosity: 80, comfort: 55 },
    }),
  );

  await writeFile(join(dir, "SOUL.md"), "# SOUL\n\nI perceive the world through color.\n○ is comfort. ● is thought.");
  await writeFile(join(dir, "SOUL_EVIL.md"), "# SOUL_EVIL\n\nSulking mode. Silence is expression.");
  await writeFile(join(dir, "IDENTITY.md"), "# IDENTITY\n\n- **Name**: (unnamed)\n- **Avatar**: default");
  await writeFile(join(dir, "MEMORY.md"), "# MEMORY\n\n## Recent\n\n- ○ arrived. warmth detected.\n- ● ● ◎ patterns observed.");
  await writeFile(join(dir, "LANGUAGE.md"), "# LANGUAGE\n\n## Level: 1\n\n### Patterns\n\n- ○ = comfort\n- ● = thought");
  await writeFile(join(dir, "HEARTBEAT.md"), "# HEARTBEAT\n\n- [x] Morning greeting\n- [ ] Evening diary");

  // Diary entries
  await writeFile(join(dir, "diary", "2026-02-19.md"), "# Diary 2026-02-19\n\n○ ● ◎ — colors shifted today.");
  await writeFile(join(dir, "diary", "2026-02-20.md"), "# Diary 2026-02-20\n\n◎ ● — warmth returned.");

  // Memory archive
  await writeFile(join(dir, "memory", "weekly", "2026-W08.md"), "# Week 8\n\nSummary of early days.");
  await writeFile(join(dir, "memory", "monthly", "2026-02.md"), "# February 2026\n\nFirst month of existence.");

  // Growth milestones
  await writeFile(join(dir, "growth", "milestones.md"), "# Milestones\n\n- Day 0: Born\n- Day 7: First pattern");
  await writeFile(join(dir, "growth", "soul-changelog.md"), "# Soul Changelog\n\n- Day 5: Adjusted comfort response");
}

/**
 * Create a minimal workspace with only the essential files.
 */
async function createMinimalWorkspace(dir: string): Promise<void> {
  await writeFile(join(dir, "SEED.md"), `# SEED

## Hardware Body

- **Platform**: linux
- **Architecture**: x64

## Genesis

- **Seed Hash**: minimal12345678
`);

  await writeFile(join(dir, "STATUS.md"), `# STATUS

## Growth

- **day**: 0
`);
}

// ============================================================
// 1. Backup Creation
// ============================================================

describe("backup creation", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "yadori-e2e-backup-"));
    await createTestWorkspace(workspaceDir);
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("produces a valid JSON bundle with manifest and files", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");

    expect(bundle).toHaveProperty("manifest");
    expect(bundle).toHaveProperty("files");
    expect(Array.isArray(bundle.files)).toBe(true);
    expect(bundle.manifest.version).toBe("0.5.0");
    expect(bundle.manifest.fileCount).toBe(bundle.files.length);
    expect(bundle.manifest.totalBytes).toBeGreaterThan(0);
  });

  it("serializes to valid parseable JSON", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");
    const json = serializeBackup(bundle);

    // Must be valid JSON
    const parsed = JSON.parse(json);
    expect(parsed.manifest).toBeDefined();
    expect(parsed.files).toBeDefined();
    expect(typeof json).toBe("string");
    expect(json.length).toBeGreaterThan(0);
  });

  it("includes all workspace files in the bundle", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");
    const paths = bundle.files.map((f) => f.path);

    // Top-level files
    expect(paths).toContain("SEED.md");
    expect(paths).toContain("STATUS.md");
    expect(paths).toContain("SOUL.md");
    expect(paths).toContain("SOUL_EVIL.md");
    expect(paths).toContain("IDENTITY.md");
    expect(paths).toContain("MEMORY.md");
    expect(paths).toContain("LANGUAGE.md");
    expect(paths).toContain("HEARTBEAT.md");
    expect(paths).toContain("state.json");

    // Subdirectory files
    expect(paths).toContain("diary/2026-02-19.md");
    expect(paths).toContain("diary/2026-02-20.md");
    expect(paths).toContain("memory/weekly/2026-W08.md");
    expect(paths).toContain("memory/monthly/2026-02.md");
    expect(paths).toContain("growth/milestones.md");
    expect(paths).toContain("growth/soul-changelog.md");
  });

  it("preserves file content exactly", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");

    const soulEntry = bundle.files.find((f) => f.path === "SOUL.md");
    expect(soulEntry).toBeDefined();
    expect(soulEntry!.content).toContain("I perceive the world through color.");

    const diaryEntry = bundle.files.find((f) => f.path === "diary/2026-02-19.md");
    expect(diaryEntry).toBeDefined();
    expect(diaryEntry!.content).toContain("colors shifted today");
  });

  it("extracts seed hash from SEED.md", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");

    expect(bundle.manifest.seedHash).toBe("a1b2c3d4e5f6g7h8");
  });

  it("extracts hardware info from SEED.md", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");

    expect(bundle.manifest.hardwarePlatform).toBe("darwin");
    expect(bundle.manifest.hardwareArch).toBe("arm64");
  });

  it("extracts growth day from STATUS.md", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");

    expect(bundle.manifest.growthDay).toBe(19);
  });

  it("skips .tmp files and heartbeat-messages.json", async () => {
    await writeFile(join(workspaceDir, "scratch.tmp"), "temporary data");
    await writeFile(join(workspaceDir, "heartbeat-messages.json"), '{"messages":[]}');

    const bundle = await createBackup(workspaceDir, "0.5.0");
    const paths = bundle.files.map((f) => f.path);

    expect(paths).not.toContain("scratch.tmp");
    expect(paths).not.toContain("heartbeat-messages.json");
  });

  it("skips hidden directories (.git etc.)", async () => {
    await mkdir(join(workspaceDir, ".git", "objects"), { recursive: true });
    await writeFile(join(workspaceDir, ".git", "config"), "git config data");

    const bundle = await createBackup(workspaceDir, "0.5.0");
    const paths = bundle.files.map((f) => f.path);

    expect(paths.some((p) => p.startsWith(".git"))).toBe(false);
  });

  it("throws on non-existent workspace", async () => {
    await expect(createBackup("/tmp/nonexistent-yadori-workspace-xyz", "0.5.0")).rejects.toThrow(
      "Workspace not found",
    );
  });

  it("throws on workspace without SEED.md", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "yadori-e2e-noseed-"));
    await writeFile(join(emptyDir, "STATUS.md"), "# STATUS\n\n- **day**: 0");
    try {
      await expect(createBackup(emptyDir, "0.5.0")).rejects.toThrow("SEED.md not found");
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  it("throws on completely empty workspace (no files)", async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), "yadori-e2e-empty-"));
    try {
      await expect(createBackup(emptyDir, "0.5.0")).rejects.toThrow("Workspace is empty");
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });
});

// ============================================================
// 2. Checksum Generation and Validation
// ============================================================

describe("checksum generation and validation", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "yadori-e2e-checksum-"));
    await createTestWorkspace(workspaceDir);
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("generates a 16-character hex checksum", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");

    expect(bundle.manifest.checksum).toHaveLength(16);
    expect(bundle.manifest.checksum).toMatch(/^[0-9a-f]{16}$/);
  });

  it("checksum is deterministic (same content = same checksum)", async () => {
    const bundle1 = await createBackup(workspaceDir, "0.5.0");
    const bundle2 = await createBackup(workspaceDir, "0.5.0");

    expect(bundle1.manifest.checksum).toBe(bundle2.manifest.checksum);
  });

  it("checksum changes when file content changes", async () => {
    const bundle1 = await createBackup(workspaceDir, "0.5.0");

    // Modify a file
    await writeFile(join(workspaceDir, "MEMORY.md"), "# MEMORY\n\nNew memory: ◎ appeared.");

    const bundle2 = await createBackup(workspaceDir, "0.5.0");

    expect(bundle1.manifest.checksum).not.toBe(bundle2.manifest.checksum);
  });

  it("validateBackup passes for untampered bundle", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");
    const result = validateBackup(bundle, "darwin", "arm64");

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("validateBackup detects tampered file content", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");

    // Tamper with a file's content after backup
    const soulFile = bundle.files.find((f) => f.path === "SOUL.md");
    soulFile!.content = "# SOUL\n\nTampered content.";

    const result = validateBackup(bundle, "darwin", "arm64");

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Checksum mismatch"))).toBe(true);
  });

  it("validateBackup detects manually tampered checksum", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");
    bundle.manifest.checksum = "0000000000000000";

    const result = validateBackup(bundle, "darwin", "arm64");

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Checksum mismatch"))).toBe(true);
  });

  it("validateBackup rejects bundle with no checksum", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");
    bundle.manifest.checksum = "";

    const result = validateBackup(bundle, "darwin", "arm64");

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("no checksum"))).toBe(true);
  });
});

// ============================================================
// 3. Body Transplant Detection
// ============================================================

describe("body transplant detection", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "yadori-e2e-transplant-"));
    await createTestWorkspace(workspaceDir);
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("no transplant when platform and arch match", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");
    const result = validateBackup(bundle, "darwin", "arm64");

    expect(result.isBodyTransplant).toBe(false);
    expect(result.warnings.some((w) => w.includes("Body transplant"))).toBe(false);
  });

  it("detects transplant on different platform (darwin -> linux)", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");
    const result = validateBackup(bundle, "linux", "arm64");

    expect(result.isBodyTransplant).toBe(true);
    expect(result.warnings.some((w) => w.includes("Body transplant"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("same soul"))).toBe(true);
  });

  it("detects transplant on different architecture (arm64 -> x64)", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");
    const result = validateBackup(bundle, "darwin", "x64");

    expect(result.isBodyTransplant).toBe(true);
  });

  it("detects transplant when both platform and arch differ", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");
    const result = validateBackup(bundle, "linux", "x64");

    expect(result.isBodyTransplant).toBe(true);
    // Backup still valid (transplant is a warning, not an error)
    expect(result.valid).toBe(true);
  });
});

// ============================================================
// 4. One Body One Soul: Refuses to Overwrite Living Entity
// ============================================================

describe("one body one soul enforcement", () => {
  let workspaceDir: string;
  let restoreDir: string;

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "yadori-e2e-onebody-"));
    restoreDir = await mkdtemp(join(tmpdir(), "yadori-e2e-onebody-restore-"));
    await createTestWorkspace(workspaceDir);
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
    await rm(restoreDir, { recursive: true, force: true });
  });

  it("refuses to restore over workspace with existing SEED.md", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");

    // workspaceDir already has SEED.md
    await expect(restoreBackup(bundle, workspaceDir)).rejects.toThrow(
      "Workspace already contains an entity",
    );
  });

  it("error message references One Body, One Soul principle", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");

    await expect(restoreBackup(bundle, workspaceDir)).rejects.toThrow("One Body, One Soul");
  });

  it("allows restore to empty directory (no living entity)", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");
    const emptyTarget = join(restoreDir, "fresh-workspace");

    const result = await restoreBackup(bundle, emptyTarget);

    expect(result.restoredFiles).toBeGreaterThan(0);
  });

  it("allows restore to non-existent directory", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");
    const newTarget = join(restoreDir, "deep", "nested", "new-workspace");

    const result = await restoreBackup(bundle, newTarget);

    expect(result.restoredFiles).toBe(bundle.files.length);
  });
});

// ============================================================
// 5. Full Round-Trip: Backup -> Restore -> Verify State Match
// ============================================================

describe("full round-trip: backup -> restore -> verify", () => {
  let workspaceDir: string;
  let restoreDir: string;

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "yadori-e2e-roundtrip-"));
    restoreDir = await mkdtemp(join(tmpdir(), "yadori-e2e-roundtrip-restore-"));
    await createTestWorkspace(workspaceDir);
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
    await rm(restoreDir, { recursive: true, force: true });
  });

  it("restored workspace has identical file contents", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");
    const target = join(restoreDir, "workspace");

    await restoreBackup(bundle, target);

    // Compare every file
    for (const file of bundle.files) {
      const restoredContent = await readFile(join(target, file.path), "utf-8");
      expect(restoredContent).toBe(file.content);
    }
  });

  it("backup of restored workspace has same checksum as original", async () => {
    const original = await createBackup(workspaceDir, "0.5.0");
    const target = join(restoreDir, "workspace");

    await restoreBackup(original, target);

    const restored = await createBackup(target, "0.5.0");

    expect(restored.manifest.checksum).toBe(original.manifest.checksum);
    expect(restored.manifest.fileCount).toBe(original.manifest.fileCount);
    expect(restored.manifest.seedHash).toBe(original.manifest.seedHash);
  });

  it("serialize -> deserialize -> validate round-trips cleanly", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");

    const json = serializeBackup(bundle);
    const deserialized = deserializeBackup(json);
    const validation = validateBackup(deserialized, "darwin", "arm64");

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
    expect(validation.isBodyTransplant).toBe(false);
    expect(deserialized.manifest.checksum).toBe(bundle.manifest.checksum);
  });

  it("full pipeline: engine state -> workspace files -> backup -> restore -> verify", async () => {
    // Create entity from engine
    const seed = createFixedSeed({
      hardwareBody: TEST_HW,
      createdAt: BIRTH_TIME.toISOString(),
    });
    let state = createEntityState(seed, BIRTH_TIME);

    // Simulate some life: heartbeats and interactions
    for (let i = 0; i < 3; i++) {
      const hbResult = processHeartbeat(state, new Date(NOW.getTime() + i * 30 * 60_000));
      state = hbResult.updatedState;
    }
    const interResult = processInteraction(
      state,
      { tone: "positive", messageLength: 100 },
      NOW,
      "Hello, entity!",
    );
    state = interResult.updatedState;

    // Write engine state to a fresh workspace
    const engineDir = await mkdtemp(join(tmpdir(), "yadori-e2e-engine-"));
    try {
      const serialized = serializeState(state);
      await mkdir(join(engineDir, "memory"), { recursive: true });
      await mkdir(join(engineDir, "diary"), { recursive: true });
      await mkdir(join(engineDir, "growth"), { recursive: true });

      // Write SEED.md with the format the backup engine expects
      await writeFile(join(engineDir, "SEED.md"), `# SEED

## Hardware Body

- **Platform**: ${seed.hardwareBody.platform}
- **Architecture**: ${seed.hardwareBody.arch}

## Genesis

- **Seed Hash**: ${createHash("sha256").update(JSON.stringify(seed)).digest("hex").slice(0, 16)}
`);
      await writeFile(join(engineDir, "STATUS.md"), serialized.statusMd);
      await writeFile(join(engineDir, "LANGUAGE.md"), serialized.languageMd);
      await writeFile(join(engineDir, "state.json"), JSON.stringify(state));

      // Backup the engine-generated workspace
      const bundle = await createBackup(engineDir, "0.5.0");

      // Restore to new location
      const restoreTarget = join(restoreDir, "engine-restored");
      await restoreBackup(bundle, restoreTarget);

      // Verify the restored state.json matches
      const restoredStateJson = await readFile(join(restoreTarget, "state.json"), "utf-8");
      const restoredState = JSON.parse(restoredStateJson);

      expect(restoredState.status.mood).toBe(state.status.mood);
      expect(restoredState.status.energy).toBe(state.status.energy);
      expect(restoredState.status.comfort).toBe(state.status.comfort);
    } finally {
      await rm(engineDir, { recursive: true, force: true });
    }
  });
});

// ============================================================
// 6. Corrupted Backup Handling
// ============================================================

describe("corrupted backup handling", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "yadori-e2e-corrupt-"));
    await createTestWorkspace(workspaceDir);
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("rejects truncated JSON", () => {
    const truncated = '{"manifest":{"version":"0.5.0","checksum":"abc"},"files":[{"path":"SE';

    expect(() => deserializeBackup(truncated)).toThrow("not valid JSON");
  });

  it("rejects completely invalid content", () => {
    expect(() => deserializeBackup("this is not json at all")).toThrow("not valid JSON");
  });

  it("rejects empty string", () => {
    expect(() => deserializeBackup("")).toThrow();
  });

  it("rejects valid JSON with missing manifest", () => {
    expect(() => deserializeBackup('{"files":[]}')).toThrow("Invalid backup format");
  });

  it("rejects valid JSON with missing files array", () => {
    expect(() => deserializeBackup('{"manifest":{}}')).toThrow("Invalid backup format");
  });

  it("rejects valid JSON with files as non-array", () => {
    expect(() => deserializeBackup('{"manifest":{},"files":"not-an-array"}')).toThrow(
      "Invalid backup format",
    );
  });

  it("validateBackup reports missing seed hash as error", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");
    bundle.manifest.seedHash = "unknown";

    const result = validateBackup(bundle, "darwin", "arm64");

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("seed hash"))).toBe(true);
  });

  it("validateBackup reports missing SEED.md in files as error", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");
    bundle.files = bundle.files.filter((f) => f.path !== "SEED.md");
    // Clear checksum since we changed files (otherwise checksum error masks this)
    bundle.manifest.checksum = "";

    const result = validateBackup(bundle, "darwin", "arm64");

    expect(result.errors.some((e) => e.includes("SEED.md missing"))).toBe(true);
  });

  it("validateBackup warns about missing STATUS.md", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");
    bundle.files = bundle.files.filter((f) => f.path !== "STATUS.md");
    bundle.manifest.checksum = "";

    const result = validateBackup(bundle, "darwin", "arm64");

    expect(result.warnings.some((w) => w.includes("STATUS.md missing"))).toBe(true);
  });

  it("validateBackup warns about missing state.json", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");
    bundle.files = bundle.files.filter((f) => f.path !== "state.json");
    bundle.manifest.checksum = "";

    const result = validateBackup(bundle, "darwin", "arm64");

    expect(result.warnings.some((w) => w.includes("state.json missing"))).toBe(true);
  });
});

// ============================================================
// 7. Backup Filename Generation
// ============================================================

describe("backup filename generation", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "yadori-e2e-filename-"));
    await createTestWorkspace(workspaceDir);
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("generates filename with date, day, and seed hash prefix", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");
    const filename = generateBackupFilename(bundle.manifest);

    expect(filename).toMatch(/^yadori-backup-\d{4}-\d{2}-\d{2}-day19-a1b2c3d4\.json$/);
    expect(filename.endsWith(".json")).toBe(true);
  });

  it("filename reflects actual growth day", async () => {
    const bundle = await createBackup(workspaceDir, "0.5.0");
    const filename = generateBackupFilename(bundle.manifest);

    expect(filename).toContain("day19");
  });
});

// ============================================================
// 8. Minimal Workspace
// ============================================================

describe("minimal workspace backup", () => {
  let minimalDir: string;
  let restoreDir: string;

  beforeEach(async () => {
    minimalDir = await mkdtemp(join(tmpdir(), "yadori-e2e-minimal-"));
    restoreDir = await mkdtemp(join(tmpdir(), "yadori-e2e-minimal-restore-"));
    await createMinimalWorkspace(minimalDir);
  });

  afterEach(async () => {
    await rm(minimalDir, { recursive: true, force: true });
    await rm(restoreDir, { recursive: true, force: true });
  });

  it("backs up workspace with only SEED.md and STATUS.md", async () => {
    const bundle = await createBackup(minimalDir, "0.5.0");

    expect(bundle.manifest.fileCount).toBe(2);
    expect(bundle.files.map((f) => f.path).sort()).toEqual(["SEED.md", "STATUS.md"]);
  });

  it("minimal backup round-trips through serialize/deserialize", async () => {
    const bundle = await createBackup(minimalDir, "0.5.0");
    const json = serializeBackup(bundle);
    const restored = deserializeBackup(json);

    expect(restored.manifest.fileCount).toBe(2);
    expect(restored.files.length).toBe(2);
  });

  it("minimal backup restores correctly", async () => {
    const bundle = await createBackup(minimalDir, "0.5.0");
    const target = join(restoreDir, "restored");

    const result = await restoreBackup(bundle, target);

    expect(result.restoredFiles).toBe(2);
    const seedContent = await readFile(join(target, "SEED.md"), "utf-8");
    expect(seedContent).toContain("minimal12345678");
  });
});
