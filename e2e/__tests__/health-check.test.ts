/**
 * End-to-End Test: Health Check System
 *
 * Verifies the complete health diagnostics pipeline:
 *   - 9-point workspace health check
 *   - Workspace repair (--repair flag logic)
 *   - Report format and structure
 *
 * Tests use real filesystem operations against temporary workspace directories.
 * No mocks — exercises actual runHealthCheck() and repairWorkspace() functions.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtemp,
  rm,
  writeFile,
  mkdir,
  unlink,
  readFile,
  utimes,
  access,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runHealthCheck,
  type HealthReport,
  type HealthCheckItem,
  type CheckStatus,
} from "../../engine/src/health/health-check.js";
import {
  repairWorkspace,
  type RepairResult,
} from "../../engine/src/health/workspace-repair.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a complete, healthy workspace for testing. */
async function createHealthyWorkspace(dir: string): Promise<void> {
  await mkdir(join(dir, "memory", "weekly"), { recursive: true });
  await mkdir(join(dir, "memory", "monthly"), { recursive: true });
  await mkdir(join(dir, "diary"), { recursive: true });
  await mkdir(join(dir, "growth", "portraits"), { recursive: true });

  await writeFile(
    join(dir, "SEED.md"),
    `# SEED
- **Perception**: chromatic
- **Seed Hash**: abc123
- **Platform**: darwin
- **Architecture**: arm64
`,
  );

  await writeFile(
    join(dir, "STATUS.md"),
    `# STATUS

## Current State

- **mood**: 65
- **energy**: 50
- **curiosity**: 70
- **comfort**: 55

## Language

- **level**: 1

## Perception

- **perception_level**: 1

## Growth

- **day**: 7
- **last_interaction**: ${new Date().toISOString()}
`,
  );

  await writeFile(
    join(dir, "state.json"),
    JSON.stringify({
      seed: { perception: "chromatic" },
      status: { mood: 65, energy: 50, growthDay: 7 },
    }),
  );

  await writeFile(join(dir, "SOUL.md"), "# SOUL\nPersonality.");
  await writeFile(join(dir, "MEMORY.md"), "# MEMORY\n\nNo recent memories.");
  await writeFile(join(dir, "LANGUAGE.md"), "# LANGUAGE\nLevel 1.");
}

/** Helper: find a check by name in the report. */
function findCheck(report: HealthReport, name: string): HealthCheckItem | undefined {
  return report.checks.find((c) => c.name === name);
}

/** Set a file's mtime to a specific time in the past. */
async function setFileAge(filePath: string, ageMs: number): Promise<void> {
  const past = new Date(Date.now() - ageMs);
  await utimes(filePath, past, past);
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("Health Check — 9-point diagnostic", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "yadori-health-e2e-"));
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  // =========================================================================
  // 1. Healthy workspace passes all checks
  // =========================================================================

  it("healthy workspace passes all non-dashboard checks", async () => {
    await createHealthyWorkspace(workspaceDir);
    const report = await runHealthCheck(workspaceDir, 0);

    expect(report.entityAlive).toBe(true);

    // Every check except dashboard should be ok
    const nonDashboard = report.checks.filter((c) => c.name !== "dashboard");
    for (const check of nonDashboard) {
      expect(check.status, `check '${check.name}' should be ok`).toBe("ok");
    }
  });

  it("report contains exactly 9 checks", async () => {
    await createHealthyWorkspace(workspaceDir);
    const report = await runHealthCheck(workspaceDir, 0);
    expect(report.checks).toHaveLength(9);
  });

  it("report contains an ISO timestamp", async () => {
    await createHealthyWorkspace(workspaceDir);
    const report = await runHealthCheck(workspaceDir, 0);
    // ISO 8601 format
    expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  // =========================================================================
  // 2. Missing workspace directory fails
  // =========================================================================

  it("missing workspace directory produces error overall", async () => {
    const report = await runHealthCheck("/nonexistent/workspace/xyz", 0);
    expect(report.overall).toBe("error");

    const wsCheck = findCheck(report, "workspace");
    expect(wsCheck?.status).toBe("error");
    expect(wsCheck?.message).toContain("not found");
  });

  it("missing workspace marks entityAlive as false", async () => {
    const report = await runHealthCheck("/nonexistent/workspace/xyz", 0);
    expect(report.entityAlive).toBe(false);
  });

  // =========================================================================
  // 3. Missing essential files detected
  // =========================================================================

  it("missing SEED.md triggers error status for essential-files", async () => {
    await createHealthyWorkspace(workspaceDir);
    await unlink(join(workspaceDir, "SEED.md"));

    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "essential-files");
    expect(check?.status).toBe("error");
    expect(check?.message).toContain("SEED.md");
    expect(check?.detail).toContain("genesis record");
  });

  it("missing SEED.md marks entityAlive as false", async () => {
    await createHealthyWorkspace(workspaceDir);
    await unlink(join(workspaceDir, "SEED.md"));

    const report = await runHealthCheck(workspaceDir, 0);
    expect(report.entityAlive).toBe(false);
  });

  it("missing STATUS.md produces warn (not error, since SEED.md present)", async () => {
    await createHealthyWorkspace(workspaceDir);
    await unlink(join(workspaceDir, "STATUS.md"));

    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "essential-files");
    expect(check?.status).toBe("warn");
    expect(check?.message).toContain("STATUS.md");
  });

  it("missing multiple non-SEED essential files is warn", async () => {
    await createHealthyWorkspace(workspaceDir);
    await unlink(join(workspaceDir, "SOUL.md"));
    await unlink(join(workspaceDir, "MEMORY.md"));

    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "essential-files");
    expect(check?.status).toBe("warn");
    expect(check?.message).toContain("SOUL.md");
    expect(check?.message).toContain("MEMORY.md");
  });

  it("all 5 essential files present yields ok", async () => {
    await createHealthyWorkspace(workspaceDir);
    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "essential-files");
    expect(check?.status).toBe("ok");
    expect(check?.message).toContain("5 essential files present");
  });

  // =========================================================================
  // 4. Corrupt / missing state file detected
  // =========================================================================

  it("missing state.json triggers state-file error", async () => {
    await createHealthyWorkspace(workspaceDir);
    await unlink(join(workspaceDir, "state.json"));

    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "state-file");
    expect(check?.status).toBe("error");
    expect(check?.message).toContain("No valid state.json");
  });

  it("corrupt (invalid JSON) state.json triggers state-file error", async () => {
    await createHealthyWorkspace(workspaceDir);
    await writeFile(join(workspaceDir, "state.json"), "NOT_VALID{JSON}}}");

    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "state-file");
    expect(check?.status).toBe("error");
  });

  it("state.json without seed field triggers state-file error", async () => {
    await createHealthyWorkspace(workspaceDir);
    await writeFile(
      join(workspaceDir, "state.json"),
      JSON.stringify({ status: { mood: 50 } }),
    );

    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "state-file");
    expect(check?.status).toBe("error");
  });

  it("state.json with seed and status fields is ok", async () => {
    await createHealthyWorkspace(workspaceDir);
    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "state-file");
    expect(check?.status).toBe("ok");
    expect(check?.detail).toContain("Species: chromatic");
    expect(check?.detail).toContain("Day: 7");
  });

  it("falls back to __state.json when state.json missing", async () => {
    await createHealthyWorkspace(workspaceDir);
    // Remove state.json, create __state.json
    await unlink(join(workspaceDir, "state.json"));
    await writeFile(
      join(workspaceDir, "__state.json"),
      JSON.stringify({
        seed: { perception: "vibration" },
        status: { mood: 40, growthDay: 3 },
      }),
    );

    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "state-file");
    expect(check?.status).toBe("ok");
    expect(check?.detail).toContain("Species: vibration");
  });

  // =========================================================================
  // 5. Stale heartbeat detected
  // =========================================================================

  it("recent state.json (< 60m) is heartbeat ok", async () => {
    await createHealthyWorkspace(workspaceDir);
    // state.json was just created, so it's fresh
    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "heartbeat");
    expect(check?.status).toBe("ok");
    expect(check?.message).toContain("Last heartbeat");
  });

  it("state.json older than 1h but less than 24h is heartbeat warn", async () => {
    await createHealthyWorkspace(workspaceDir);
    // Set state.json mtime to 3 hours ago
    await setFileAge(join(workspaceDir, "state.json"), 3 * 60 * 60_000);

    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "heartbeat");
    expect(check?.status).toBe("warn");
    expect(check?.message).toContain("3h ago");
  });

  it("state.json older than 24h is heartbeat error", async () => {
    await createHealthyWorkspace(workspaceDir);
    // Set state.json mtime to 48 hours ago
    await setFileAge(join(workspaceDir, "state.json"), 48 * 60 * 60_000);

    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "heartbeat");
    expect(check?.status).toBe("error");
    expect(check?.message).toContain("heartbeat may have stopped");
  });

  // =========================================================================
  // 6. Entity vitals checks
  // =========================================================================

  it("entity with low mood and low comfort triggers distress warning", async () => {
    await createHealthyWorkspace(workspaceDir);
    await writeFile(
      join(workspaceDir, "STATUS.md"),
      `# STATUS\n\n- **mood**: 5\n- **energy**: 40\n- **comfort**: 3\n- **day**: 10\n- **last_interaction**: ${new Date().toISOString()}\n`,
    );

    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "entity-vitals");
    expect(check?.status).toBe("warn");
    expect(check?.message).toContain("distress");
  });

  it("entity with low energy triggers exhaustion warning", async () => {
    await createHealthyWorkspace(workspaceDir);
    await writeFile(
      join(workspaceDir, "STATUS.md"),
      `# STATUS\n\n- **mood**: 50\n- **energy**: 3\n- **comfort**: 50\n- **day**: 10\n- **last_interaction**: ${new Date().toISOString()}\n`,
    );

    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "entity-vitals");
    expect(check?.status).toBe("warn");
    expect(check?.message).toContain("exhausted");
  });

  it("entity with healthy vitals shows ok", async () => {
    await createHealthyWorkspace(workspaceDir);
    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "entity-vitals");
    expect(check?.status).toBe("ok");
    expect(check?.message).toContain("mood:65");
    expect(check?.message).toContain("energy:50");
  });

  it("missing STATUS.md triggers entity-vitals error", async () => {
    await createHealthyWorkspace(workspaceDir);
    await unlink(join(workspaceDir, "STATUS.md"));

    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "entity-vitals");
    expect(check?.status).toBe("error");
    expect(check?.message).toContain("Cannot read STATUS.md");
  });

  // =========================================================================
  // 7. Last interaction checks
  // =========================================================================

  it("never-interacted entity triggers warn", async () => {
    await createHealthyWorkspace(workspaceDir);
    await writeFile(
      join(workspaceDir, "STATUS.md"),
      `# STATUS\n\n- **mood**: 50\n- **energy**: 50\n- **comfort**: 50\n- **day**: 0\n- **last_interaction**: never\n`,
    );

    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "last-interaction");
    expect(check?.status).toBe("warn");
    expect(check?.message).toContain("never been spoken to");
  });

  it("interaction 10 days ago triggers warn", async () => {
    await createHealthyWorkspace(workspaceDir);
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60_000).toISOString();
    await writeFile(
      join(workspaceDir, "STATUS.md"),
      `# STATUS\n\n- **mood**: 50\n- **energy**: 50\n- **comfort**: 50\n- **day**: 15\n- **last_interaction**: ${tenDaysAgo}\n`,
    );

    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "last-interaction");
    expect(check?.status).toBe("warn");
    expect(check?.message).toContain("10 days ago");
    expect(check?.detail).toContain("lonely");
  });

  it("recent interaction (just now) shows ok", async () => {
    await createHealthyWorkspace(workspaceDir);
    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "last-interaction");
    expect(check?.status).toBe("ok");
    expect(check?.message).toContain("just now");
  });

  // =========================================================================
  // 8. Memory integrity checks
  // =========================================================================

  it("well-formed MEMORY.md with diary entries shows ok", async () => {
    await createHealthyWorkspace(workspaceDir);
    await writeFile(join(workspaceDir, "diary", "2026-02-18.md"), "Day entry 1.");
    await writeFile(join(workspaceDir, "diary", "2026-02-19.md"), "Day entry 2.");
    await writeFile(join(workspaceDir, "diary", "2026-02-20.md"), "Day entry 3.");
    await writeFile(join(workspaceDir, "memory", "weekly", "2026-W08.md"), "Week 8.");

    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "memory");
    expect(check?.status).toBe("ok");
    expect(check?.message).toContain("3 diary entries");
    expect(check?.message).toContain("1 weekly summaries");
  });

  it("MEMORY.md without expected header triggers warn", async () => {
    await createHealthyWorkspace(workspaceDir);
    await writeFile(join(workspaceDir, "MEMORY.md"), "Some random content without header.");

    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "memory");
    expect(check?.status).toBe("warn");
    expect(check?.message).toContain("format unexpected");
  });

  it("missing MEMORY.md triggers memory warn", async () => {
    await createHealthyWorkspace(workspaceDir);
    await unlink(join(workspaceDir, "MEMORY.md"));

    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "memory");
    expect(check?.status).toBe("warn");
    expect(check?.message).toContain("Cannot read MEMORY.md");
  });

  it("zero diary entries still shows ok if MEMORY.md valid", async () => {
    await createHealthyWorkspace(workspaceDir);
    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "memory");
    expect(check?.status).toBe("ok");
    expect(check?.message).toContain("0 diary entries");
  });

  // =========================================================================
  // 9. Directory structure validation
  // =========================================================================

  it("complete directory structure passes", async () => {
    await createHealthyWorkspace(workspaceDir);
    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "directories");
    expect(check?.status).toBe("ok");
    expect(check?.message).toContain("intact");
  });

  it("missing diary directory triggers warn", async () => {
    await createHealthyWorkspace(workspaceDir);
    await rm(join(workspaceDir, "diary"), { recursive: true });

    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "directories");
    expect(check?.status).toBe("warn");
    expect(check?.message).toContain("diary");
  });

  it("missing all required directories triggers warn listing all", async () => {
    // Create workspace with files but no subdirectories
    await mkdir(workspaceDir, { recursive: true });
    await writeFile(join(workspaceDir, "SEED.md"), "# SEED\n");
    await writeFile(join(workspaceDir, "STATUS.md"), "# STATUS\n- **mood**: 50\n- **energy**: 50\n- **comfort**: 50\n- **day**: 0\n- **last_interaction**: never");
    await writeFile(join(workspaceDir, "SOUL.md"), "# SOUL");
    await writeFile(join(workspaceDir, "MEMORY.md"), "# MEMORY");
    await writeFile(join(workspaceDir, "LANGUAGE.md"), "# LANGUAGE");
    await writeFile(join(workspaceDir, "state.json"), JSON.stringify({ seed: { perception: "chromatic" }, status: { mood: 50 } }));

    const report = await runHealthCheck(workspaceDir, 0);
    const check = findCheck(report, "directories");
    expect(check?.status).toBe("warn");
    expect(check?.message).toContain("memory");
    expect(check?.message).toContain("diary");
    expect(check?.message).toContain("growth");
  });

  // =========================================================================
  // 10. Dashboard check
  // =========================================================================

  it("dashboard on unreachable port shows warn", async () => {
    await createHealthyWorkspace(workspaceDir);
    const report = await runHealthCheck(workspaceDir, 59999);
    const check = findCheck(report, "dashboard");
    expect(check?.status).toBe("warn");
    expect(check?.message).toContain("not running");
    expect(check?.detail).toContain("59999");
  });

  // =========================================================================
  // 11. Overall status computation
  // =========================================================================

  it("overall is error when any check is error", async () => {
    const report = await runHealthCheck("/nonexistent/workspace", 0);
    expect(report.overall).toBe("error");
  });

  it("overall is warn when highest severity is warn (no errors)", async () => {
    await createHealthyWorkspace(workspaceDir);
    // Dashboard won't be running -> produces warn
    const report = await runHealthCheck(workspaceDir, 59999);
    // The only non-ok check should be dashboard (warn)
    const nonOk = report.checks.filter((c) => c.status !== "ok");
    expect(nonOk.every((c) => c.status === "warn")).toBe(true);
    expect(report.overall).toBe("warn");
  });

  // =========================================================================
  // 12. Check names are correct and ordered
  // =========================================================================

  it("checks are returned in the documented 9-point order", async () => {
    await createHealthyWorkspace(workspaceDir);
    const report = await runHealthCheck(workspaceDir, 0);

    const names = report.checks.map((c) => c.name);
    expect(names).toEqual([
      "workspace",
      "essential-files",
      "state-file",
      "entity-vitals",
      "heartbeat",
      "last-interaction",
      "memory",
      "directories",
      "dashboard",
    ]);
  });
});

// ===========================================================================
// Workspace Repair
// ===========================================================================

describe("Workspace Repair — repairWorkspace()", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "yadori-repair-e2e-"));
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("creates missing directories", async () => {
    // Start with just state.json
    await writeFile(
      join(workspaceDir, "state.json"),
      JSON.stringify({
        seed: { perception: "geometric" },
        status: { mood: 40, energy: 60, growthDay: 5 },
      }),
    );

    const result = await repairWorkspace(workspaceDir);

    // All required directories should have been created
    const dirActions = result.actions.filter(
      (a) => a.file.endsWith("/") && a.action === "created",
    );
    expect(dirActions.length).toBeGreaterThanOrEqual(1);

    // Verify directories exist on disk
    for (const dir of ["memory", "memory/weekly", "memory/monthly", "diary", "growth", "growth/portraits"]) {
      await expect(access(join(workspaceDir, dir))).resolves.toBeUndefined();
    }
  });

  it("regenerates STATUS.md from state.json", async () => {
    await writeFile(
      join(workspaceDir, "state.json"),
      JSON.stringify({
        seed: { perception: "vibration" },
        status: { mood: 72, energy: 45, curiosity: 60, comfort: 55, growthDay: 12 },
      }),
    );

    const result = await repairWorkspace(workspaceDir);

    const statusAction = result.actions.find((a) => a.file === "STATUS.md");
    expect(statusAction).toBeDefined();
    expect(statusAction?.action).toBe("created");

    const content = await readFile(join(workspaceDir, "STATUS.md"), "utf-8");
    expect(content).toContain("**mood**: 72");
    expect(content).toContain("**energy**: 45");
    expect(content).toContain("**day**: 12");
  });

  it("regenerates MEMORY.md from state.json", async () => {
    await writeFile(
      join(workspaceDir, "state.json"),
      JSON.stringify({
        seed: { perception: "thermal" },
        status: { mood: 50 },
      }),
    );

    await repairWorkspace(workspaceDir);

    const content = await readFile(join(workspaceDir, "MEMORY.md"), "utf-8");
    expect(content).toContain("# MEMORY");
    expect(content).toContain("Hot Memory");
  });

  it("regenerates LANGUAGE.md from state.json language data", async () => {
    await writeFile(
      join(workspaceDir, "state.json"),
      JSON.stringify({
        seed: { perception: "chromatic" },
        status: { mood: 50 },
        language: { level: 2, totalInteractions: 150, uniqueSymbols: ["○", "●", "△"] },
      }),
    );

    await repairWorkspace(workspaceDir);

    const content = await readFile(join(workspaceDir, "LANGUAGE.md"), "utf-8");
    expect(content).toContain("**level**: 2");
    expect(content).toContain("Bridge to Language");
    expect(content).toContain("**totalInteractions**: 150");
    expect(content).toContain("**uniqueSymbols**: 3");
  });

  it("regenerates FORM.md from state.json form data", async () => {
    await writeFile(
      join(workspaceDir, "state.json"),
      JSON.stringify({
        seed: { perception: "geometric" },
        status: { mood: 50 },
        form: { baseForm: "crystal", density: 80, complexity: 60, stability: 70 },
      }),
    );

    await repairWorkspace(workspaceDir);

    const content = await readFile(join(workspaceDir, "FORM.md"), "utf-8");
    expect(content).toContain("**baseForm**: crystal");
    expect(content).toContain("**density**: 80");
  });

  it("creates minimal SOUL.md when missing (even without state.json)", async () => {
    // No state.json at all
    const result = await repairWorkspace(workspaceDir);

    const soulAction = result.actions.find((a) => a.file === "SOUL.md");
    expect(soulAction).toBeDefined();
    expect(soulAction?.action).toBe("created");

    const content = await readFile(join(workspaceDir, "SOUL.md"), "utf-8");
    expect(content).toContain("# SOUL");
    expect(content).toContain("regenerated by repair");
  });

  it("creates HEARTBEAT.md when missing", async () => {
    const result = await repairWorkspace(workspaceDir);

    const hbAction = result.actions.find((a) => a.file === "HEARTBEAT.md");
    expect(hbAction).toBeDefined();

    const content = await readFile(join(workspaceDir, "HEARTBEAT.md"), "utf-8");
    expect(content).toContain("# HEARTBEAT");
    expect(content).toContain("Autonomous Actions");
  });

  it("does not overwrite existing files", async () => {
    await createHealthyWorkspace(workspaceDir);
    const originalSoul = await readFile(join(workspaceDir, "SOUL.md"), "utf-8");

    const result = await repairWorkspace(workspaceDir);

    // SOUL.md should not appear in actions at all (it was never touched)
    const soulAction = result.actions.find((a) => a.file === "SOUL.md");
    expect(soulAction).toBeUndefined();

    // Verify content unchanged
    const afterSoul = await readFile(join(workspaceDir, "SOUL.md"), "utf-8");
    expect(afterSoul).toBe(originalSoul);
  });

  it("reports correct repaired and skipped counts", async () => {
    // Only provide state.json, everything else missing
    await writeFile(
      join(workspaceDir, "state.json"),
      JSON.stringify({
        seed: { perception: "temporal" },
        status: { mood: 50, energy: 50, growthDay: 0 },
      }),
    );

    const result = await repairWorkspace(workspaceDir);

    // Should have created directories + files
    expect(result.repaired).toBeGreaterThan(0);
    expect(result.repaired).toBe(result.actions.filter((a) => a.action === "created").length);
    expect(result.skipped).toBe(result.actions.filter((a) => a.action === "skipped").length);
  });

  it("repair then health-check shows improved status", async () => {
    // Minimal workspace: just SEED.md and state.json
    await writeFile(
      join(workspaceDir, "SEED.md"),
      "# SEED\n- **Perception**: chromatic\n",
    );
    await writeFile(
      join(workspaceDir, "state.json"),
      JSON.stringify({
        seed: { perception: "chromatic" },
        status: { mood: 50, energy: 50, comfort: 50, growthDay: 0, lastInteraction: "never" },
      }),
    );

    // Before repair: missing files and directories
    const beforeReport = await runHealthCheck(workspaceDir, 0);
    const beforeEssential = findCheck(beforeReport, "essential-files");
    expect(beforeEssential?.status).not.toBe("ok");

    // Repair
    await repairWorkspace(workspaceDir);

    // After repair: essential files should be restored
    const afterReport = await runHealthCheck(workspaceDir, 0);
    const afterEssential = findCheck(afterReport, "essential-files");
    expect(afterEssential?.status).toBe("ok");

    // Directories should also be fixed
    const afterDirs = findCheck(afterReport, "directories");
    expect(afterDirs?.status).toBe("ok");
  });

  it("repair uses __state.json as fallback when state.json missing", async () => {
    await writeFile(
      join(workspaceDir, "__state.json"),
      JSON.stringify({
        seed: { perception: "chemical" },
        status: { mood: 33, energy: 77, growthDay: 20 },
      }),
    );

    await repairWorkspace(workspaceDir);

    const content = await readFile(join(workspaceDir, "STATUS.md"), "utf-8");
    expect(content).toContain("**mood**: 33");
    expect(content).toContain("**energy**: 77");
    expect(content).toContain("**day**: 20");
  });

  it("repair without any state.json still creates SOUL.md and HEARTBEAT.md", async () => {
    const result = await repairWorkspace(workspaceDir);

    // Should not have created STATUS.md (no state source)
    const statusAction = result.actions.find((a) => a.file === "STATUS.md");
    expect(statusAction).toBeUndefined();

    // But SOUL.md and HEARTBEAT.md should be created (template-based)
    const soulAction = result.actions.find((a) => a.file === "SOUL.md");
    expect(soulAction?.action).toBe("created");
    const hbAction = result.actions.find((a) => a.file === "HEARTBEAT.md");
    expect(hbAction?.action).toBe("created");
  });
});
