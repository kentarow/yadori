import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile, readdir, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rotateWorkspaceLogs, estimateWorkspaceSize } from "../../src/memory/log-rotation.js";

describe("Log Rotation", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "yadori-rotation-test-"));
    await mkdir(join(workspaceDir, "diary"), { recursive: true });
    await mkdir(join(workspaceDir, "memory", "weekly"), { recursive: true });
    await mkdir(join(workspaceDir, "memory", "monthly"), { recursive: true });
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // 1. Diary file rotation: old diary files get archived
  // ---------------------------------------------------------------------------
  describe("diary rotation", () => {
    it("archives oldest diary files when count exceeds retention limit", async () => {
      // Create 10 diary files, keep 5
      for (let i = 1; i <= 10; i++) {
        await writeFile(
          join(workspaceDir, "diary", `2026-02-${String(i).padStart(2, "0")}.md`),
          `# Diary\n\nDay ${i} content`,
        );
      }

      const result = await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 5 });
      expect(result.diaryArchived).toBe(5);

      // Oldest 5 should be gone, newest 5 remain
      const remaining = await readdir(join(workspaceDir, "diary"));
      const diaryFiles = remaining.filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
      expect(diaryFiles.length).toBe(5);
      expect(diaryFiles).toContain("2026-02-06.md");
      expect(diaryFiles).toContain("2026-02-10.md");
      expect(diaryFiles).not.toContain("2026-02-01.md");
      expect(diaryFiles).not.toContain("2026-02-05.md");

      // Archive file should exist
      expect(remaining).toContain("archive-2026.md");
    });

    it("preserves diary file content in the archive", async () => {
      for (let i = 1; i <= 5; i++) {
        await writeFile(
          join(workspaceDir, "diary", `2026-01-${String(i).padStart(2, "0")}.md`),
          `Entry for day ${i}`,
        );
      }

      await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 2 });

      const archive = await readFile(join(workspaceDir, "diary", "archive-2026.md"), "utf-8");
      expect(archive).toContain("## 2026-01-01");
      expect(archive).toContain("Entry for day 1");
      expect(archive).toContain("## 2026-01-02");
      expect(archive).toContain("Entry for day 2");
      expect(archive).toContain("## 2026-01-03");
      expect(archive).toContain("Entry for day 3");
    });

    it("removes archived diary files from the diary directory", async () => {
      for (let i = 1; i <= 6; i++) {
        await writeFile(
          join(workspaceDir, "diary", `2026-03-${String(i).padStart(2, "0")}.md`),
          `Day ${i}`,
        );
      }

      await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 3 });

      const remaining = await readdir(join(workspaceDir, "diary"));
      expect(remaining).not.toContain("2026-03-01.md");
      expect(remaining).not.toContain("2026-03-02.md");
      expect(remaining).not.toContain("2026-03-03.md");
      // Kept files
      expect(remaining).toContain("2026-03-04.md");
      expect(remaining).toContain("2026-03-05.md");
      expect(remaining).toContain("2026-03-06.md");
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Weekly summary rotation: old weekly files get archived
  // ---------------------------------------------------------------------------
  describe("weekly memory rotation", () => {
    it("archives oldest weekly files when count exceeds retention limit", async () => {
      for (let i = 1; i <= 8; i++) {
        await writeFile(
          join(workspaceDir, "memory", "weekly", `2026-W${String(i).padStart(2, "0")}.md`),
          `# Week ${i}\n\nSummary for week ${i}`,
        );
      }

      const result = await rotateWorkspaceLogs(workspaceDir, { weeklyKeepWeeks: 4 });
      expect(result.weeklyArchived).toBe(4);

      const remaining = await readdir(join(workspaceDir, "memory", "weekly"));
      const weeklyFiles = remaining.filter((f) => /^\d{4}-W\d{2}\.md$/.test(f));
      expect(weeklyFiles.length).toBe(4);
      expect(weeklyFiles).toContain("2026-W05.md");
      expect(weeklyFiles).toContain("2026-W08.md");
      expect(weeklyFiles).not.toContain("2026-W01.md");
      expect(weeklyFiles).not.toContain("2026-W04.md");
    });

    it("preserves weekly content in the archive", async () => {
      for (let i = 1; i <= 6; i++) {
        await writeFile(
          join(workspaceDir, "memory", "weekly", `2026-W${String(i).padStart(2, "0")}.md`),
          `Summary for week ${i}`,
        );
      }

      await rotateWorkspaceLogs(workspaceDir, { weeklyKeepWeeks: 2 });

      const archive = await readFile(
        join(workspaceDir, "memory", "weekly", "archive-2026.md"),
        "utf-8",
      );
      expect(archive).toContain("## 2026-W01");
      expect(archive).toContain("Summary for week 1");
      expect(archive).toContain("## 2026-W04");
      expect(archive).toContain("Summary for week 4");
    });

    it("removes archived weekly files from the directory", async () => {
      for (let i = 1; i <= 5; i++) {
        await writeFile(
          join(workspaceDir, "memory", "weekly", `2026-W${String(i).padStart(2, "0")}.md`),
          `Week ${i}`,
        );
      }

      await rotateWorkspaceLogs(workspaceDir, { weeklyKeepWeeks: 2 });

      const remaining = await readdir(join(workspaceDir, "memory", "weekly"));
      expect(remaining).not.toContain("2026-W01.md");
      expect(remaining).not.toContain("2026-W02.md");
      expect(remaining).not.toContain("2026-W03.md");
      expect(remaining).toContain("2026-W04.md");
      expect(remaining).toContain("2026-W05.md");
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Archive format: yearly bundles
  // ---------------------------------------------------------------------------
  describe("archive format (yearly bundles)", () => {
    it("groups diary files into yearly archive files", async () => {
      await writeFile(join(workspaceDir, "diary", "2025-12-30.md"), "Last year 1");
      await writeFile(join(workspaceDir, "diary", "2025-12-31.md"), "Last year 2");
      await writeFile(join(workspaceDir, "diary", "2026-01-01.md"), "This year 1");
      await writeFile(join(workspaceDir, "diary", "2026-01-02.md"), "This year 2");

      const result = await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 1 });
      expect(result.diaryArchived).toBe(3);
      expect(result.archiveFiles).toContain("diary/archive-2025.md");
      expect(result.archiveFiles).toContain("diary/archive-2026.md");

      // Verify separate archives exist
      const archive2025 = await readFile(join(workspaceDir, "diary", "archive-2025.md"), "utf-8");
      expect(archive2025).toContain("## 2025-12-30");
      expect(archive2025).toContain("## 2025-12-31");

      const archive2026 = await readFile(join(workspaceDir, "diary", "archive-2026.md"), "utf-8");
      expect(archive2026).toContain("## 2026-01-01");
    });

    it("groups weekly files into yearly archive files", async () => {
      await writeFile(
        join(workspaceDir, "memory", "weekly", "2025-W50.md"),
        "Late 2025 w50",
      );
      await writeFile(
        join(workspaceDir, "memory", "weekly", "2025-W52.md"),
        "Late 2025 w52",
      );
      await writeFile(
        join(workspaceDir, "memory", "weekly", "2026-W01.md"),
        "Early 2026 w01",
      );
      await writeFile(
        join(workspaceDir, "memory", "weekly", "2026-W02.md"),
        "Early 2026 w02",
      );

      const result = await rotateWorkspaceLogs(workspaceDir, { weeklyKeepWeeks: 1 });
      expect(result.weeklyArchived).toBe(3);
      expect(result.archiveFiles).toContain("memory/weekly/archive-2025.md");
      expect(result.archiveFiles).toContain("memory/weekly/archive-2026.md");
    });

    it("archive file starts with a header containing the year", async () => {
      for (let i = 1; i <= 5; i++) {
        await writeFile(
          join(workspaceDir, "diary", `2026-01-${String(i).padStart(2, "0")}.md`),
          `Entry ${i}`,
        );
      }

      await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 2 });

      const archive = await readFile(join(workspaceDir, "diary", "archive-2026.md"), "utf-8");
      expect(archive).toMatch(/^# Diary Archive — 2026/);
    });

    it("archive entries are separated by horizontal rules", async () => {
      for (let i = 1; i <= 4; i++) {
        await writeFile(
          join(workspaceDir, "diary", `2026-01-${String(i).padStart(2, "0")}.md`),
          `Content ${i}`,
        );
      }

      await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 1 });

      const archive = await readFile(join(workspaceDir, "diary", "archive-2026.md"), "utf-8");
      // Each entry is preceded by ---
      const separators = archive.match(/^---$/gm);
      expect(separators).not.toBeNull();
      expect(separators!.length).toBe(3); // 3 archived entries, each preceded by ---
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Retention policies: default 90 diary, 12 weekly
  // ---------------------------------------------------------------------------
  describe("retention policies: defaults", () => {
    it("uses default retention of 90 diary files", async () => {
      // Create 90 diary files -- should NOT rotate
      for (let i = 0; i < 90; i++) {
        const date = new Date(2026, 0, 1 + i); // Jan 1 onwards
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        await writeFile(
          join(workspaceDir, "diary", `${y}-${m}-${d}.md`),
          `Day ${i + 1}`,
        );
      }

      const result = await rotateWorkspaceLogs(workspaceDir);
      expect(result.diaryArchived).toBe(0);
    });

    it("archives when diary count exceeds default 90", async () => {
      // Create 92 diary files -- should archive 2
      for (let i = 0; i < 92; i++) {
        const date = new Date(2026, 0, 1 + i);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        await writeFile(
          join(workspaceDir, "diary", `${y}-${m}-${d}.md`),
          `Day ${i + 1}`,
        );
      }

      const result = await rotateWorkspaceLogs(workspaceDir);
      expect(result.diaryArchived).toBe(2);
    });

    it("uses default retention of 12 weekly files", async () => {
      // Create 12 weekly files -- should NOT rotate
      for (let i = 1; i <= 12; i++) {
        await writeFile(
          join(workspaceDir, "memory", "weekly", `2026-W${String(i).padStart(2, "0")}.md`),
          `Week ${i}`,
        );
      }

      const result = await rotateWorkspaceLogs(workspaceDir);
      expect(result.weeklyArchived).toBe(0);
    });

    it("archives when weekly count exceeds default 12", async () => {
      for (let i = 1; i <= 15; i++) {
        await writeFile(
          join(workspaceDir, "memory", "weekly", `2026-W${String(i).padStart(2, "0")}.md`),
          `Week ${i}`,
        );
      }

      const result = await rotateWorkspaceLogs(workspaceDir);
      expect(result.weeklyArchived).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Custom retention settings
  // ---------------------------------------------------------------------------
  describe("custom retention settings", () => {
    it("respects custom diaryKeepDays", async () => {
      for (let i = 1; i <= 10; i++) {
        await writeFile(
          join(workspaceDir, "diary", `2026-02-${String(i).padStart(2, "0")}.md`),
          `Day ${i}`,
        );
      }

      const result = await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 3 });
      expect(result.diaryArchived).toBe(7);

      const remaining = await readdir(join(workspaceDir, "diary"));
      const diaryFiles = remaining.filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
      expect(diaryFiles.length).toBe(3);
    });

    it("respects custom weeklyKeepWeeks", async () => {
      for (let i = 1; i <= 10; i++) {
        await writeFile(
          join(workspaceDir, "memory", "weekly", `2026-W${String(i).padStart(2, "0")}.md`),
          `Week ${i}`,
        );
      }

      const result = await rotateWorkspaceLogs(workspaceDir, { weeklyKeepWeeks: 2 });
      expect(result.weeklyArchived).toBe(8);
    });

    it("allows setting both custom values simultaneously", async () => {
      for (let i = 1; i <= 8; i++) {
        await writeFile(
          join(workspaceDir, "diary", `2026-01-${String(i).padStart(2, "0")}.md`),
          `Day ${i}`,
        );
        await writeFile(
          join(workspaceDir, "memory", "weekly", `2026-W${String(i).padStart(2, "0")}.md`),
          `Week ${i}`,
        );
      }

      const result = await rotateWorkspaceLogs(workspaceDir, {
        diaryKeepDays: 5,
        weeklyKeepWeeks: 3,
      });
      expect(result.diaryArchived).toBe(3);
      expect(result.weeklyArchived).toBe(5);
    });

    it("partial config overrides only specified fields", async () => {
      // Only override diary, weekly should use default 12
      for (let i = 1; i <= 14; i++) {
        await writeFile(
          join(workspaceDir, "memory", "weekly", `2026-W${String(i).padStart(2, "0")}.md`),
          `Week ${i}`,
        );
      }

      const result = await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 5 });
      // Weekly uses default 12, so 14 - 12 = 2 archived
      expect(result.weeklyArchived).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Only files older than retention period get rotated (sort-based)
  // ---------------------------------------------------------------------------
  describe("retention boundary correctness", () => {
    it("archives only the oldest files beyond the keep limit", async () => {
      // Create files with gaps in dates
      const dates = [
        "2026-01-05",
        "2026-01-15",
        "2026-01-25",
        "2026-02-05",
        "2026-02-15",
      ];
      for (const date of dates) {
        await writeFile(
          join(workspaceDir, "diary", `${date}.md`),
          `Entry for ${date}`,
        );
      }

      const result = await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 3 });
      expect(result.diaryArchived).toBe(2);

      const remaining = await readdir(join(workspaceDir, "diary"));
      const diaryFiles = remaining.filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort();
      // Only the 2 oldest (2026-01-05, 2026-01-15) should be archived
      expect(diaryFiles).toEqual(["2026-01-25.md", "2026-02-05.md", "2026-02-15.md"]);
    });

    it("rotation is based on sorted filename order, not filesystem order", async () => {
      // Write files out of chronological order
      await writeFile(join(workspaceDir, "diary", "2026-03-01.md"), "March");
      await writeFile(join(workspaceDir, "diary", "2026-01-01.md"), "January");
      await writeFile(join(workspaceDir, "diary", "2026-02-01.md"), "February");

      const result = await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 1 });
      expect(result.diaryArchived).toBe(2);

      const remaining = await readdir(join(workspaceDir, "diary"));
      const diaryFiles = remaining.filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
      // Only the latest (March) should remain
      expect(diaryFiles).toEqual(["2026-03-01.md"]);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Files within retention are preserved
  // ---------------------------------------------------------------------------
  describe("files within retention are preserved", () => {
    it("does nothing when diary count is within limit", async () => {
      for (let i = 1; i <= 5; i++) {
        await writeFile(
          join(workspaceDir, "diary", `2026-02-${String(i).padStart(2, "0")}.md`),
          `Day ${i}`,
        );
      }

      const result = await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 10 });
      expect(result.diaryArchived).toBe(0);
      expect(result.archiveFiles.length).toBe(0);
    });

    it("does nothing when weekly count is within limit", async () => {
      for (let i = 1; i <= 5; i++) {
        await writeFile(
          join(workspaceDir, "memory", "weekly", `2026-W${String(i).padStart(2, "0")}.md`),
          `Week ${i}`,
        );
      }

      const result = await rotateWorkspaceLogs(workspaceDir, { weeklyKeepWeeks: 10 });
      expect(result.weeklyArchived).toBe(0);
    });

    it("does nothing when file count exactly equals the limit", async () => {
      for (let i = 1; i <= 5; i++) {
        await writeFile(
          join(workspaceDir, "diary", `2026-01-${String(i).padStart(2, "0")}.md`),
          `Day ${i}`,
        );
      }

      const result = await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 5 });
      expect(result.diaryArchived).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Idempotent: running twice doesn't duplicate archives
  // ---------------------------------------------------------------------------
  describe("idempotency", () => {
    it("running rotation twice does not duplicate archived content", async () => {
      for (let i = 1; i <= 6; i++) {
        await writeFile(
          join(workspaceDir, "diary", `2026-01-${String(i).padStart(2, "0")}.md`),
          `Day ${i} content`,
        );
      }

      // First rotation
      const result1 = await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 3 });
      expect(result1.diaryArchived).toBe(3);

      const archiveAfterFirst = await readFile(
        join(workspaceDir, "diary", "archive-2026.md"),
        "utf-8",
      );

      // Second rotation (no new files to archive)
      const result2 = await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 3 });
      expect(result2.diaryArchived).toBe(0);

      const archiveAfterSecond = await readFile(
        join(workspaceDir, "diary", "archive-2026.md"),
        "utf-8",
      );

      // Archive should be unchanged
      expect(archiveAfterSecond).toBe(archiveAfterFirst);
    });

    it("running weekly rotation twice does not duplicate archived content", async () => {
      for (let i = 1; i <= 6; i++) {
        await writeFile(
          join(workspaceDir, "memory", "weekly", `2026-W${String(i).padStart(2, "0")}.md`),
          `Week ${i}`,
        );
      }

      const result1 = await rotateWorkspaceLogs(workspaceDir, { weeklyKeepWeeks: 3 });
      expect(result1.weeklyArchived).toBe(3);

      const archiveAfterFirst = await readFile(
        join(workspaceDir, "memory", "weekly", "archive-2026.md"),
        "utf-8",
      );

      const result2 = await rotateWorkspaceLogs(workspaceDir, { weeklyKeepWeeks: 3 });
      expect(result2.weeklyArchived).toBe(0);

      const archiveAfterSecond = await readFile(
        join(workspaceDir, "memory", "weekly", "archive-2026.md"),
        "utf-8",
      );

      expect(archiveAfterSecond).toBe(archiveAfterFirst);
    });

    it("appends to existing archive when new files need rotation", async () => {
      // Pre-existing archive from a prior rotation
      await writeFile(
        join(workspaceDir, "diary", "archive-2026.md"),
        "# Diary Archive — 2026\n\n---\n\n## 2026-01-01\n\nOld entry\n\n",
      );

      for (let i = 10; i <= 15; i++) {
        await writeFile(
          join(workspaceDir, "diary", `2026-01-${i}.md`),
          `New entry ${i}`,
        );
      }

      await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 2 });

      const archive = await readFile(join(workspaceDir, "diary", "archive-2026.md"), "utf-8");
      // Old content preserved
      expect(archive).toContain("Old entry");
      // New content appended
      expect(archive).toContain("New entry 10");
      expect(archive).toContain("New entry 13");
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Edge cases
  // ---------------------------------------------------------------------------
  describe("edge cases", () => {
    it("handles missing diary directory", async () => {
      await rm(join(workspaceDir, "diary"), { recursive: true });

      const result = await rotateWorkspaceLogs(workspaceDir);
      expect(result.diaryArchived).toBe(0);
      expect(result.weeklyArchived).toBe(0);
    });

    it("handles missing weekly directory", async () => {
      await rm(join(workspaceDir, "memory"), { recursive: true });

      const result = await rotateWorkspaceLogs(workspaceDir);
      expect(result.weeklyArchived).toBe(0);
    });

    it("handles empty diary directory (no files to rotate)", async () => {
      const result = await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 5 });
      expect(result.diaryArchived).toBe(0);
      expect(result.archiveFiles.length).toBe(0);
    });

    it("handles empty weekly directory (no files to rotate)", async () => {
      const result = await rotateWorkspaceLogs(workspaceDir, { weeklyKeepWeeks: 5 });
      expect(result.weeklyArchived).toBe(0);
    });

    it("ignores non-diary files in the diary directory", async () => {
      await writeFile(join(workspaceDir, "diary", "notes.md"), "Notes");
      await writeFile(join(workspaceDir, "diary", "archive-2025.md"), "Archive");
      await writeFile(join(workspaceDir, "diary", "readme.txt"), "Readme");
      await writeFile(join(workspaceDir, "diary", "2026-01-01.md"), "Entry");

      const result = await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 0 });
      expect(result.diaryArchived).toBe(1);

      // Non-diary files should remain untouched
      const remaining = await readdir(join(workspaceDir, "diary"));
      expect(remaining).toContain("notes.md");
      expect(remaining).toContain("readme.txt");
    });

    it("ignores non-weekly files in the weekly directory", async () => {
      await writeFile(
        join(workspaceDir, "memory", "weekly", "notes.md"),
        "Notes",
      );
      await writeFile(
        join(workspaceDir, "memory", "weekly", "archive-2025.md"),
        "Archive",
      );
      await writeFile(
        join(workspaceDir, "memory", "weekly", "2026-W01.md"),
        "Week 1",
      );

      const result = await rotateWorkspaceLogs(workspaceDir, { weeklyKeepWeeks: 0 });
      expect(result.weeklyArchived).toBe(1);

      const remaining = await readdir(join(workspaceDir, "memory", "weekly"));
      expect(remaining).toContain("notes.md");
    });

    it("handles future-dated diary files (treats them the same as any other)", async () => {
      // Future dates — the system only cares about count and sort order
      await writeFile(join(workspaceDir, "diary", "2026-01-01.md"), "Past");
      await writeFile(join(workspaceDir, "diary", "2026-06-01.md"), "Present");
      await writeFile(join(workspaceDir, "diary", "2030-12-31.md"), "Far future");

      const result = await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 1 });
      expect(result.diaryArchived).toBe(2);

      const remaining = await readdir(join(workspaceDir, "diary"));
      const diaryFiles = remaining.filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
      // Only the latest by sort order should remain
      expect(diaryFiles).toEqual(["2030-12-31.md"]);
    });

    it("handles a keepDays of 0 (archive all diary files)", async () => {
      for (let i = 1; i <= 3; i++) {
        await writeFile(
          join(workspaceDir, "diary", `2026-02-${String(i).padStart(2, "0")}.md`),
          `Day ${i}`,
        );
      }

      const result = await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 0 });
      expect(result.diaryArchived).toBe(3);

      const remaining = await readdir(join(workspaceDir, "diary"));
      const diaryFiles = remaining.filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
      expect(diaryFiles.length).toBe(0);
    });

    it("handles a keepWeeks of 0 (archive all weekly files)", async () => {
      for (let i = 1; i <= 3; i++) {
        await writeFile(
          join(workspaceDir, "memory", "weekly", `2026-W${String(i).padStart(2, "0")}.md`),
          `Week ${i}`,
        );
      }

      const result = await rotateWorkspaceLogs(workspaceDir, { weeklyKeepWeeks: 0 });
      expect(result.weeklyArchived).toBe(3);

      const remaining = await readdir(join(workspaceDir, "memory", "weekly"));
      const weeklyFiles = remaining.filter((f) => /^\d{4}-W\d{2}\.md$/.test(f));
      expect(weeklyFiles.length).toBe(0);
    });

    it("handles workspace with no diary or weekly directories at all", async () => {
      const emptyWorkspace = await mkdtemp(join(tmpdir(), "yadori-empty-"));
      try {
        const result = await rotateWorkspaceLogs(emptyWorkspace);
        expect(result.diaryArchived).toBe(0);
        expect(result.weeklyArchived).toBe(0);
        expect(result.archiveFiles.length).toBe(0);
      } finally {
        await rm(emptyWorkspace, { recursive: true, force: true });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // estimateWorkspaceSize
  // ---------------------------------------------------------------------------
  describe("estimateWorkspaceSize", () => {
    it("counts files in each category", async () => {
      await writeFile(join(workspaceDir, "diary", "2026-02-01.md"), "D1");
      await writeFile(join(workspaceDir, "diary", "2026-02-02.md"), "D2");
      await writeFile(join(workspaceDir, "memory", "weekly", "2026-W08.md"), "W8");
      await writeFile(join(workspaceDir, "memory", "monthly", "2026-02.md"), "M2");

      const size = await estimateWorkspaceSize(workspaceDir);
      expect(size.diaryFiles).toBe(2);
      expect(size.weeklyFiles).toBe(1);
      expect(size.monthlyFiles).toBe(1);
      expect(size.totalFiles).toBe(4);
    });

    it("handles missing directories gracefully", async () => {
      await rm(join(workspaceDir, "diary"), { recursive: true });
      await rm(join(workspaceDir, "memory"), { recursive: true });

      const size = await estimateWorkspaceSize(workspaceDir);
      expect(size.diaryFiles).toBe(0);
      expect(size.weeklyFiles).toBe(0);
      expect(size.monthlyFiles).toBe(0);
      expect(size.totalFiles).toBe(0);
    });

    it("counts archive files as part of totals", async () => {
      await writeFile(join(workspaceDir, "diary", "2026-01-01.md"), "Entry");
      await writeFile(join(workspaceDir, "diary", "archive-2025.md"), "Archive");

      const size = await estimateWorkspaceSize(workspaceDir);
      // Both .md files are counted
      expect(size.diaryFiles).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Combined diary + weekly rotation
  // ---------------------------------------------------------------------------
  describe("combined rotation", () => {
    it("rotates both diary and weekly in a single call", async () => {
      for (let i = 1; i <= 8; i++) {
        await writeFile(
          join(workspaceDir, "diary", `2026-02-${String(i).padStart(2, "0")}.md`),
          `Diary ${i}`,
        );
        await writeFile(
          join(workspaceDir, "memory", "weekly", `2026-W${String(i).padStart(2, "0")}.md`),
          `Weekly ${i}`,
        );
      }

      const result = await rotateWorkspaceLogs(workspaceDir, {
        diaryKeepDays: 4,
        weeklyKeepWeeks: 4,
      });

      expect(result.diaryArchived).toBe(4);
      expect(result.weeklyArchived).toBe(4);
      expect(result.archiveFiles.length).toBe(2);
      expect(result.archiveFiles).toContain("diary/archive-2026.md");
      expect(result.archiveFiles).toContain("memory/weekly/archive-2026.md");
    });

    it("result archiveFiles lists all created/updated archive paths", async () => {
      // Create cross-year diary + weekly
      await writeFile(join(workspaceDir, "diary", "2025-12-01.md"), "Old diary");
      await writeFile(join(workspaceDir, "diary", "2026-01-01.md"), "New diary");
      await writeFile(
        join(workspaceDir, "memory", "weekly", "2025-W48.md"),
        "Old weekly",
      );
      await writeFile(
        join(workspaceDir, "memory", "weekly", "2026-W01.md"),
        "New weekly",
      );

      const result = await rotateWorkspaceLogs(workspaceDir, {
        diaryKeepDays: 1,
        weeklyKeepWeeks: 1,
      });

      expect(result.archiveFiles).toContain("diary/archive-2025.md");
      expect(result.archiveFiles).toContain("memory/weekly/archive-2025.md");
    });
  });
});
