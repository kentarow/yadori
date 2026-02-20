/**
 * Log Rotation — Prevent unbounded growth of diary and memory files.
 *
 * Strategy:
 *   - Diary files: Keep recent N days, archive older ones to yearly bundles
 *   - Weekly memory: Keep recent N weeks, cold consolidation handles the rest
 *   - Monthly memory: Keep all (already compressed)
 *   - state.json: No rotation needed (single file, overwritten)
 *
 * Archiving is non-destructive: old files are merged into archive files,
 * not deleted. The entity's full history is preserved, just compacted.
 */

import { readFile, writeFile, readdir, unlink, mkdir, access } from "node:fs/promises";
import { join } from "node:path";

export interface RotationConfig {
  /** Number of daily diary files to keep individual. Default: 90 */
  diaryKeepDays: number;
  /** Number of weekly summary files to keep individual. Default: 12 */
  weeklyKeepWeeks: number;
}

export interface RotationResult {
  diaryArchived: number;
  weeklyArchived: number;
  archiveFiles: string[];
}

const DEFAULT_CONFIG: RotationConfig = {
  diaryKeepDays: 90,
  weeklyKeepWeeks: 12,
};

/**
 * Run log rotation on the workspace.
 * Archives old diary and weekly memory files into yearly bundles.
 */
export async function rotateWorkspaceLogs(
  workspaceRoot: string,
  config: Partial<RotationConfig> = {},
): Promise<RotationResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const result: RotationResult = {
    diaryArchived: 0,
    weeklyArchived: 0,
    archiveFiles: [],
  };

  // Rotate diary files
  const diaryResult = await rotateDiary(workspaceRoot, cfg.diaryKeepDays);
  result.diaryArchived = diaryResult.archived;
  result.archiveFiles.push(...diaryResult.archiveFiles);

  // Rotate weekly summaries
  const weeklyResult = await rotateWeekly(workspaceRoot, cfg.weeklyKeepWeeks);
  result.weeklyArchived = weeklyResult.archived;
  result.archiveFiles.push(...weeklyResult.archiveFiles);

  return result;
}

/**
 * Archive old diary files into yearly bundles.
 * Example: diary/2026-01-15.md, diary/2026-01-16.md → diary/archive-2026.md
 */
async function rotateDiary(
  workspaceRoot: string,
  keepDays: number,
): Promise<{ archived: number; archiveFiles: string[] }> {
  const diaryDir = join(workspaceRoot, "diary");

  try {
    await access(diaryDir);
  } catch {
    return { archived: 0, archiveFiles: [] };
  }

  const entries = await readdir(diaryDir);
  const diaryFiles = entries
    .filter((e) => /^\d{4}-\d{2}-\d{2}\.md$/.test(e))
    .sort();

  if (diaryFiles.length <= keepDays) {
    return { archived: 0, archiveFiles: [] };
  }

  // Files to archive (oldest ones beyond keepDays)
  const toArchive = diaryFiles.slice(0, diaryFiles.length - keepDays);

  // Group by year
  const byYear = new Map<string, string[]>();
  for (const file of toArchive) {
    const year = file.slice(0, 4);
    const existing = byYear.get(year) ?? [];
    existing.push(file);
    byYear.set(year, existing);
  }

  const archiveFiles: string[] = [];

  for (const [year, files] of byYear) {
    const archivePath = join(diaryDir, `archive-${year}.md`);

    // Load existing archive content if present
    let archiveContent = "";
    try {
      archiveContent = await readFile(archivePath, "utf-8");
    } catch {
      archiveContent = `# Diary Archive — ${year}\n\n`;
    }

    // Append each diary file to the archive
    for (const file of files) {
      const filePath = join(diaryDir, file);
      const content = await readFile(filePath, "utf-8");
      const date = file.replace(".md", "");
      archiveContent += `---\n\n## ${date}\n\n${content.trim()}\n\n`;
    }

    // Write archive and remove individual files
    await writeFile(archivePath, archiveContent, "utf-8");

    for (const file of files) {
      await unlink(join(diaryDir, file));
    }

    archiveFiles.push(`diary/archive-${year}.md`);
  }

  return { archived: toArchive.length, archiveFiles };
}

/**
 * Archive old weekly summary files into yearly bundles.
 * Example: memory/weekly/2026-W01.md → memory/weekly/archive-2026.md
 */
async function rotateWeekly(
  workspaceRoot: string,
  keepWeeks: number,
): Promise<{ archived: number; archiveFiles: string[] }> {
  const weeklyDir = join(workspaceRoot, "memory", "weekly");

  try {
    await access(weeklyDir);
  } catch {
    return { archived: 0, archiveFiles: [] };
  }

  const entries = await readdir(weeklyDir);
  const weeklyFiles = entries
    .filter((e) => /^\d{4}-W\d{2}\.md$/.test(e))
    .sort();

  if (weeklyFiles.length <= keepWeeks) {
    return { archived: 0, archiveFiles: [] };
  }

  const toArchive = weeklyFiles.slice(0, weeklyFiles.length - keepWeeks);

  const byYear = new Map<string, string[]>();
  for (const file of toArchive) {
    const year = file.slice(0, 4);
    const existing = byYear.get(year) ?? [];
    existing.push(file);
    byYear.set(year, existing);
  }

  const archiveFiles: string[] = [];

  for (const [year, files] of byYear) {
    const archivePath = join(weeklyDir, `archive-${year}.md`);

    let archiveContent = "";
    try {
      archiveContent = await readFile(archivePath, "utf-8");
    } catch {
      archiveContent = `# Weekly Memory Archive — ${year}\n\n`;
    }

    for (const file of files) {
      const filePath = join(weeklyDir, file);
      const content = await readFile(filePath, "utf-8");
      const week = file.replace(".md", "");
      archiveContent += `---\n\n## ${week}\n\n${content.trim()}\n\n`;
    }

    await writeFile(archivePath, archiveContent, "utf-8");

    for (const file of files) {
      await unlink(join(weeklyDir, file));
    }

    archiveFiles.push(`memory/weekly/archive-${year}.md`);
  }

  return { archived: toArchive.length, archiveFiles };
}

/**
 * Estimate workspace size in bytes.
 * Useful for monitoring growth over time.
 */
export async function estimateWorkspaceSize(workspaceRoot: string): Promise<{
  diaryFiles: number;
  weeklyFiles: number;
  monthlyFiles: number;
  totalFiles: number;
}> {
  let diaryFiles = 0;
  let weeklyFiles = 0;
  let monthlyFiles = 0;

  try {
    const diary = await readdir(join(workspaceRoot, "diary"));
    diaryFiles = diary.filter((e) => e.endsWith(".md")).length;
  } catch { /* directory may not exist */ }

  try {
    const weekly = await readdir(join(workspaceRoot, "memory", "weekly"));
    weeklyFiles = weekly.filter((e) => e.endsWith(".md")).length;
  } catch { /* directory may not exist */ }

  try {
    const monthly = await readdir(join(workspaceRoot, "memory", "monthly"));
    monthlyFiles = monthly.filter((e) => e.endsWith(".md")).length;
  } catch { /* directory may not exist */ }

  return {
    diaryFiles,
    weeklyFiles,
    monthlyFiles,
    totalFiles: diaryFiles + weeklyFiles + monthlyFiles,
  };
}
