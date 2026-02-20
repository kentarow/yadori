import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runHealthCheck, type HealthReport } from "../../src/health/health-check.js";

async function createHealthyWorkspace(dir: string): Promise<void> {
  await mkdir(join(dir, "memory", "weekly"), { recursive: true });
  await mkdir(join(dir, "memory", "monthly"), { recursive: true });
  await mkdir(join(dir, "diary"), { recursive: true });
  await mkdir(join(dir, "growth", "portraits"), { recursive: true });

  await writeFile(join(dir, "SEED.md"), `# SEED
- **Perception**: chromatic
- **Seed Hash**: abc123
- **Platform**: darwin
- **Architecture**: arm64
`);

  await writeFile(join(dir, "STATUS.md"), `# STATUS

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
`);

  await writeFile(join(dir, "state.json"), JSON.stringify({
    seed: { perception: "chromatic" },
    status: { mood: 65, energy: 50, growthDay: 7 },
  }));

  await writeFile(join(dir, "SOUL.md"), "# SOUL\nPersonality.");
  await writeFile(join(dir, "MEMORY.md"), "# MEMORY\n\nNo recent memories.");
  await writeFile(join(dir, "LANGUAGE.md"), "# LANGUAGE\nLevel 1.");
}

describe("Health Check", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "yadori-health-test-"));
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("reports healthy for a complete workspace", async () => {
    await createHealthyWorkspace(workspaceDir);
    // Use port 0 to skip dashboard check (not running in tests)
    const report = await runHealthCheck(workspaceDir, 0);

    expect(report.entityAlive).toBe(true);
    const essentialCheck = report.checks.find((c) => c.name === "essential-files");
    expect(essentialCheck?.status).toBe("ok");
  });

  it("detects missing workspace", async () => {
    const report = await runHealthCheck("/nonexistent/workspace", 0);

    expect(report.overall).toBe("error");
    const wsCheck = report.checks.find((c) => c.name === "workspace");
    expect(wsCheck?.status).toBe("error");
  });

  it("detects missing SEED.md", async () => {
    await createHealthyWorkspace(workspaceDir);
    const { unlink } = await import("node:fs/promises");
    await unlink(join(workspaceDir, "SEED.md"));

    const report = await runHealthCheck(workspaceDir, 0);
    const filesCheck = report.checks.find((c) => c.name === "essential-files");
    expect(filesCheck?.status).toBe("error");
    expect(filesCheck?.message).toContain("SEED.md");
  });

  it("detects missing state.json", async () => {
    await createHealthyWorkspace(workspaceDir);
    const { unlink } = await import("node:fs/promises");
    await unlink(join(workspaceDir, "state.json"));

    const report = await runHealthCheck(workspaceDir, 0);
    const stateCheck = report.checks.find((c) => c.name === "state-file");
    expect(stateCheck?.status).toBe("error");
  });

  it("warns about entity in distress (low mood + comfort)", async () => {
    await createHealthyWorkspace(workspaceDir);
    await writeFile(join(workspaceDir, "STATUS.md"), `# STATUS

## Current State

- **mood**: 5
- **energy**: 30
- **curiosity**: 20
- **comfort**: 3

## Growth

- **day**: 7
- **last_interaction**: ${new Date().toISOString()}
`);

    const report = await runHealthCheck(workspaceDir, 0);
    const vitalsCheck = report.checks.find((c) => c.name === "entity-vitals");
    expect(vitalsCheck?.status).toBe("warn");
    expect(vitalsCheck?.message).toContain("distress");
  });

  it("warns about never-interacted entity", async () => {
    await createHealthyWorkspace(workspaceDir);
    await writeFile(join(workspaceDir, "STATUS.md"), `# STATUS

## Current State

- **mood**: 50
- **energy**: 50
- **curiosity**: 50
- **comfort**: 50

## Growth

- **day**: 0
- **last_interaction**: never
`);

    const report = await runHealthCheck(workspaceDir, 0);
    const interactionCheck = report.checks.find((c) => c.name === "last-interaction");
    expect(interactionCheck?.status).toBe("warn");
    expect(interactionCheck?.message).toContain("never been spoken to");
  });

  it("checks directory structure", async () => {
    await createHealthyWorkspace(workspaceDir);
    const report = await runHealthCheck(workspaceDir, 0);
    const dirCheck = report.checks.find((c) => c.name === "directories");
    expect(dirCheck?.status).toBe("ok");
  });

  it("warns about missing directories", async () => {
    // Create workspace without subdirectories
    await mkdir(workspaceDir, { recursive: true });
    await writeFile(join(workspaceDir, "SEED.md"), "# SEED\n- **Perception**: chromatic\n- **Seed Hash**: abc");
    await writeFile(join(workspaceDir, "STATUS.md"), "# STATUS\n- **mood**: 50\n- **energy**: 50\n- **comfort**: 50\n- **day**: 0\n- **last_interaction**: never");
    await writeFile(join(workspaceDir, "SOUL.md"), "# SOUL");
    await writeFile(join(workspaceDir, "MEMORY.md"), "# MEMORY");
    await writeFile(join(workspaceDir, "LANGUAGE.md"), "# LANGUAGE");
    await writeFile(join(workspaceDir, "state.json"), "{}");

    const report = await runHealthCheck(workspaceDir, 0);
    const dirCheck = report.checks.find((c) => c.name === "directories");
    expect(dirCheck?.status).toBe("warn");
    expect(dirCheck?.message).toContain("Missing directories");
  });

  it("counts diary entries and weekly summaries", async () => {
    await createHealthyWorkspace(workspaceDir);
    await writeFile(join(workspaceDir, "diary", "2026-02-18.md"), "Day 1");
    await writeFile(join(workspaceDir, "diary", "2026-02-19.md"), "Day 2");
    await writeFile(join(workspaceDir, "memory", "weekly", "2026-W08.md"), "Week 8");

    const report = await runHealthCheck(workspaceDir, 0);
    const memCheck = report.checks.find((c) => c.name === "memory");
    expect(memCheck?.status).toBe("ok");
    expect(memCheck?.message).toContain("2 diary entries");
    expect(memCheck?.message).toContain("1 weekly summaries");
  });

  it("dashboard check warns when not running", async () => {
    await createHealthyWorkspace(workspaceDir);
    // Use a port that's almost certainly not in use
    const report = await runHealthCheck(workspaceDir, 59999);
    const dashCheck = report.checks.find((c) => c.name === "dashboard");
    expect(dashCheck?.status).toBe("warn");
    expect(dashCheck?.message).toContain("not running");
  });

  it("returns all 9 checks", async () => {
    await createHealthyWorkspace(workspaceDir);
    const report = await runHealthCheck(workspaceDir, 0);
    expect(report.checks.length).toBe(9);
  });

  it("overall is ok when all checks pass", async () => {
    await createHealthyWorkspace(workspaceDir);
    const report = await runHealthCheck(workspaceDir, 0);
    // Dashboard won't be running, so we expect at most a warn
    const nonDashboardChecks = report.checks.filter((c) => c.name !== "dashboard");
    const allOk = nonDashboardChecks.every((c) => c.status === "ok");
    expect(allOk).toBe(true);
  });
});
