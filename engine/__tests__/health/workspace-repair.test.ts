import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { repairWorkspace } from "../../src/health/workspace-repair.js";

describe("Workspace Repair", () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), "yadori-repair-test-"));
  });

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true });
  });

  it("creates missing directories", async () => {
    await writeFile(join(workspaceDir, "SEED.md"), "# SEED");

    const result = await repairWorkspace(workspaceDir);

    // Should have created memory/, diary/, growth/ and their subdirs
    const dirActions = result.actions.filter((a) => a.file.endsWith("/"));
    expect(dirActions.length).toBeGreaterThanOrEqual(3);

    // Verify directories exist
    await expect(access(join(workspaceDir, "memory"))).resolves.toBeUndefined();
    await expect(access(join(workspaceDir, "diary"))).resolves.toBeUndefined();
    await expect(access(join(workspaceDir, "growth"))).resolves.toBeUndefined();
  });

  it("regenerates STATUS.md from state.json", async () => {
    await writeFile(join(workspaceDir, "SEED.md"), "# SEED");
    await writeFile(join(workspaceDir, "state.json"), JSON.stringify({
      seed: { perception: "chromatic" },
      status: { mood: 72, energy: 45, curiosity: 80, comfort: 60, growthDay: 14, lastInteraction: "2026-02-19T10:00:00Z" },
    }));

    const result = await repairWorkspace(workspaceDir);

    const statusAction = result.actions.find((a) => a.file === "STATUS.md");
    expect(statusAction?.action).toBe("created");

    const content = await readFile(join(workspaceDir, "STATUS.md"), "utf-8");
    expect(content).toContain("**mood**: 72");
    expect(content).toContain("**energy**: 45");
    expect(content).toContain("**day**: 14");
  });

  it("does not overwrite existing files", async () => {
    await writeFile(join(workspaceDir, "SEED.md"), "# SEED");
    await writeFile(join(workspaceDir, "STATUS.md"), "# Custom STATUS");
    await writeFile(join(workspaceDir, "state.json"), JSON.stringify({
      seed: {}, status: { mood: 99 },
    }));

    await repairWorkspace(workspaceDir);

    const content = await readFile(join(workspaceDir, "STATUS.md"), "utf-8");
    expect(content).toBe("# Custom STATUS");
  });

  it("regenerates SOUL.md if missing", async () => {
    await writeFile(join(workspaceDir, "SEED.md"), "# SEED");

    await repairWorkspace(workspaceDir);

    const content = await readFile(join(workspaceDir, "SOUL.md"), "utf-8");
    expect(content).toContain("# SOUL");
  });

  it("regenerates HEARTBEAT.md if missing", async () => {
    await writeFile(join(workspaceDir, "SEED.md"), "# SEED");

    await repairWorkspace(workspaceDir);

    const content = await readFile(join(workspaceDir, "HEARTBEAT.md"), "utf-8");
    expect(content).toContain("# HEARTBEAT");
  });

  it("regenerates MEMORY.md if missing", async () => {
    await writeFile(join(workspaceDir, "SEED.md"), "# SEED");
    await writeFile(join(workspaceDir, "state.json"), JSON.stringify({
      seed: {}, status: {},
    }));

    await repairWorkspace(workspaceDir);

    const content = await readFile(join(workspaceDir, "MEMORY.md"), "utf-8");
    expect(content).toContain("# MEMORY");
  });

  it("regenerates LANGUAGE.md from state", async () => {
    await writeFile(join(workspaceDir, "SEED.md"), "# SEED");
    await writeFile(join(workspaceDir, "state.json"), JSON.stringify({
      seed: {},
      status: {},
      language: { level: 2, totalInteractions: 42, uniqueSymbols: ["○", "●", "◎"] },
    }));

    await repairWorkspace(workspaceDir);

    const content = await readFile(join(workspaceDir, "LANGUAGE.md"), "utf-8");
    expect(content).toContain("**level**: 2");
    expect(content).toContain("Bridge to Language");
    expect(content).toContain("**totalInteractions**: 42");
  });

  it("regenerates FORM.md from state", async () => {
    await writeFile(join(workspaceDir, "SEED.md"), "# SEED");
    await writeFile(join(workspaceDir, "state.json"), JSON.stringify({
      seed: {},
      status: {},
      form: { baseForm: "crystal", density: 70, complexity: 55, stability: 80 },
    }));

    await repairWorkspace(workspaceDir);

    const content = await readFile(join(workspaceDir, "FORM.md"), "utf-8");
    expect(content).toContain("**baseForm**: crystal");
    expect(content).toContain("**density**: 70");
  });

  it("reports correct repair count", async () => {
    await writeFile(join(workspaceDir, "SEED.md"), "# SEED");
    await writeFile(join(workspaceDir, "state.json"), JSON.stringify({
      seed: {}, status: {},
    }));

    const result = await repairWorkspace(workspaceDir);

    expect(result.repaired).toBeGreaterThan(0);
    expect(result.actions.every((a) => a.action === "created" || a.action === "skipped")).toBe(true);
  });

  it("handles workspace with no state.json gracefully", async () => {
    await writeFile(join(workspaceDir, "SEED.md"), "# SEED");

    // Should still create directories and template files
    const result = await repairWorkspace(workspaceDir);

    expect(result.repaired).toBeGreaterThan(0);
    // SOUL.md and HEARTBEAT.md should be created even without state.json
    const soulAction = result.actions.find((a) => a.file === "SOUL.md");
    expect(soulAction?.action).toBe("created");
  });
});
