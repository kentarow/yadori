import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile, readdir } from "node:fs/promises";
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

  describe("diary rotation", () => {
    it("does nothing when diary count is within limit", async () => {
      for (let i = 1; i <= 5; i++) {
        await writeFile(
          join(workspaceDir, "diary", `2026-02-${String(i).padStart(2, "0")}.md`),
          `Day ${i}`,
        );
      }

      const result = await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 10 });
      expect(result.diaryArchived).toBe(0);
    });

    it("archives oldest diary files when over limit", async () => {
      // Create 10 diary files, keep 5
      for (let i = 1; i <= 10; i++) {
        await writeFile(
          join(workspaceDir, "diary", `2026-02-${String(i).padStart(2, "0")}.md`),
          `# Diary\n\nDay ${i} content`,
        );
      }

      const result = await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 5 });
      expect(result.diaryArchived).toBe(5);

      // Oldest 5 should be gone
      const remaining = await readdir(join(workspaceDir, "diary"));
      const diaryFiles = remaining.filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
      expect(diaryFiles.length).toBe(5);
      expect(diaryFiles).toContain("2026-02-06.md"); // first remaining
      expect(diaryFiles).not.toContain("2026-02-01.md"); // archived

      // Archive file should exist
      expect(remaining).toContain("archive-2026.md");
    });

    it("creates yearly archive with diary content", async () => {
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
      expect(archive).toContain("## 2026-01-03");
      expect(archive).toContain("Entry for day 3");
    });

    it("appends to existing archive", async () => {
      // Pre-existing archive
      await writeFile(
        join(workspaceDir, "diary", "archive-2026.md"),
        "# Diary Archive — 2026\n\n## 2026-01-01\n\nOld entry\n\n",
      );

      for (let i = 10; i <= 15; i++) {
        await writeFile(
          join(workspaceDir, "diary", `2026-01-${i}.md`),
          `New entry ${i}`,
        );
      }

      await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 2 });

      const archive = await readFile(join(workspaceDir, "diary", "archive-2026.md"), "utf-8");
      expect(archive).toContain("Old entry");
      expect(archive).toContain("New entry 10");
    });

    it("handles cross-year diary files", async () => {
      await writeFile(join(workspaceDir, "diary", "2025-12-30.md"), "Last year 1");
      await writeFile(join(workspaceDir, "diary", "2025-12-31.md"), "Last year 2");
      await writeFile(join(workspaceDir, "diary", "2026-01-01.md"), "This year 1");
      await writeFile(join(workspaceDir, "diary", "2026-01-02.md"), "This year 2");

      const result = await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 1 });
      expect(result.diaryArchived).toBe(3);
      expect(result.archiveFiles).toContain("diary/archive-2025.md");
      expect(result.archiveFiles).toContain("diary/archive-2026.md");
    });
  });

  describe("weekly memory rotation", () => {
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

    it("archives oldest weekly files when over limit", async () => {
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
      expect(weeklyFiles).toContain("2026-W05.md"); // first remaining
    });

    it("creates yearly archive with weekly content", async () => {
      for (let i = 1; i <= 6; i++) {
        await writeFile(
          join(workspaceDir, "memory", "weekly", `2026-W${String(i).padStart(2, "0")}.md`),
          `Summary for week ${i}`,
        );
      }

      await rotateWorkspaceLogs(workspaceDir, { weeklyKeepWeeks: 2 });

      const archive = await readFile(join(workspaceDir, "memory", "weekly", "archive-2026.md"), "utf-8");
      expect(archive).toContain("## 2026-W01");
      expect(archive).toContain("Summary for week 1");
    });
  });

  describe("edge cases", () => {
    it("handles missing diary directory", async () => {
      await rm(join(workspaceDir, "diary"), { recursive: true });

      const result = await rotateWorkspaceLogs(workspaceDir);
      expect(result.diaryArchived).toBe(0);
    });

    it("handles missing weekly directory", async () => {
      await rm(join(workspaceDir, "memory"), { recursive: true });

      const result = await rotateWorkspaceLogs(workspaceDir);
      expect(result.weeklyArchived).toBe(0);
    });

    it("ignores non-diary files in diary directory", async () => {
      await writeFile(join(workspaceDir, "diary", "notes.md"), "Notes");
      await writeFile(join(workspaceDir, "diary", "archive-2025.md"), "Archive");
      await writeFile(join(workspaceDir, "diary", "2026-01-01.md"), "Entry");

      const result = await rotateWorkspaceLogs(workspaceDir, { diaryKeepDays: 0 });
      expect(result.diaryArchived).toBe(1);
    });
  });

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
      expect(size.totalFiles).toBe(0);
    });
  });
});
