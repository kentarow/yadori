import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createBackup,
  serializeBackup,
  deserializeBackup,
  validateBackup,
  restoreBackup,
  generateBackupFilename,
  type BackupBundle,
} from "../../src/backup/backup-engine.js";

// --- Helpers ---

async function createTestWorkspace(dir: string): Promise<void> {
  await mkdir(join(dir, "memory", "weekly"), { recursive: true });
  await mkdir(join(dir, "memory", "monthly"), { recursive: true });
  await mkdir(join(dir, "diary"), { recursive: true });
  await mkdir(join(dir, "growth", "portraits"), { recursive: true });

  await writeFile(join(dir, "SEED.md"), `# SEED

> This file is immutable.

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

- **Born**: 2026-02-13T10:00:00.000Z
- **Seed Hash**: abc123def456ghij
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

- **day**: 7
- **last_interaction**: 2026-02-20T10:00:00.000Z
`);

  await writeFile(join(dir, "state.json"), JSON.stringify({
    seed: { perception: "chromatic" },
    status: { mood: 65, energy: 40 },
  }));

  await writeFile(join(dir, "SOUL.md"), "# SOUL\n\nPersonality definition.");
  await writeFile(join(dir, "MEMORY.md"), "# MEMORY\n\nNo recent memories.");
  await writeFile(join(dir, "LANGUAGE.md"), "# LANGUAGE\n\nLevel 1.");

  await writeFile(join(dir, "diary", "2026-02-19.md"), "# Diary 2026-02-19\n\n○ ● ◎");
  await writeFile(join(dir, "memory", "weekly", "2026-W08.md"), "# Week 8\n\nSummary.");
}

describe("Backup Engine", () => {
  let workspaceDir: string;
  let restoreDir: string;

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "yadori-backup-test-"));
    restoreDir = await mkdtemp(join(tmpdir(), "yadori-restore-test-"));
    await createTestWorkspace(workspaceDir);
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
    await rm(restoreDir, { recursive: true, force: true });
  });

  describe("createBackup", () => {
    it("creates a backup bundle with all workspace files", async () => {
      const bundle = await createBackup(workspaceDir, "0.3.0");

      expect(bundle.manifest.version).toBe("0.3.0");
      expect(bundle.manifest.seedHash).toBe("abc123def456ghij");
      expect(bundle.manifest.hardwarePlatform).toBe("darwin");
      expect(bundle.manifest.hardwareArch).toBe("arm64");
      expect(bundle.manifest.growthDay).toBe(7);
      expect(bundle.manifest.fileCount).toBeGreaterThanOrEqual(7);
      expect(bundle.manifest.totalBytes).toBeGreaterThan(0);
      expect(bundle.manifest.checksum).toHaveLength(16);
      expect(bundle.files.length).toBe(bundle.manifest.fileCount);
    });

    it("includes files in subdirectories", async () => {
      const bundle = await createBackup(workspaceDir, "0.3.0");
      const paths = bundle.files.map((f) => f.path);

      expect(paths).toContain("SEED.md");
      expect(paths).toContain("STATUS.md");
      expect(paths).toContain("diary/2026-02-19.md");
      expect(paths).toContain("memory/weekly/2026-W08.md");
    });

    it("skips temp files", async () => {
      await writeFile(join(workspaceDir, "something.tmp"), "temp data");
      const bundle = await createBackup(workspaceDir, "0.3.0");
      const paths = bundle.files.map((f) => f.path);

      expect(paths).not.toContain("something.tmp");
    });

    it("skips heartbeat-messages.json (runtime state)", async () => {
      await writeFile(join(workspaceDir, "heartbeat-messages.json"), "{}");
      const bundle = await createBackup(workspaceDir, "0.3.0");
      const paths = bundle.files.map((f) => f.path);

      expect(paths).not.toContain("heartbeat-messages.json");
    });

    it("throws if workspace does not exist", async () => {
      await expect(createBackup("/nonexistent/path", "0.3.0"))
        .rejects.toThrow("Workspace not found");
    });

    it("throws if workspace has no SEED.md", async () => {
      const emptyDir = await mkdtemp(join(tmpdir(), "yadori-empty-"));
      await writeFile(join(emptyDir, "STATUS.md"), "test");
      try {
        await expect(createBackup(emptyDir, "0.3.0"))
          .rejects.toThrow("SEED.md not found");
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });
  });

  describe("serialize / deserialize", () => {
    it("round-trips a backup bundle", async () => {
      const bundle = await createBackup(workspaceDir, "0.3.0");
      const json = serializeBackup(bundle);
      const restored = deserializeBackup(json);

      expect(restored.manifest).toEqual(bundle.manifest);
      expect(restored.files.length).toBe(bundle.files.length);
    });

    it("throws on invalid JSON", () => {
      expect(() => deserializeBackup("not json")).toThrow("not valid JSON");
    });

    it("throws on missing manifest", () => {
      expect(() => deserializeBackup("{}")).toThrow("Invalid backup format");
    });
  });

  describe("validateBackup", () => {
    it("validates a correct backup", async () => {
      const bundle = await createBackup(workspaceDir, "0.3.0");
      const result = validateBackup(bundle, "darwin", "arm64");

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.isBodyTransplant).toBe(false);
    });

    it("detects body transplant (different platform)", async () => {
      const bundle = await createBackup(workspaceDir, "0.3.0");
      const result = validateBackup(bundle, "linux", "arm64");

      expect(result.isBodyTransplant).toBe(true);
      expect(result.warnings.some((w) => w.includes("Body transplant"))).toBe(true);
    });

    it("detects body transplant (different arch)", async () => {
      const bundle = await createBackup(workspaceDir, "0.3.0");
      const result = validateBackup(bundle, "darwin", "x64");

      expect(result.isBodyTransplant).toBe(true);
    });

    it("detects checksum mismatch", async () => {
      const bundle = await createBackup(workspaceDir, "0.3.0");
      bundle.manifest.checksum = "tampered0000000";
      const result = validateBackup(bundle, "darwin", "arm64");

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Checksum mismatch"))).toBe(true);
    });

    it("reports missing SEED.md", async () => {
      const bundle = await createBackup(workspaceDir, "0.3.0");
      bundle.files = bundle.files.filter((f) => f.path !== "SEED.md");
      const result = validateBackup(bundle, "darwin", "arm64");

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("SEED.md missing"))).toBe(true);
    });

    it("warns about missing STATUS.md", async () => {
      const bundle = await createBackup(workspaceDir, "0.3.0");
      bundle.files = bundle.files.filter((f) => f.path !== "STATUS.md");
      // Fix checksum after removing file
      bundle.manifest.checksum = "";
      const result = validateBackup(bundle, "darwin", "arm64");

      expect(result.warnings.some((w) => w.includes("STATUS.md missing"))).toBe(true);
    });
  });

  describe("restoreBackup", () => {
    it("restores all files to target directory", async () => {
      const bundle = await createBackup(workspaceDir, "0.3.0");

      // Use a clean subdirectory for restore
      const target = join(restoreDir, "workspace");
      const result = await restoreBackup(bundle, target);

      expect(result.restoredFiles).toBe(bundle.files.length);

      // Verify key files
      const seedContent = await readFile(join(target, "SEED.md"), "utf-8");
      expect(seedContent).toContain("chromatic");

      const diaryContent = await readFile(join(target, "diary", "2026-02-19.md"), "utf-8");
      expect(diaryContent).toContain("○ ● ◎");
    });

    it("refuses to restore over existing entity", async () => {
      const bundle = await createBackup(workspaceDir, "0.3.0");

      // workspaceDir already has SEED.md — should refuse
      await expect(restoreBackup(bundle, workspaceDir))
        .rejects.toThrow("Workspace already contains an entity");
    });

    it("creates nested directories", async () => {
      const bundle = await createBackup(workspaceDir, "0.3.0");
      const target = join(restoreDir, "deep", "nested", "workspace");
      const result = await restoreBackup(bundle, target);

      expect(result.restoredFiles).toBeGreaterThan(0);
    });
  });

  describe("generateBackupFilename", () => {
    it("generates descriptive filename", async () => {
      const bundle = await createBackup(workspaceDir, "0.3.0");
      const filename = generateBackupFilename(bundle.manifest);

      expect(filename).toMatch(/^yadori-backup-\d{4}-\d{2}-\d{2}-day7-abc123de\.json$/);
    });
  });
});
